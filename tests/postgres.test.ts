import { testDatabase } from "./helpers/postgres";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import type { Database, Sql } from "../apps/api/database";
import { PostgresWorkspace, emptyInput } from "../apps/api/postgres-workspace";
import { calculatePlan } from "../packages/domain/engine";
import { demoInput, emptyScenario } from "../fixtures/demo";
import { productionConfig } from "../apps/api/config";
import { createApp } from "../apps/api/app";
import { postgresRateStore } from "../apps/api/pg-rate-store";
const pg = testDatabase();
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const issuer = "https://identity.example";
const connection = (client: { query: Function }): Sql => ({
  query: async (text, values) => client.query(text, values),
});
const db: Database = {
  query: async (text, values) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE app_runtime");
      return tx.query(text, values);
    }),
  transaction: (fn) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE app_runtime");
      return fn(connection(tx));
    }),
  close: async () => {},
};
let service: PostgresWorkspace,
  admin: string,
  planner: string,
  viewer: string,
  other: string;
beforeAll(async () => {
  await pg.exec(await readFile("apps/api/migrations/001.sql", "utf8"));
  await pg.exec(
    "CREATE ROLE app_runtime NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO app_runtime; GRANT SELECT ON organizations,memberships,schema_version TO app_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,login_flows,rate_buckets TO app_runtime; GRANT SELECT,UPDATE ON workspaces TO app_runtime; GRANT SELECT,INSERT ON dataset_revisions TO app_runtime; GRANT INSERT ON audit_events TO app_runtime; GRANT USAGE ON SEQUENCE audit_events_id_seq TO app_runtime;",
  );
  for (const [id, name] of [
    [a, "Výroba A"],
    [b, "Výroba B"],
  ]) {
    await pg.query("INSERT INTO organizations VALUES($1,$2)", [id, name]);
    const input = emptyInput(),
      result = calculatePlan(input);
    await pg.query(
      "INSERT INTO workspaces(organization_id,input,baseline,scenario,result) VALUES($1,$2,$3,$4,$3)",
      [
        id,
        JSON.stringify(input),
        JSON.stringify(result),
        JSON.stringify(emptyScenario()),
      ],
    );
  }
  for (const [subject, role, org] of [
    ["admin", "admin", a],
    ["planner", "planner", a],
    ["viewer", "viewer", a],
    ["other", "admin", b],
  ])
    await pg.query("INSERT INTO memberships VALUES($1,$2,$3,$4,true)", [
      issuer,
      subject,
      org,
      role,
    ]);
  service = new PostgresWorkspace(db);
  [admin, planner, viewer, other] = await Promise.all(
    ["admin", "planner", "viewer", "other"].map((s) =>
      service.authenticate(issuer, s),
    ),
  );
}, 30000);
afterAll(async () => {
  await pg.close();
});
describe("PostgreSQL authorization, persistence and transactions", () => {
  it("does not auto-provision unknown subjects or accept the wrong issuer", async () => {
    await expect(service.authenticate(issuer, "unknown")).rejects.toMatchObject(
      { statusCode: 403 },
    );
    await expect(
      service.authenticate("https://evil.example", "admin"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.read("guessed-token")).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it("RLS denies all workspace rows without a tenant context", async () => {
    expect((await db.query("SELECT * FROM workspaces")).rows).toHaveLength(0);
    expect(
      (await db.query("SELECT * FROM dataset_revisions")).rows,
    ).toHaveLength(0);
  });
  it("imports live data atomically and keeps immutable revisions", async () => {
    const input = { ...demoInput, revision: "live-1" };
    const before = await service.read(admin);
    const result = await service.import(admin, before.version, input);
    expect(result.mode).toBe("live");
    expect(result.input.revision).toBe("live-1");
    expect(result.importedAt).toBeTruthy();
    expect(result.version).toBe(before.version + 1);
    expect((await service.read(other)).input.revision).toBe("empty");
    expect(
      (
        await pg.query(
          "SELECT * FROM dataset_revisions WHERE organization_id=$1",
          [a],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await pg.query(
          "SELECT action FROM audit_events WHERE organization_id=$1",
          [a],
        )
      ).rows,
    ).toEqual([{ action: "dataset.imported" }]);
  });
  it("a new service instance retains the saved workspace and session", async () => {
    const restarted = new PostgresWorkspace(db);
    expect((await restarted.read(planner)).input.revision).toBe("live-1");
    expect(await restarted.csrf(admin)).toBe(await service.csrf(admin));
  });
  it("viewer cannot save and planner cannot import", async () => {
    const w = await service.read(viewer);
    await expect(
      service.save(viewer, w.version, emptyScenario()),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.import(planner, w.version, {
        ...demoInput,
        revision: "forbidden",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.read(admin)).version).toBe(w.version);
  });
  it("preview does not persist; planner save is visible within the company only", async () => {
    const w = await service.read(planner);
    const scenario = {
      name: "Dodávka později",
      orders: [],
      receipts: [{ id: "receipt-1", dueDate: "2026-10-20" }],
    };
    await service.preview(planner, scenario);
    expect((await service.read(admin)).version).toBe(w.version);
    const saved = await service.save(planner, w.version, scenario);
    expect((await service.read(viewer)).scenario).toEqual(scenario);
    expect((await service.read(other)).version).toBe(0);
    expect(saved.version).toBe(w.version + 1);
    await expect(
      service.save(admin, w.version, emptyScenario()),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("duplicate revisions, stale imports and invalid references roll back", async () => {
    const w = await service.read(admin);
    await expect(
      service.import(admin, w.version, { ...demoInput, revision: "live-1" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.import(admin, w.version - 1, { ...demoInput, revision: "stale" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.import(admin, w.version, {
        ...demoInput,
        revision: "bad",
        stock: [{ itemId: "missing", quantity: "1" }],
      }),
    ).rejects.toThrow();
    expect((await service.read(admin)).version).toBe(w.version);
    expect(
      (await pg.query("SELECT * FROM dataset_revisions WHERE revision='bad'"))
        .rows,
    ).toHaveLength(0);
  });
  it("new import invalidates prior scenario versions and resets the scenario", async () => {
    const w = await service.read(admin);
    const changed = await service.import(admin, w.version, {
      ...demoInput,
      revision: "live-2",
    });
    expect(changed.scenario.orders).toEqual([]);
    expect(changed.scenario.receipts).toEqual([]);
    await expect(
      service.save(planner, w.version, w.scenario),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("SQL-looking text is stored as data and does not execute", async () => {
    const w = await service.read(admin);
    const name = "'; DROP TABLE organizations; --";
    await service.save(planner, w.version, { name, orders: [], receipts: [] });
    expect((await service.read(admin)).scenario.name).toBe(name);
    expect((await pg.query("SELECT * FROM organizations")).rows).toHaveLength(
      2,
    );
  });
  it("tenant context cannot leak out of its transaction", async () => {
    await service.read(admin);
    expect((await db.query("SELECT * FROM workspaces")).rows).toHaveLength(0);
    await expect(
      db.transaction(async (sql) => {
        await sql.query("SELECT set_config('app.tenant',$1,true)", [a]);
        await sql.query(
          "UPDATE workspaces SET version=777 WHERE organization_id=$1",
          [a],
        );
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect((await service.read(admin)).version).not.toBe(777);
  });
  it("runtime role cannot edit memberships or overwrite revision history", async () => {
    await expect(
      db.query("UPDATE memberships SET role='admin'"),
    ).rejects.toThrow();
    await expect(db.query("DELETE FROM dataset_revisions")).rejects.toThrow();
  });
  it("shared limiter increments atomically across store instances", async () => {
    const Store = postgresRateStore(db),
      first = new Store(),
      second = new Store();
    const increment = (store: InstanceType<typeof Store>) =>
      new Promise<number>((resolve, reject) =>
        store.incr(
          "127.0.0.8",
          (e, r) => (e ? reject(e) : resolve(r!.current)),
          60000,
        ),
      );
    expect(await increment(first)).toBe(1);
    expect(await increment(second)).toBe(2);
    expect(await increment(first.child({ path: "/another", prefix: "" }))).toBe(
      1,
    );
  });
  it("expired, logged out and disabled memberships lose access immediately", async () => {
    const temp = await service.authenticate(issuer, "planner");
    await service.revoke(temp);
    expect(await service.has(temp)).toBe(false);
    await pg.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE subject='viewer'",
    );
    expect(await service.has(viewer)).toBe(false);
    await pg.query("UPDATE memberships SET active=false WHERE subject='other'");
    await expect(service.read(other)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
  it("production configuration fails closed without leaking secrets", () => {
    expect(() =>
      productionConfig({ DATABASE_URL: "secret-password-value" }),
    ).toThrow("Produkční konfigurace");
    try {
      productionConfig({ DATABASE_URL: "secret-password-value" });
    } catch (e) {
      expect(String(e)).not.toContain("secret-password-value");
    }
  });
  it("production API requires login, HTTPS, exact origin and a Secure cookie", async () => {
    const config = productionConfig({
      PUBLIC_ORIGIN: "https://app.example",
      DATABASE_URL: "postgresql://localhost/test",
      SESSION_KEY: "ab".repeat(32),
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "test",
      OIDC_CLIENT_SECRET: "test-client-secret-value",
      OPERATOR_NAME: "Test operator",
      OPERATOR_ADDRESS: "Test address",
      OPERATOR_ICO: "12345678",
      OPERATOR_EMAIL: "test@example.com",
      PRIVACY_URL: "https://app.example/privacy",
      TERMS_URL: "https://app.example/terms",
      TRUST_PROXY: "127.0.0.1",
    });
    const app = createApp({
      production: config,
      service,
      authRegistrar: async (server, s) => {
        server.get("/test/login", async (req) => {
          req.session.set("id", await s.authenticate(issuer, "admin"));
          return { ok: true };
        });
      },
    });
    try {
      const headers = { host: "app.example", "x-forwarded-proto": "https" };
      expect(
        (await app.inject({ url: "/api/v1/workspace", headers })).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            url: "/api/v1/service",
            headers: { host: "app.example" },
          })
        ).statusCode,
      ).toBe(400);
      const login = await app.inject({ url: "/test/login", headers });
      const cookie = String(login.headers["set-cookie"]);
      expect(cookie).toContain("__Host-navcas=");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
      const authenticated = { ...headers, cookie: cookie.split(";")[0] };
      const w = await app.inject({
        url: "/api/v1/workspace",
        headers: authenticated,
      });
      expect(w.statusCode).toBe(200);
      expect(w.headers["strict-transport-security"]).toContain("max-age");
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/v1/scenario",
            headers: authenticated,
            payload: {
              expectedVersion: w.json().version,
              scenario: emptyScenario(),
            },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/imports/preview",
            headers: { ...authenticated, "x-csrf-token": w.json().csrfToken },
            payload: { expectedVersion: w.json().version, input: demoInput },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/v1/input",
            headers: {
              ...authenticated,
              "x-csrf-token": w.json().csrfToken,
              origin: "https://evil.example",
            },
            payload: { expectedVersion: w.json().version, input: demoInput },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
