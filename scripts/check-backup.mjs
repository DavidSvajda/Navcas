import pg from "pg";
import { spawn } from "node:child_process";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
if (process.env.PG_TEST_HOST !== "127.0.0.1" || process.env.CI !== "true")
  throw new Error("Restore fixture only runs against local CI PostgreSQL.");
const source = new URL("postgresql://127.0.0.1/navcas_test");
source.username = "test_owner";
source.password = process.env.PG_TEST_PASSWORD ?? "";
const target = new URL(source);
target.pathname = "/navcas_restore_ci";
const db = new pg.Client({ connectionString: source.href });
const restored = new pg.Client({ connectionString: target.href });
const directory = resolve("artifacts/backup-fixture");
await mkdir(directory, { recursive: true });
await mkdir(directory + "/repo", { recursive: true });
await chmod(directory + "/repo", 0o777);
await writeFile(directory + "/password", randomBytes(32).toString("hex"), {
  mode: 0o644,
});
const env = {
  ...process.env,
  BACKUP_DATABASE_URL: source.href,
  RESTORE_DATABASE_URL: target.href,
  CONFIRM_RESTORE_DATABASE: "navcas_restore_ci",
};
async function container(command, overrides = {}) {
  const variables = { ...env, ...overrides };
  const names = [
    "BACKUP_DATABASE_URL",
    "RESTORE_DATABASE_URL",
    "CONFIRM_RESTORE_DATABASE",
  ];
  await new Promise((done, reject) => {
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "host",
        "--read-only",
        "--tmpfs",
        "/tmp:size=256m,mode=1777",
        "-v",
        directory + "/repo:/repo",
        "-v",
        directory + "/password:/run/secrets/restic-password:ro",
        "-e",
        "RESTIC_REPOSITORY=/repo",
        "-e",
        "RESTIC_PASSWORD_FILE=/run/secrets/restic-password",
        ...names.flatMap((name) => ["-e", name]),
        "navcas-backup:ci",
        command,
      ],
      { env: variables, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(new Error("Backup container failed")),
    );
  });
}
try {
  await db.connect();
  await db.query("CREATE DATABASE navcas_restore_ci");
  await container("init");
  await container("backup");
  await container("check");
  await assert.rejects(
    container("restore-drill", {
      RESTORE_DATABASE_URL: source.href,
      CONFIRM_RESTORE_DATABASE: "navcas_test",
    }),
  );
  await container("restore-drill");
  await restored.connect();
  for (const table of [
    "schema_version",
    "organizations",
    "memberships",
    "workspaces",
    "dataset_revisions",
    "audit_events",
  ]) {
    const query = `SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`;
    assert.deepEqual(
      (await restored.query(query)).rows,
      (await db.query(query)).rows,
      table + " did not restore exactly",
    );
  }
  for (const table of ["sessions", "login_flows", "rate_buckets"])
    assert.equal(
      (await restored.query(`SELECT count(*)::int AS n FROM public.${table}`))
        .rows[0].n,
      0,
    );
  const tables = await restored.query(
    "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('workspaces','dataset_revisions','audit_events')",
  );
  assert.equal(tables.rows.length, 3);
  assert.ok(
    tables.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity),
  );
  await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      ["dist/server/scripts/admin.js", "migrate"],
      {
        env: {
          ...process.env,
          ADMIN_DATABASE_URL: target.href,
          RUNTIME_DATABASE_ROLE: "app_runtime",
        },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? done()
        : reject(new Error("Restored migration grants failed")),
    );
  });
  await restored.query("SET ROLE app_runtime");
  assert.equal(
    (await restored.query("SELECT * FROM workspaces")).rows.length,
    0,
  );
  await restored.query("SELECT set_config('app.tenant',$1,false)", [
    "10000000-0000-4000-8000-000000000001",
  ]);
  const own = (await restored.query("SELECT organization_id FROM workspaces"))
    .rows;
  assert.equal(own.length, 1);
  assert.equal(own[0].organization_id, "10000000-0000-4000-8000-000000000001");
  await assert.rejects(container("restore-drill"));
  console.log(
    "Encrypted backup and restore OK: exact tenant data, RLS, no restored sessions, overwrite refused.",
  );
} finally {
  await restored.end();
  await db.end();
}
