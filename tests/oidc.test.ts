import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { customFetch, type CustomFetch } from "openid-client";
import { readFile } from "node:fs/promises";
import { createApp } from "../apps/api/app";
import { productionConfig } from "../apps/api/config";
import { registerOidc } from "../apps/api/oidc";
import { testDatabase } from "./helpers/postgres";
import { PostgresWorkspace, emptyInput } from "../apps/api/postgres-workspace";
import { calculatePlan } from "../packages/domain/engine";
import type { Database } from "../apps/api/database";
const pg = testDatabase();
const db: Database = {
  query: (text, values) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE oidc_runtime");
      return tx.query(text, values);
    }),
  transaction: (fn) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE oidc_runtime");
      return fn(tx);
    }),
  close: async () => {},
};
const issuer = "https://identity.example/";
const origin = "https://navcas.example";
const secret = "fixture-client-secret-not-a-credential";
const config = productionConfig({
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: "postgresql://localhost/navcas",
  SESSION_KEY: "1".repeat(64),
  OIDC_ISSUER: issuer,
  OIDC_CLIENT_ID: "navcas-test",
  OIDC_CLIENT_SECRET: secret,
  OPERATOR_NAME: "Test operator",
  OPERATOR_ADDRESS: "Test address",
  OPERATOR_ICO: "00000000",
  OPERATOR_EMAIL: "test@example.com",
  PRIVACY_URL: origin + "/privacy",
  TERMS_URL: origin + "/terms",
  TRUST_PROXY: "127.0.0.1",
});
const headers = { host: "navcas.example", "x-forwarded-proto": "https" };
const orgs = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
];
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let service: PostgresWorkspace;
const codes = new Map<
  string,
  { subject: string; challenge: string; nonce: string; fault?: string }
