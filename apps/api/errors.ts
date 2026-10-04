import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function registerErrors(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        code: "VALIDATION",
        message: "Zkontrolujte vyplněná pole.",
        fields: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
        requestId: request.id,
      });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
      });
    if (error instanceof Error && /^(Scénář|Duplicitní)/.test(error.message))
      return reply.code(400).send({
        code: "INVALID_SCENARIO",
        message: error.message,
        requestId: request.id,
      });
    const value =
      error instanceof Error && "statusCode" in error
        ? error.statusCode
        : undefined;
    const status =
      typeof value === "number" && value >= 400 && value < 500 ? value : 500;
    if (status === 500)
      request.log.error(
        {
          errorType: error instanceof Error ? error.name : "Unknown",
          requestId: request.id,
        },
        "Request failed",
      );
    return reply.code(status).send({
      code:
        status === 429
          ? "RATE_LIMITED"
          : status === 500
            ? "INTERNAL"
            : "REQUEST_REJECTED",
      message:
        status === 429
          ? "Příliš mnoho požadavků. Chvíli počkejte a zkuste to znovu."
          : status === 500
            ? "Operace se nepodařila. Zkuste to znovu."
            : "Požadavek se nepodařilo zpracovat.",
      requestId: request.id,
    });
  });
}
