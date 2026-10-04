import assert from "node:assert/strict";
const url = new URL(process.argv[2] ?? "");
if (
  url.protocol !== "https:" ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
)
  throw new Error("Pass an HTTPS origin without credentials or a path.");
async function get(path) {
  const response = await fetch(new URL(path, url), {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  return response;
}
const http = new URL(url);
http.protocol = "http:";
const redirect = await fetch(http, {
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
assert.ok(
  [301, 302, 307, 308].includes(redirect.status),
  "HTTP must redirect to HTTPS",
);
assert.equal(
  new URL(redirect.headers.get("location"), http).origin,
  url.origin,
  "HTTP redirect must keep the exact origin",
);
const page = await get("/");
assert.equal(page.status, 200);
assert.ok(page.headers.get("strict-transport-security"));
assert.ok(
  page.headers
    .get("content-security-policy")
    ?.includes("frame-ancestors 'none'"),
);
const health = await get("/api/health"),
  ready = await get("/api/ready");
assert.equal(health.status, 200);
assert.equal(ready.status, 200);
const info = await (await get("/api/v1/service")).json();
const workspace = await get("/api/v1/workspace");
if (info.mode === "live") {
  assert.equal(
    workspace.status,
    401,
    "Anonymous callers must not read customer data",
  );
  const login = await get("/auth/login");
  assert.equal(login.status, 302);
  assert.equal(new URL(login.headers.get("location")).protocol, "https:");
} else {
  assert.equal(info.secureDemo, true);
  assert.equal(workspace.status, 200);
  const cookie = workspace.headers.get("set-cookie");
  assert.ok(cookie?.startsWith("__Host-navcas-demo="));
  assert.ok(
    cookie.includes("Secure") &&
      cookie.includes("HttpOnly") &&
      cookie.includes("SameSite=Strict"),
  );
}
console.log(
  "Public HTTPS checks passed. Interactive provider login, phone and customer data acceptance remain separate checks.",
);