>();
let serial = 0;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
// Only network transport is replaced. Discovery, PKCE, JWT signature and claims use openid-client unchanged.
const provider: CustomFetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/.well-known/openid-configuration"))
    return json({
      issuer,
      authorization_endpoint: issuer + "authorize",
      token_endpoint: issuer + "token",
      jwks_uri: issuer + "jwks",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    });
  if (url === issuer + "jwks")
    return json({
      keys: [
        {
          ...(await exportJWK(keys.publicKey)),
          kid: "test",
          use: "sig",
          alg: "RS256",
        },
      ],
    });
  if (url === issuer + "token") {
    const body = new URLSearchParams(String(init?.body));
    const code = codes.get(body.get("code") ?? "");
    codes.delete(body.get("code") ?? "");
    const verifier = body.get("code_verifier") ?? "";
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url");
    if (
      !code ||
      hash !== code.challenge ||
      body.get("client_secret") !== secret ||
      body.get("redirect_uri") !== origin + "/auth/callback"
    )
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    const key =
      code.fault === "signature"
        ? (await generateKeyPair("RS256")).privateKey
        : keys.privateKey;
    const token = await new SignJWT({
      nonce: code.fault === "nonce" ? "wrong" : code.nonce,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject(code.subject)
      .setIssuer(code.fault === "issuer" ? "https://evil.example/" : issuer)
      .setAudience(
        code.fault === "audience" ? "another-client" : config.OIDC_CLIENT_ID,
      )
      .setIssuedAt()
      .setExpirationTime(code.fault === "expired" ? "-10m" : "5m")
      .sign(key);
    return json({
      access_token: "fixture-access-token",
      token_type: "Bearer",
      expires_in: 300,
      id_token: token,
    });
  }
  throw new Error("Unexpected provider endpoint");
};
const app = createApp({
  production: config,
  service: new PostgresWorkspace(db),
  rateLimit: 10000,
  authRegistrar: (server, workspace, cfg) =>
    registerOidc(server, workspace, cfg, { [customFetch]: provider }),
});
const cookieFrom = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers["set-cookie"];
  const cookies = Array.isArray(value) ? value : [value];
  return (
    cookies
      .find(
        (v): v is string =>
          typeof v === "string" && v.startsWith("__Host-navcas="),
      )
      ?.split(";")[0] ?? ""
  );
};
async function begin(subject = "alpha", fault?: string) {
  const login = await app.inject({
    url: "/auth/login",
    headers: { ...headers, "x-forwarded-for": `192.0.2.${serial + 1}` },
  });
  expect(login.statusCode).toBe(302);
  const authorize = new URL(String(login.headers.location));
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  const code = "code-" + ++serial;
  codes.set(code, {
    subject,
    challenge: authorize.searchParams.get("code_challenge")!,
    nonce: authorize.searchParams.get("nonce")!,
    fault,
  });
  return {
    cookie: cookieFrom(login),
    state: authorize.searchParams.get("state")!,
    code,
  };
}
async function callback(flow: Awaited<ReturnType<typeof begin>>) {
  return app.inject({
    url:
      "/auth/callback?" +
      new URLSearchParams({ code: flow.code, state: flow.state }),
    headers: { ...headers, cookie: flow.cookie },
  });
}
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  await pg.exec(await readFile("apps/api/migrations/001.sql", "utf8"));
  await pg.exec(
    "CREATE ROLE oidc_runtime NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO oidc_runtime; GRANT SELECT ON organizations,memberships,schema_version TO oidc_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,login_flows,rate_buckets TO oidc_runtime; GRANT SELECT,UPDATE ON workspaces TO oidc_runtime; GRANT SELECT,INSERT ON dataset_revisions TO oidc_runtime; GRANT INSERT ON audit_events TO oidc_runtime; GRANT USAGE ON SEQUENCE audit_events_id_seq TO oidc_runtime;",
  );
  const input = emptyInput(),
    result = calculatePlan(input);
  for (let i = 0; i < orgs.length; i++) {
    await pg.query("INSERT INTO organizations VALUES($1,$2)", [
      orgs[i],
      "Company " + i,
    ]);
    await pg.query("INSERT INTO memberships VALUES($1,$2,$3,'admin',true)", [
      issuer,
      i ? "beta" : "alpha",
      orgs[i],
    ]);
    await pg.query(
      "INSERT INTO workspaces(organization_id,input,baseline,scenario,result) VALUES($1,$2,$3,$4,$3)",
      [
        orgs[i],
        JSON.stringify(input),
        JSON.stringify(result),
        JSON.stringify({ name: "Plan", orders: [], receipts: [] }),
      ],
    );
  }
  service = new PostgresWorkspace(db);
  await app.ready();
}, 30000);
afterAll(async () => {
  await app.close();
  await pg.close();
});
describe("OIDC authorization code protocol", () => {
  it("validates signed login, rotates cookies and isolates two organizations", async () => {
    const flowA = await begin();
    const resultA = await callback(flowA);
    expect(resultA.statusCode).toBe(302);
    const cookieA = cookieFrom(resultA);
    expect(cookieA).not.toBe(flowA.cookie);
    expect(resultA.headers["set-cookie"]).toContain("Secure");
    const resultB = await callback(await begin("beta"));
    expect(resultB.statusCode).toBe(302);
    const workspaceA = await app.inject({
      url: "/api/v1/workspace",
      headers: { ...headers, cookie: cookieA },
    });
    const workspaceB = await app.inject({
      url: "/api/v1/workspace",
      headers: { ...headers, cookie: cookieFrom(resultB) },
    });
    expect(workspaceA.json().organizationName).toBe("Company 0");
    expect(workspaceB.json().organizationName).toBe("Company 1");
    expect(
      (
        await app.inject({
          url: "/api/v1/workspace",
          headers: { ...headers, cookie: flowA.cookie },
        })
      ).statusCode,
    ).toBe(401);
    const replay = await callback(flowA);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe("LOGIN_REPLAY");
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/logout",
      headers: {
        ...headers,
        origin,
        cookie: cookieA,
        "x-csrf-token": workspaceA.json().csrfToken,
      },
    });
    expect(logout.statusCode).toBe(204);
    expect(
      (
        await app.inject({
          url: "/api/v1/workspace",
          headers: { ...headers, cookie: cookieA },
        })
      ).statusCode,
    ).toBe(401);
  });
  it.each(["signature", "nonce", "issuer", "audience", "expired"])(
    "rejects an invalid %s token and creates no session",
    async (fault) => {
      const before = await pg.query(
        "SELECT count(*)::int AS total FROM sessions",
      );
      const result = await callback(await begin("alpha", fault));
      expect(result.statusCode).toBe(401);
      expect(result.json().code).toBe("LOGIN_FAILED");
      expect(
        (await pg.query("SELECT count(*)::int AS total FROM sessions")).rows,
      ).toEqual(before.rows);
    },
  );
  it("rejects an altered state before exchanging the code", async () => {
    const flow = await begin();
    const result = await callback({ ...flow, state: "wrong-state" });
    expect(result.statusCode).toBe(401);
    expect(codes.has(flow.code)).toBe(true);
  });
  it("rejects unknown or revoked users despite a valid provider token", async () => {
    expect((await callback(await begin("stranger"))).statusCode).toBe(403);
    await pg.query("UPDATE memberships SET active=false WHERE subject='beta'");
    expect((await callback(await begin("beta"))).statusCode).toBe(403);
  });
  it("requires a login cookie and CSRF for logout", async () => {
    const result = await callback(await begin());
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/logout",
          headers: { ...headers, cookie: cookieFrom(result) },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/auth/callback?code=guessed&state=guessed",
          headers,
        })
      ).statusCode,
    ).toBe(401);
  });
});
