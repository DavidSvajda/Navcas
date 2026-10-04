import { describe, it, expect } from "vitest";
import { createApp } from "../apps/api/app";
import { publicDemoConfig } from "../apps/api/config";
import { WorkspaceService } from "../apps/api/workspace-service";
const config = publicDemoConfig({
  PUBLIC_ORIGIN: "https://demo.example",
  SESSION_KEY: "2".repeat(64),
  TRUST_PROXY: "127.0.0.1",
});
const headers = { host: "demo.example", "x-forwarded-proto": "https" };
describe("public synthetic demo", () => {
  it("fails closed with customer credentials or unsafe deployment configuration", () => {
    for (const proxy of [
      "0.0.0.0/0",
      "192.168.0.0/16",
      "::/0",
      "999.999.999.999",
      "127.0.0.1/33",
    ])
      expect(() =>
        publicDemoConfig({
          PUBLIC_ORIGIN: "https://demo.example",
          SESSION_KEY: "2".repeat(64),
          TRUST_PROXY: proxy,
        }),
      ).toThrow();
    for (const name of ["DATABASE_URL", "OIDC_ISSUER", "OIDC_CLIENT_SECRET"])
      expect(() =>
        publicDemoConfig({
          PUBLIC_ORIGIN: "https://demo.example",
          SESSION_KEY: "2".repeat(64),
          [name]: "unexpected",
        }),
      ).toThrow();
    expect(() =>
      publicDemoConfig({
        PUBLIC_ORIGIN: "http://demo.example",
        SESSION_KEY: "2".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      publicDemoConfig({
        PUBLIC_ORIGIN: "https://demo.example",
        SESSION_KEY: "2".repeat(64),
        TRUST_PROXY: "true",
      }),
    ).toThrow();
    expect(() =>
      createApp({ publicDemo: config, service: new WorkspaceService() }),
    ).toThrow();
  });
  it("requires HTTPS, exact host and origin; keeps browser workspaces isolated", async () => {
    const app = createApp({ publicDemo: config });
    try {
      expect(
        (
          await app.inject({
            url: "/api/v1/workspace",
            headers: { host: "demo.example" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            url: "/api/v1/workspace",
            headers: { ...headers, host: "evil.example" },
          })
        ).statusCode,
      ).toBe(403);
      const first = await app.inject({ url: "/api/v1/workspace", headers });
      expect(first.statusCode).toBe(200);
      expect(first.json().mode).toBe("demo");
      const cookie = String(first.headers["set-cookie"]).split(";")[0];
      expect(cookie).toMatch(/^__Host-navcas-demo=/);
      expect(first.headers["set-cookie"]).toContain("Secure");
      expect(first.headers["set-cookie"]).toContain("SameSite=Strict");
      const second = await app.inject({ url: "/api/v1/workspace", headers });
      expect(second.json().csrfToken).not.toBe(first.json().csrfToken);
      const payload = {
        expectedVersion: 0,
        scenario: { ...first.json().scenario, name: "Browser A" },
      };
      const saveHeaders = {
        ...headers,
        cookie,
        origin: "https://demo.example",
        "x-csrf-token": first.json().csrfToken,
      };
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/v1/scenario",
            headers: { ...saveHeaders, origin: "https://evil.example" },
            payload,
          })
        ).statusCode,
      ).toBe(403);
      const saved = await app.inject({
        method: "PUT",
        url: "/api/v1/scenario",
        headers: saveHeaders,
        payload,
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().scenario.name).toBe("Browser A");
      expect(
        (
          await app.inject({
            url: "/api/v1/workspace",
            headers: {
              ...headers,
              cookie: String(second.headers["set-cookie"]).split(";")[0],
            },
          })
        ).json().scenario.name,
      ).not.toBe("Browser A");
      expect(
        (await app.inject({ url: "/api/v1/service", headers })).json()
          .secureDemo,
      ).toBe(true);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/v1/input",
            headers: saveHeaders,
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });
});
