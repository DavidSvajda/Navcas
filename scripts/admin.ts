import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../apps/api/database.js";
import { emptyInput } from "../apps/api/postgres-workspace.js";
import { calculatePlan } from "../packages/domain/engine.js";
import { z } from "zod";
const command = process.argv[2];
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "Set ADMIN_DATABASE_URL using a migration/admin role. Do not use this credential in the application.",
  );
const db = new PostgresDatabase(adminUrl);
try {
  if (command === "migrate") {
    await db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(18427891)");
      await sql.query(
        "CREATE TABLE IF NOT EXISTS schema_version(version integer PRIMARY KEY)",
      );
      const version = await sql.query(
        "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
      );
      if (!version.rows.length)
        await sql.query(
          await readFile(resolve("apps/api/migrations/001.sql"), "utf8"),
        );
      else if (version.rows[0].version !== 1)
        throw new Error("Unsupported database schema.");
      const runtimeRole = z
        .string()
        .regex(/^[a-z][a-z0-9_]{0,62}$/)
        .parse(process.env.RUNTIME_DATABASE_ROLE);
      // Identifier is allowlisted; customer values always use parameters.
      await sql.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
      await sql.query(
        `GRANT SELECT ON schema_version,organizations,memberships TO "${runtimeRole}"`,
      );
      await sql.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,login_flows,rate_buckets TO "${runtimeRole}"`,
      );
      await sql.query(`GRANT SELECT,UPDATE ON workspaces TO "${runtimeRole}"`);
      await sql.query(
        `GRANT SELECT,INSERT ON dataset_revisions TO "${runtimeRole}"`,
      );
      await sql.query(`GRANT INSERT ON audit_events TO "${runtimeRole}"`);
      await sql.query(
        `GRANT USAGE ON SEQUENCE audit_events_id_seq TO "${runtimeRole}"`,
      );
    });
    console.log("Schema ready. Runtime grants applied.");
  } else if (command === "provision") {
    const issuer = z.string().url().parse(process.env.OIDC_ISSUER);
    const subject = z
      .string()
      .min(1)
      .max(255)
      .parse(process.env.MEMBER_SUBJECT);
    const role = z
      .enum(["viewer", "planner", "admin"])
      .parse(process.env.MEMBER_ROLE ?? "admin");
    const organizationId = process.env.ORGANIZATION_ID
      ? z.uuid().parse(process.env.ORGANIZATION_ID)
      : randomUUID();
    const name = z
      .string()
      .min(1)
      .max(100)
      .parse(process.env.ORGANIZATION_NAME);
    await db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
        [organizationId, name],
      );
      await sql.query("SELECT set_config('app.tenant',$1,true)", [
        organizationId,
      ]);
      const input = emptyInput(),
        result = calculatePlan(input);
      await sql.query(
        "INSERT INTO workspaces(organization_id,input,baseline,scenario,result) VALUES($1,$2,$3,$4,$3) ON CONFLICT(organization_id) DO NOTHING",
        [
          organizationId,
          JSON.stringify(input),
          JSON.stringify(result),
          JSON.stringify({ name: "Pracovní scénář", orders: [], receipts: [] }),
        ],
      );
      await sql.query(
        "INSERT INTO memberships(issuer,subject,organization_id,role) VALUES($1,$2,$3,$4)",
        [issuer, subject, organizationId, role],
      );
    });
    console.log(`Organization ready: ${organizationId}. Membership granted.`);
  } else if (command === "revoke") {
    const issuer = z.string().url().parse(process.env.OIDC_ISSUER),
      subject = z.string().min(1).parse(process.env.MEMBER_SUBJECT);
    await db.transaction(async (sql) => {
      await sql.query(
        "UPDATE memberships SET active=false WHERE issuer=$1 AND subject=$2",
        [issuer, subject],
      );
      await sql.query("DELETE FROM sessions WHERE issuer=$1 AND subject=$2", [
        issuer,
        subject,
      ]);
    });
    console.log("Membership and sessions revoked.");
  } else
    throw new Error(
      "Usage: admin migrate | provision | revoke. See docs/deployment.md.",
    );
} finally {
  await db.close();
}
