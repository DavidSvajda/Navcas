import { createApp } from "./app.js";

import { existsSync } from "node:fs";
import { CalculationQueue } from "./calculator.js";
import { resolve } from "node:path";
import { productionConfig } from "./config.js";
import { PostgresDatabase } from "./database.js";
import { PostgresWorkspace } from "./postgres-workspace.js";

const webRoot = resolve("dist/web");
const config =
  process.env.NODE_ENV === "production"
    ? productionConfig(process.env)
    : undefined;
const db = config ? new PostgresDatabase(config.DATABASE_URL) : undefined;
if (db) {
  const { rows } = await db.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  if (rows[0].rolsuper || rows[0].rolbypassrls)
    throw new Error("Runtime database role must not bypass RLS.");
  const version = await db.query(
    "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
  );
  if (version.rows[0]?.version !== 1)
    throw new Error("Database migrations are required before startup.");
}
if (config && !existsSync(webRoot))
  throw new Error("Production web build is missing.");
const calculations = config ? new CalculationQueue() : undefined;
const service = db
  ? new PostgresWorkspace(db, calculations!.calculate)
  : undefined;
const app = createApp({
  webRoot: existsSync(webRoot) ? webRoot : undefined,
  production: config,
  service,
});
const maintenance = service
  ? setInterval(
      () =>
        void service
          .cleanup()
          .catch(() => app.log.error("Session cleanup failed")),
      60000,
    )
  : undefined;
maintenance?.unref();
const close = async () => {
  await app.close();
  await calculations?.close();
  if (maintenance) clearInterval(maintenance);
  await db?.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
try {
  await app.listen({
    host: config ? "0.0.0.0" : "127.0.0.1",
    port: config?.PORT ?? 3001,
  });
  console.log(
    config
      ? "Navčas — production server started"
      : "Navčas — lokální ukázka: http://127.0.0.1:3001",
  );
} catch (error) {
  console.error(error);
  process.exit(1);
}
