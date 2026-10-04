import type { Database } from "./database.js";
export async function assertRuntimeDatabase(db: Database) {
  const { rows } = await db.query(`SELECT rolsuper,rolbypassrls,
    has_schema_privilege(current_user,'public','CREATE') AS can_create,
    EXISTS(SELECT 1 FROM pg_roles r WHERE (r.rolsuper OR r.rolbypassrls) AND pg_has_role(current_user,r.oid,'MEMBER')) AS privileged_membership
    FROM pg_roles WHERE rolname=current_user`);
  const role = rows[0];
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.can_create ||
    role.privileged_membership
  )
    throw new Error(
      "Runtime role must not create schema objects or inherit privileged database roles.",
    );
  const tables =
    await db.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
    pg_has_role(current_user,c.relowner,'MEMBER') AS owns_table
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('workspaces','dataset_revisions','audit_events')`);
  if (
    tables.rows.length !== 3 ||
    tables.rows.some(
      (t) => !t.relrowsecurity || !t.relforcerowsecurity || t.owns_table,
    )
  )
    throw new Error(
      "Tenant tables must enforce RLS and be owned by a separate migration role.",
    );
  const version = await db.query(
    "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
  );
  if (version.rows[0]?.version !== 1)
    throw new Error("Database migrations are required before startup.");
}
