import { afterEach, describe, expect, it } from "vitest";
import { createApp, csvCell } from "../apps/api/app";
import {
  WorkspaceService,
  SESSION_TTL_MS,
} from "../apps/api/workspace-service";
import { resolve } from "node:path";
const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const app = (options: Parameters<typeof createApp>[0] = {}) => {
  const a = createApp(options);
  apps.push(a);
  return a;
};
const scenario = {
  name: "Test",
  orders: [],
  receipts: [{ id: "receipt-1", dueDate: "2026-10-20" }],
};
async function client(a: ReturnType<typeof createApp>) {
  const response = await a.inject("/api/v1/workspace");
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((c) => c.name === "mh_demo")!;
  return {
    state: response.json(),
    headers: {
      cookie: String(response.headers["set-cookie"]).split(";")[0],
      "x-csrf-token": response.json().csrfToken,
    },
    response,
  };
}
describe("API a bezpečnost demonstrátoru", () => {
  it("vrací demo bez cache a nastaví chráněnou šifrovanou relaci", async () => {
    const c = await client(app());
    expect(c.state.mode).toBe("demo");
    expect(c.response.headers["cache-control"]).toBe("no-store");
    const cookie = String(c.response.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Max-Age=7200");
    expect(cookie).not.toContain(c.state.csrfToken);
    expect(c.response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(c.response.headers["content-security-policy"]).not.toContain(
      "unsafe-inline",
    );
    expect(c.response.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("preview nepřepíše uložený scénář", async () => {
    const a = app();
    const c = await client(a);
    const r = await a.inject({
      method: "POST",
      url: "/api/v1/scenarios/preview",
      headers: c.headers,
      payload: scenario,
    });
    expect(r.statusCode).toBe(200);
    const s = (
      await a.inject({ url: "/api/v1/workspace", headers: c.headers })
    ).json();
    expect(s.version).toBe(0);
    expect(s.scenario.receipts).toEqual([]);
  });
  it("chrání souběžné změny a baseline", async () => {
    const a = app();
    const c = await client(a);
    const payload = { expectedVersion: 0, scenario };
    const first = await a.inject({
      method: "PUT",
      url: "/api/v1/scenario",
      headers: c.headers,
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().baseline).toEqual(c.state.baseline);
    expect(
      (
        await a.inject({
          method: "PUT",
          url: "/api/v1/scenario",
          headers: c.headers,
          payload,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("scénáře dvou prohlížečů jsou izolované", async () => {
    const a = app();
    const alice = await client(a),
      bob = await client(a);
    await a.inject({
      method: "PUT",
      url: "/api/v1/scenario",
      headers: alice.headers,
      payload: { expectedVersion: 0, scenario },
    });
    const b = (
      await a.inject({ url: "/api/v1/workspace", headers: bob.headers })
    ).json();
    expect(b.scenario.receipts).toEqual([]);
    expect(b.version).toBe(0);
    expect(b.csrfToken).not.toBe(alice.state.csrfToken);
  });
  it("odmítne podvrženou cookie a token z jiné relace", async () => {
    const a = app();
    const c = await client(a),
      other = await client(a);
    const body = {
      method: "POST" as const,
      url: "/api/v1/scenarios/preview",
      payload: scenario,
    };
    expect(
      (
        await a.inject({
          ...body,
          headers: { ...c.headers, cookie: "mh_demo=attacker-controlled" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await a.inject({
          ...body,
          headers: { ...c.headers, "x-csrf-token": other.state.csrfToken },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("odmítne chybějící CSRF, včetně Unicode tokenu, bez 500", async () => {
    const a = app();
    const c = await client(a);
    for (const token of ["", "ž".repeat(64)]) {
      const r = await a.inject({
        method: "PUT",
        url: "/api/v1/scenario",
        headers: { cookie: c.headers.cookie, "x-csrf-token": token },
        payload: { expectedVersion: 0, scenario },
      });
      expect(r.statusCode).toBe(403);
    }
  });
  it("expired relace odmítne zápis a další načtení ji obnoví", async () => {
    let now = Date.now();
    const service = new WorkspaceService(() => now);
    const a = app({ service });
    const c = await client(a);
    now += SESSION_TTL_MS + 1;
    expect(
      (
        await a.inject({
          method: "PUT",
          url: "/api/v1/scenario",
          headers: c.headers,
          payload: { expectedVersion: 0, scenario },
        })
      ).statusCode,
    ).toBe(401);
    const renewed = (
      await a.inject({ url: "/api/v1/workspace", headers: c.headers })
    ).json();
    expect(renewed.csrfToken).not.toBe(c.state.csrfToken);
  });
  it("omezuje počet aktivních relací", async () => {
    const a = app({ service: new WorkspaceService(Date.now, 1) });
    await client(a);
    expect((await a.inject("/api/v1/workspace")).statusCode).toBe(503);
  });
  it("odmítá neznámé ID, nevalidní datum, pole a duplicity", async () => {
    const a = app();
    const c = await client(a);
    for (const payload of [
      { ...scenario, receipts: [{ id: "unknown", dueDate: null }] },
      { ...scenario, receipts: [{ id: "receipt-1", dueDate: "2026-02-30" }] },
      { ...scenario, organizationId: "cizi" },
      { ...scenario, receipts: [scenario.receipts[0], scenario.receipts[0]] },
    ])
      expect(
        (
          await a.inject({
            method: "POST",
            url: "/api/v1/scenarios/preview",
            headers: c.headers,
            payload,
          })
        ).statusCode,
      ).toBe(400);
  });
  it("nepovolí cizí Origin, cross-site fetch ani DNS rebinding Host", async () => {
    const a = app();
    for (const headers of [
      { origin: "https://evil.example" },
      { "sec-fetch-site": "cross-site" },
      { host: "evil.example:3001" },
    ])
      expect(
        (await a.inject({ url: "/api/v1/workspace", headers })).statusCode,
      ).toBe(403);
  });
  it("limituje požadavky a nevěří X-Forwarded-For", async () => {
    const a = app({ rateLimit: 2 });
    expect((await a.inject("/api/v1/workspace")).statusCode).toBe(200);
    expect((await a.inject("/api/v1/workspace")).statusCode).toBe(200);
    const r = await a.inject({
      url: "/api/v1/workspace",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(r.statusCode).toBe(429);
    expect(r.headers["retry-after"]).toBeDefined();
  });
  it("zastaví příliš velké tělo ještě před výpočtem", async () => {
    const a = app();
    const c = await client(a);
    const r = await a.inject({
      method: "POST",
      url: "/api/v1/scenarios/preview",
      headers: c.headers,
      payload: { ...scenario, name: "x".repeat(70_000) },
    });
    expect(r.statusCode).toBe(413);
  });
  it("export ověří relaci a verzi scénáře", async () => {
    const a = app();
    expect(
      (await a.inject("/api/v1/exports/materials.csv?view=baseline"))
        .statusCode,
    ).toBe(401);
    const c = await client(a);
    const r = await a.inject({
      url: "/api/v1/exports/materials.csv?view=baseline",
      headers: c.headers,
    });
    expect(r.body.startsWith("\uFEFF")).toBe(true);
    expect(r.body).toContain("Čistý deficit");
    expect(
      (
        await a.inject({
          url: "/api/v1/exports/materials.csv?view=scenario&version=1",
          headers: c.headers,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("nepublikuje zdrojové soubory nebo cestu mimo static root", async () => {
    const a = app({ webRoot: resolve("apps/web/public") });
    for (const path of [
      "/.env",
      "/%2e%2e/package.json",
      "/%252e%252e%252fpackage.json",
      "/..%5cpackage.json",
      "/package.json",
      "/apps/api/server.ts",
    ]) {
      const r = await a.inject(path);
      expect([400, 404]).toContain(r.statusCode);
      expect(r.body).not.toContain('materialovy-hlidac"');
      expect(r.body).not.toContain("createApp(");
    }
  });
  it("neutralizuje vzorce v CSV", () => {
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("  @SUM(A1)")).toBe('"\'  @SUM(A1)"');
    expect(csvCell('A"B')).toBe('"A""B"');
  });
  it("nemutuje vnitřní stav přes výstup repository", () => {
    const s = new WorkspaceService();
    const id = s.create();
    const read = s.read(id);
    read.input.stock[0].quantity = "99999";
    expect(s.read(id).input.stock[0].quantity).not.toBe("99999");
  });
});
