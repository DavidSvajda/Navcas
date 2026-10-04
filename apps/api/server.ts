import { createApp } from "./app.js";

import { existsSync } from "node:fs";
import { CalculationQueue } from "./calculator.js";
import { resolve } from "node:path";
import { productionConfig, publicDemoConfig } from "./config.js";
import { PostgresDatabase } from "./database.js";
import { PostgresWorkspace } from "./postgres-workspace.js";
import { assertRuntimeDatabase } from "./runtime-database.js";

const webRoot = resolve("dist/web");
const publicDemo =
  process.env.NODE_ENV === "production" && process.env.PUBLIC_DEMO === "true"
    ? publicDemoConfig(process.env)
    : undefined;
const config =
  process.env.NODE_ENV === "production" && !publicDemo
    ? productionConfig(process.env)
    : undefined;
const db = config ? new PostgresDatabase(config.DATABASE_URL) : undefined;
if (db) await assertRuntimeDatabase(db);
if ((config || publicDemo) && !existsSync(webRoot))
  throw new Error("Production web build is missing.");
const calculations = config ? new CalculationQueue() : undefined;
const service = db
  ? new PostgresWorkspace(db, calculations!.calculate)
  : undefined;
const app = createApp({
  webRoot: existsSync(webRoot) ? webRoot : undefined,
  production: config,
  service,
  publicDemo,
});
const close = async () => {
  await app.close();
  await calculations?.close();
  await db?.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
try {
  await app.listen({
    host: config || publicDemo ? "0.0.0.0" : "127.0.0.1",
    port: config?.PORT ?? publicDemo?.PORT ?? 3001,
  });
  console.log(
    config
      ? "Navčas — production server started"
      : publicDemo
        ? "Navčas — HTTPS synthetic demo started"
        : "Navčas — lokální ukázka: http://127.0.0.1:3001",
  );
} catch (error) {
  console.error(error);
  process.exit(1);
}
