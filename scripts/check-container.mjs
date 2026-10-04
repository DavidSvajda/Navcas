import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import https from "node:https";
import http from "node:http";
import assert from "node:assert/strict";
if (process.env.CI !== "true" || process.platform !== "linux")
  throw new Error("Container fixture only runs in isolated Linux CI.");
const suffix = randomBytes(5).toString("hex");
const network = "navcas-check-" + suffix,
  app = network + "-app",
  proxy = network + "-proxy";
const directory = resolve("artifacts/proxy-fixture-" + suffix);
await mkdir(directory, { recursive: true });
const config = `${directory}/Caddyfile`;
await writeFile(
  config,
  `https://demo.example {\n tls internal\n reverse_proxy ${app}:3001\n}\nhttp://demo.example {\n redir https://demo.example{uri} 308\n}\n`,
);
const env = { ...process.env, SESSION_KEY: randomBytes(32).toString("hex") };
async function docker(args) {
  await new Promise((done, reject) => {
    const child = spawn("docker", args, {
      env,
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(new Error("Container operation failed")),
    );
  });
}
const started = [];
try {
  await docker(["network", "create", "--subnet", "172.28.0.0/24", network]);
  started.push("network");
  await docker([
    "run",
    "-d",
    "--name",
    app,
    "--network",
    network,
    "--ip",
    "172.28.0.3",
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "768m",
    "--cpus",
    "2",
    "-e",
    "PUBLIC_DEMO=true",
    "-e",
    "PUBLIC_ORIGIN=https://demo.example",
    "-e",
    "TRUST_PROXY=172.28.0.2",
    "-e",
    "SESSION_KEY",
    process.env.CONTAINER_IMAGE ?? "navcas:ci",
  ]);
  started.push(app);
  await docker([
    "run",
    "-d",
    "--name",
    proxy,
    "--network",
    network,
    "--ip",
    "172.28.0.2",
    "-p",
    "127.0.0.1:8443:443",
    "-p",
    "127.0.0.1:8080:80",
    "-v",
    config + ":/etc/caddy/Caddyfile:ro",
    "caddy:2.10-alpine",
  ]);
  started.push(proxy);
  let ca;
  for (let i = 0; i < 30; i++) {
    try {
      await docker([
        "cp",
        proxy + ":/data/caddy/pki/authorities/local/root.crt",
        directory + "/root.crt",
      ]);
      ca = await readFile(directory + "/root.crt");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  assert.ok(ca, "Test CA was not created");
  const agent = new https.Agent({ ca });
  async function request(path, options = {}) {
    return new Promise((done, reject) => {
      const req = https.request(
        {
          hostname: "127.0.0.1",
          port: 8443,
          servername: "demo.example",
          path,
          agent,
          method: options.method ?? "GET",
          headers: { host: "demo.example", ...options.headers },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            done({ status: res.statusCode, headers: res.headers, body }),
          );
        },
      );
      req.setTimeout(10000, () => req.destroy(new Error("HTTPS timeout")));
      req.on("error", reject);
      req.end(options.body);
    });
  }
  let health;
  for (let i = 0; i < 30; i++) {
    health = await request("/api/health");
    if (health.status === 200) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(health.status, 200);
  const redirected = await new Promise((done, reject) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: 8080,
        path: "/",
        headers: { host: "demo.example" },
      },
      (res) => {
        res.resume();
        done(res);
      },
    );
    req.on("error", reject);
  });
  assert.equal(redirected.statusCode, 308);
  assert.equal(redirected.headers.location, "https://demo.example/");
  const page = await request("/");
  assert.equal(page.status, 200);
  assert.ok(page.body.includes("Navčas"));
  assert.ok(page.headers["strict-transport-security"]);
  const first = await request("/api/v1/workspace");
  assert.equal(first.status, 200);
  const state = JSON.parse(first.body);
  assert.equal(state.mode, "demo");
  const raw = first.headers["set-cookie"][0];
  assert.ok(
    raw.includes("Secure") &&
      raw.includes("HttpOnly") &&
      raw.includes("SameSite=Strict"),
  );
  const cookie = raw.split(";")[0];
  const payload = JSON.stringify({
    expectedVersion: 0,
    scenario: { ...state.scenario, name: "HTTPS saved scenario" },
  });
  const save = await request("/api/v1/scenario", {
    method: "PUT",
    headers: {
      cookie,
      origin: "https://demo.example",
      "x-csrf-token": state.csrfToken,
      "content-type": "application/json",
    },
    body: payload,
  });
  assert.equal(save.status, 200);
  assert.equal(JSON.parse(save.body).scenario.name, "HTTPS saved scenario");
  assert.equal(
    JSON.parse((await request("/api/v1/workspace")).body).version,
    0,
  );
  const forged = await request("/api/v1/scenario", {
    method: "PUT",
    headers: {
      cookie,
      origin: "https://evil.example",
      "x-csrf-token": state.csrfToken,
      "content-type": "application/json",
    },
    body: payload,
  });
  assert.equal(forged.status, 403);
  console.log(
    "Docker HTTPS integration OK: trusted test CA, Caddy proxy, secure session, CSRF, saved scenario and browser isolation.",
  );
  agent.destroy();
} finally {
  for (const name of started.reverse()) {
    try {
      await docker(
        name === "network" ? ["network", "rm", network] : ["rm", "-f", name],
      );
    } catch {}
  }
}
