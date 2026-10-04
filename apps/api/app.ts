import Fastify, { LogController } from "fastify";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { registerErrors } from "./errors.js";
import { registerSecurity } from "./security.js";
import { registerRoutes } from "./routes.js";
import { WorkspaceService } from "./workspace-service.js";
import type { WorkspaceBackend } from "./workspace-backend.js";
import type { ProductionConfig } from "./config.js";
import { PostgresWorkspace } from "./postgres-workspace.js";
import { registerOidc } from "./oidc.js";
export { csvCell } from "../../packages/contracts/csv.js";
type AppOptions = {
  webRoot?: string;
  rateLimit?: number;
  service?: WorkspaceBackend;
  production?: ProductionConfig;
  /** Only integration tests replace the protocol provider. */
  authRegistrar?: typeof registerOidc;
};
export function createApp(options: AppOptions = {}) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
    trustProxy: options.production?.TRUST_PROXY
      ? options.production.TRUST_PROXY.split(",").map((v) => v.trim())
      : false,
    logger: options.production
      ? { level: "info", redact: ["req.headers", "res.headers", "err"] }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });
  registerErrors(app);
  app.register(async (server) => {
    const service = options.service ?? new WorkspaceService();
    if (options.production && !(service instanceof PostgresWorkspace))
      throw new Error("Production requires PostgreSQL workspace.");
    const production =
      options.production && service instanceof PostgresWorkspace
        ? { config: options.production, db: service.db }
        : undefined;
    await registerSecurity(server, service, options.rateLimit, production);
    registerRoutes(server, service, options.production);
    if (production)
      await (options.authRegistrar ?? registerOidc)(
        server,
        service as PostgresWorkspace,
        production.config,
      );
    if (options.webRoot) {
      await server.register(fastifyStatic, {
        root: options.webRoot,
        dotfiles: "deny",
        index: ["index.html"],
        list: false,
      });
      server.setNotFoundHandler((request, reply) => {
        if (
          request.url.startsWith("/api/") ||
          request.method !== "GET" ||
          request.url.split("?")[0].includes(".")
        )
          return reply
            .code(404)
            .send({ code: "NOT_FOUND", message: "Nenalezeno." });
        return reply.sendFile("index.html");
      });
    }
  });
  return app;
}
