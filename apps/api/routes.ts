import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scenarioSchema, inputSchema } from "../../packages/contracts/index.js";
import { csv } from "../../packages/contracts/csv.js";
import { sessionId } from "./security.js";
import type { WorkspaceBackend } from "./workspace-backend.js";
import type { ProductionConfig } from "./config.js";
import { calculatePlan } from "../../packages/domain/engine.js";
import { HttpError } from "./errors.js";
export function registerRoutes(
  app: FastifyInstance,
  service: WorkspaceBackend,
  production?: ProductionConfig,
) {
  app.get(
    "/api/health",
    { config: { rateLimit: { max: 120, timeWindow: 60_000 } } },
    async () => ({ status: "ok", mode: production ? "live" : "demo" }),
  );
  app.get("/api/v1/service", async () => ({
    mode: production ? "live" : "demo",
    loginUrl: production ? "/auth/login" : null,
    operator: production
      ? {
          name: production.OPERATOR_NAME,
          address: production.OPERATOR_ADDRESS,
          ico: production.OPERATOR_ICO,
          email: production.OPERATOR_EMAIL,
          privacyUrl: production.PRIVACY_URL,
          termsUrl: production.TERMS_URL,
        }
      : null,
  }));
  app.get("/api/ready", async (_request, reply) => {
    if (production && "db" in service) {
      try {
        await (
          service as import("./postgres-workspace.js").PostgresWorkspace
        ).db.query("SELECT 1");
      } catch {
        return reply.code(503).send({ status: "unavailable" });
      }
    }
    return { status: "ready" };
  });
  app.get("/api/v1/workspace", async (request) => {
    let id: unknown = request.session.get("id");
    if (!(await service.has(id))) {
      id = await service.create();
      request.session.regenerate();
      request.session.set("id", id as string);
    }
    return service.read(id as string);
  });
  app.post(
    "/api/v1/scenarios/preview",
    { config: { rateLimit: { max: 60, timeWindow: 60_000 } } },
    async (request) => ({
      result: await service.preview(
        sessionId(request),
        scenarioSchema.parse(request.body),
      ),
    }),
  );
  app.put(
    "/api/v1/scenario",
    { config: { rateLimit: { max: 30, timeWindow: 60_000 } } },
    async (request) => {
      const body = z
        .object({
          expectedVersion: z.number().int().nonnegative(),
          scenario: scenarioSchema,
        })
        .strict()
        .parse(request.body);
      return service.save(
        sessionId(request),
        body.expectedVersion,
        body.scenario,
      );
    },
  );
  app.get(
    "/api/v1/exports/materials.csv",
    { config: { rateLimit: { max: 15, timeWindow: 60_000 } } },
    async (request, reply) => {
      const { view, version } = z
        .object({
          view: z.enum(["baseline", "scenario"]).default("baseline"),
          version: z.coerce.number().int().nonnegative().optional(),
        })
        .strict()
        .parse(request.query);
      const workspace = await service.read(sessionId(request));
      if (view === "scenario" && version !== workspace.version)
        return reply.code(409).send({
          code: "EXPORT_VERSION_CONFLICT",
          message:
            "Uložený scénář se změnil. Načtěte aktuální verzi před exportem.",
          requestId: request.id,
        });
      const plan =
        view === "scenario" ? workspace.scenarioResult : workspace.baseline;
      const items = new Map(
        workspace.input.items.map((item) => [item.id, item]),
      );
      const columns = [
        "Materiál",
        "Název",
        "Jednotka",
        "Potřeba",
        "Chybí v termínu",
        "Pozdní pokrytí",
        "Čistý deficit",
        "Kvalita dat",
      ];
      const rows = plan.materials
        .filter((m) => m.demand !== "0")
        .map((m) => {
          const item = items.get(m.itemId)!;
          return [
            item.code,
            item.name,
            item.unit,
            m.demand,
            m.onTimeShortage,
            m.lateCoverage,
            m.unknown ? "" : m.netDeficit,
            m.unknown
              ? "Neověřeno — neobjednávat podle tohoto čísla"
              : workspace.mode === "demo"
                ? "Modelová data"
                : "Bez zjištěných chyb evidence — ověřte stav ve skladu",
          ];
        });
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="materialy-${view}.csv"`,
        );
      return csv([columns, ...rows]);
    },
  );
  if (service.import) {
    const importBody = z
      .object({
        expectedVersion: z.number().int().nonnegative(),
        input: inputSchema,
      })
      .strict();
    app.post(
      "/api/v1/imports/preview",
      {
        bodyLimit: 2 * 1024 * 1024,
        config: { rateLimit: { max: 5, timeWindow: 60000 } },
      },
      async (request) => {
        const w = await service.read(sessionId(request));
        if (w.role !== "admin")
          throw new HttpError(
            403,
            "ADMIN_REQUIRED",
            "Data může nahrát pouze správce firmy.",
          );
        const body = importBody.parse(request.body);
        if (body.expectedVersion !== w.version)
          throw new HttpError(
            409,
            "VERSION_CONFLICT",
            "Plán se změnil. Načtěte aktuální verzi.",
          );
        try {
          const result =
            "calculate" in service
              ? await (
                  service as import("./postgres-workspace.js").PostgresWorkspace
                ).calculate(body.input)
              : calculatePlan(body.input);
          return { result, revision: body.input.revision };
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            400,
            "INVALID_PLAN",
            "Vstupní plán má neplatné vazby nebo duplicitní identifikátory.",
          );
        }
      },
    );
    app.put(
      "/api/v1/input",
      {
        bodyLimit: 2 * 1024 * 1024,
        config: { rateLimit: { max: 5, timeWindow: 60000 } },
      },
      async (request) => {
        const body = importBody.parse(request.body);
        return service.import!(
          sessionId(request),
          body.expectedVersion,
          body.input,
        );
      },
    );
  }
}
