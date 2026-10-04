import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  writeFile,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const backupTables = [
  "schema_version",
  "organizations",
  "memberships",
  "workspaces",
  "dataset_revisions",
  "audit_events",
  "sessions",
  "login_flows",
  "rate_buckets",
];
const transientTables = ["sessions", "login_flows", "rate_buckets"];
export function connectionEnvironment(url: string, env: NodeJS.ProcessEnv) {
  const parsed = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.pathname.slice(1)
  )
    throw new Error("Invalid PostgreSQL configuration.");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
    parsed.searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error("Remote PostgreSQL requires verified TLS.");
  const clean = { ...env };
  for (const name of Object.keys(clean))
    if (name.startsWith("PG")) delete clean[name];
  clean.PGDATABASE = decodeURIComponent(parsed.pathname.slice(1));
  clean.PGHOST = parsed.hostname.replace(/^\[|\]$/g, "");
  clean.PGPORT = parsed.port || "5432";
  clean.PGUSER = decodeURIComponent(parsed.username);
  clean.PGPASSWORD = decodeURIComponent(parsed.password);
  const parameters: Record<string, string> = {
    sslmode: "PGSSLMODE",
    sslrootcert: "PGSSLROOTCERT",
    channel_binding: "PGCHANNELBINDING",
  };
  for (const [name, value] of parsed.searchParams) {
    if (!parameters[name])
      throw new Error("Unsupported PostgreSQL connection parameter.");
    clean[parameters[name]] = value;
  }
  clean.PGCONNECT_TIMEOUT = "10";
  clean.PGAPPNAME = "navcas-backup";
  return clean;
}
async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export function dumpArguments(file: string) {
  return [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--lock-wait-timeout=30s",
    "--file",
    file,
    ...backupTables.map((table) => "--table=public." + table),
    ...transientTables.map((table) => "--exclude-table-data=public." + table),
  ];
}
export function safeRestoreTarget(
  source: string,
  target: string,
  confirmation: string | undefined,
) {
  const a = new URL(source),
    b = new URL(target);
  if (
    a.hostname === b.hostname &&
    (a.port || "5432") === (b.port || "5432") &&
    decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname)
  )
    throw new Error("Restore must use a separate disposable database.");
  if (
    confirmation !== b.pathname.slice(1) ||
    !/^navcas_restore_[a-z0-9_]+$/.test(confirmation)
  )
    throw new Error("Confirm the disposable database name navcas_restore_*.");
}
async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "ignore", "ignore"],
      shell: false,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Operation timed out."));
    }, 30 * 60_000);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error(command + " could not start."));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0
        ? done()
        : reject(new Error(command + " failed; no backup success recorded."));
    });
  });
}
async function main() {
  const command = process.argv[2];
  const source = process.env.BACKUP_DATABASE_URL;
  if (!source) throw new Error("BACKUP_DATABASE_URL is required.");
  const sourceEnv = connectionEnvironment(source, process.env);
  const repository = process.env.RESTIC_REPOSITORY;
  if (
    !repository ||
    !/^(s3:https:\/\/|\/)/.test(repository) ||
    !process.env.RESTIC_PASSWORD_FILE
  )
    throw new Error(
      "Set an HTTPS S3 repository (or local test repository) and RESTIC_PASSWORD_FILE.",
    );
  const staging = await mkdtemp(join(tmpdir(), "navcas-backup-"));
  await chmod(staging, 0o700);
  try {
    const dump = join(staging, "navcas.dump");
    if (command === "init") {
      await run("restic", ["init"], process.env);
      console.log("Encrypted backup repository initialized.");
    } else if (command === "backup") {
      await run("pg_dump", dumpArguments(dump), sourceEnv);
      await run("pg_restore", ["--list", dump], sourceEnv);
      await writeFile(
        join(staging, "manifest.json"),
        JSON.stringify({
          format: 1,
          createdAt: new Date().toISOString(),
          sha256: await digest(dump),
          bytes: (await stat(dump)).size,
          transientDataExcluded: transientTables,
        }),
        { mode: 0o600 },
      );
      // Stable path inside snapshots makes restoration independent of random staging directories.
      const stable = join(staging, "bundle");
      await mkdir(stable);
      const { rename } = await import("node:fs/promises");
      await rename(dump, join(stable, "navcas.dump"));
      await rename(
        join(staging, "manifest.json"),
        join(stable, "manifest.json"),
      );
      await run(
        "restic",
        ["backup", "--tag", "navcas-v1", "--host", "navcas", stable],
        process.env,
      );
      console.log(
        "Encrypted Navcas snapshot stored successfully. Restore drill is still required.",
      );
    } else if (command === "restore-drill") {
      const target = process.env.RESTORE_DATABASE_URL;
      if (!target) throw new Error("RESTORE_DATABASE_URL is required.");
      safeRestoreTarget(source, target, process.env.CONFIRM_RESTORE_DATABASE);
      const targetEnv = connectionEnvironment(target, process.env);
      // Never clean/drop an existing database, even when the confirmation was supplied.
      await run(
        "psql",
        [
          "-X",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')) THEN RAISE EXCEPTION 'Restore database is not empty'; END IF; END $$;",
        ],
        targetEnv,
      );
      const snapshot = process.env.RESTORE_SNAPSHOT ?? "latest";
      if (snapshot !== "latest" && !/^[a-f0-9]{8,64}$/.test(snapshot))
        throw new Error("Invalid snapshot id.");
      await run(
        "restic",
        [
          "restore",
          snapshot,
          "--tag",
          "navcas-v1",
          "--host",
          "navcas",
          "--target",
          staging,
        ],
        process.env,
      );
      const { readdir } = await import("node:fs/promises");
      async function findBundle(dir: string): Promise<string[]> {
        const matches: string[] = [];
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.isSymbolicLink())
            throw new Error("Unexpected backup symlink.");
          const path = join(dir, entry.name);
          if (entry.isDirectory()) matches.push(...(await findBundle(path)));
          else if (entry.name === "navcas.dump") matches.push(dir);
        }
        return matches;
      }
      const bundles = await findBundle(staging);
      if (bundles.length !== 1) throw new Error("Invalid backup bundle.");
      const file = join(bundles[0], "navcas.dump");
      const manifest = JSON.parse(
        await readFile(join(bundles[0], "manifest.json"), "utf8"),
      );
      if (
        manifest.format !== 1 ||
        (await stat(file)).size !== manifest.bytes ||
        (await digest(file)) !== manifest.sha256
      )
        throw new Error("Backup integrity verification failed.");
      await run(
        "pg_restore",
        [
          "--exit-on-error",
          "--single-transaction",
          "--no-owner",
          "--no-acl",
          "--dbname",
          targetEnv.PGDATABASE!,
          file,
        ],
        targetEnv,
      );
      console.log(
        "Restore completed into the isolated database. Run migration grants and tenant acceptance checks before recovery.",
      );
    } else if (command === "check") {
      await run("restic", ["check", "--read-data"], process.env);
      console.log("Encrypted repository and stored data verified.");
    } else
      throw new Error("Usage: backup init | backup | restore-drill | check");
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    console.error(
      "Backup operation failed. Check configuration, permissions, capacity and connectivity. No credentials logged.",
    );
    process.exitCode = 1;
  });
