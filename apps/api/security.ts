import type { FastifyInstance, FastifyRequest } from "fastify";
import secureSession from "@fastify/secure-session";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";
import { SESSION_TTL_MS } from "./workspace-service.js";
import type { WorkspaceBackend } from "./workspace-backend.js";
import type { ProductionConfig } from "./config.js";
import { postgresRateStore } from "./pg-rate-store.js";
import type { Database } from "./database.js";
declare module "@fastify/secure-session" {
  interface SessionData {
    id: string;
  }
}
export function sessionId(request: FastifyRequest): string {
  const id: unknown = request.session.get("id");
  if (typeof id !== "string")
    throw new HttpError(
      401,
      "SESSION_REQUIRED",
      "Nejprve otevřete pracovní prostor.",
    );
  return id;
}
export async function registerSecurity(
  app: FastifyInstance,
  service: WorkspaceBackend,
  limit = 300,
  production?: { config: ProductionConfig; db: Database },
) {
  await app.register(helmet, {
    global: true,
    hsts: production ? { maxAge: 31536000, includeSubDomains: false } : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(secureSession, {
    cookieName: production ? "__Host-navcas" : "mh_demo",
    key: production
      ? Buffer.from(production.config.SESSION_KEY, "hex")
      : randomBytes(32),
    expiry: SESSION_TTL_MS / 1000,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: production ? "lax" : "strict",
      secure: !!production,
      maxAge: SESSION_TTL_MS / 1000,
    },
  });
  await app.register(rateLimit, {
    max: limit,
    timeWindow: 60_000,
    cache: 1000,
    skipOnError: false,
    ...(production ? { store: postgresRateStore(production.db) } : {}),
    keyGenerator: (request) => request.ip,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
      );
    if (production && request.protocol !== "https")
      throw new HttpError(
        400,
        "HTTPS_REQUIRED",
        "Použijte zabezpečené HTTPS připojení.",
      );
    if (
      production
        ? request.headers.host !== new URL(production.config.PUBLIC_ORIGIN).host
        : !/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(
            request.headers.host ?? "",
          )
    )
      throw new HttpError(403, "HOST_REJECTED", "Nepovolený název serveru.");
    let path: string;
    try {
      path = decodeURIComponent(request.raw.url?.split("?")[0] ?? "/");
    } catch {
      throw new HttpError(400, "INVALID_PATH", "Neplatná adresa.");
    }
    if (
      path.includes("\\") ||
      path.includes("\0") ||
      path
        .split("/")
        .some((p) => p === ".." || p === "." || p.startsWith(".")) ||
      /%2e|%2f|%5c/i.test(path)
    )
      throw new HttpError(400, "INVALID_PATH", "Neplatná adresa.");
    if (!request.url.startsWith("/api/")) return;
    if (request.headers["sec-fetch-site"] === "cross-site")
      throw new HttpError(
        403,
        "CROSS_SITE_REJECTED",
        "Přístup z jiného webu není povolen.",
      );
    const origin = request.headers.origin;
    if (
      origin &&
      !(
        production
          ? [production.config.PUBLIC_ORIGIN]
          : [
              "http://127.0.0.1:5173",
              "http://localhost:5173",
              "http://127.0.0.1:3001",
              "http://localhost:3001",
            ]
      ).includes(origin)
    )
      throw new HttpError(
        403,
        "ORIGIN_REJECTED",
        "Požadavek není z této aplikace.",
      );
  });
  app.addHook("preValidation", async (request) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(request.method) ||
      !request.url.startsWith("/api/")
    )
      return;
    const expected = await service.csrf(sessionId(request));
    const token = request.headers["x-csrf-token"];
    if (
      typeof token !== "string" ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      throw new HttpError(
        403,
        "CSRF_REJECTED",
        "Bezpečnostní ověření vypršelo. Načtěte aktuální verzi.",
      );
  });
}
