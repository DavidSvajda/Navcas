import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const staged = process.argv.includes("--staged");
const excluded = new Set([
  "node_modules",
  ".npm-cache",
  ".git",
  "dist",
  "artifacts",
  "test-results",
  "playwright-report",
  "private-data",
  "secrets",
]);
const extensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".env",
  ".txt",
  ".toml",
]);
const dangerous =
  /(?:^|\/)(?:\.env(?:\..+)?|secret-key[^/]*|[^/]+\.(?:pem|key|p12|pfx|enc))$/i;
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /(?:postgres(?:ql)?|mysql):\/\/[^\s:]+:[^\s@]+@/i,
];
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
try {
  const files = staged
    ? execFileSync(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        { encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean)
    : await walk(".");
  const findings = [];
  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    if (
      (dangerous.test(normalized) && !normalized.endsWith(".env.example")) ||
      /(?:^|\/)(?:private-data|secrets|artifacts)\//.test(normalized)
    ) {
      findings.push(file + ": zakázaný citlivý soubor");
      continue;
    }
    if (
      !extensions.has(path.extname(file)) &&
      !normalized.endsWith(".env.example")
    )
      continue;
    const text = staged
      ? execFileSync("git", ["show", ":" + normalized], {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        })
      : await readFile(file, "utf8");
    if (patterns.some((pattern) => pattern.test(text)))
      findings.push(file + ": možný privátní klíč, token nebo heslo v URL");
  }
  if (findings.length) {
    console.error(findings.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Kontrola zdrojů: nenalezeny podporované vzory tajemství. Obsah tajemství se nevypisuje.",
    );
} catch {
  console.error(
    "Kontrolu tajemství se nepodařilo dokončit. Commit není ověřený.",
  );
  process.exitCode = 1;
}
