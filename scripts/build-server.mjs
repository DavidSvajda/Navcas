import { build } from "esbuild";
await build({
  entryPoints: [
    "apps/api/server.ts",
    "apps/api/calculation-worker.ts",
    "apps/api/calculator.ts",
    "scripts/admin.ts",
    "scripts/backup.ts",
  ],
  outdir: "dist/server",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: false,
});
