CREATE TABLE IF NOT EXISTS schema_version (version integer PRIMARY KEY);
CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100));
-- A subject belongs to one organization in this first release. No email-based auto-enrollment.
CREATE TABLE memberships (
  issuer text NOT NULL, subject text NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id),
  role text NOT NULL CHECK(role IN ('viewer','planner','admin')), active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(issuer, subject)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL,
  csrf text NOT NULL, expires_at timestamptz NOT NULL,
  FOREIGN KEY(issuer,subject) REFERENCES memberships(issuer,subject) ON DELETE CASCADE
);
CREATE INDEX ON sessions(expires_at);
CREATE TABLE login_flows (id text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE workspaces (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id),
  input jsonb NOT NULL, baseline jsonb NOT NULL, scenario jsonb NOT NULL, result jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0, saved_at timestamptz, imported_at timestamptz,
  CHECK(version >= 0)
);
CREATE TABLE dataset_revisions (
  organization_id uuid NOT NULL REFERENCES organizations(id), revision text NOT NULL,
  input jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id, revision)
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id), subject text NOT NULL,
  action text NOT NULL, version integer NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_events(organization_id,occurred_at);
CREATE TABLE rate_buckets (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE INDEX ON rate_buckets(expires_at);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_workspace ON workspaces USING(organization_id::text = current_setting('app.tenant', true)) WITH CHECK(organization_id::text = current_setting('app.tenant', true));
ALTER TABLE dataset_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_dataset ON dataset_revisions USING(organization_id::text = current_setting('app.tenant', true)) WITH CHECK(organization_id::text = current_setting('app.tenant', true));
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_audit ON audit_events USING(organization_id::text = current_setting('app.tenant', true)) WITH CHECK(organization_id::text = current_setting('app.tenant', true));
INSERT INTO schema_version(version) VALUES(1);
