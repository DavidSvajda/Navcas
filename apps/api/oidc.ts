import * as oidc from "openid-client";
import type { FastifyInstance } from "fastify";
import type { ProductionConfig } from "./config.js";
import type { PostgresWorkspace } from "./postgres-workspace.js";
import { HttpError } from "./errors.js";
import { sessionId } from "./security.js";
declare module "@fastify/secure-session" {
  interface SessionData {
    login: { state: string; nonce: string; verifier: string; expires: number };
  }
}
export async function registerOidc(
  app: FastifyInstance,
  service: PostgresWorkspace,
  config: ProductionConfig,
  transport: Pick<oidc.DiscoveryRequestOptions, typeof oidc.customFetch> = {},
) {
  const client = await oidc.discovery(
    new URL(config.OIDC_ISSUER),
    config.OIDC_CLIENT_ID,
    config.OIDC_CLIENT_SECRET,
    undefined,
    { timeout: 10, ...transport },
  );
  // Authorization-code clients may otherwise rely on TLS alone for ID token authenticity.
  oidc.enableNonRepudiationChecks(client);
  const callback = config.PUBLIC_ORIGIN + "/auth/callback";
  app.get(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: 60000 } } },
    async (request, reply) => {
      const old = request.session.get("id");
      if (old) await service.revoke(old);
      const login = {
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        verifier: oidc.randomPKCECodeVerifier(),
        expires: Date.now() + 300000,
      };
      await service.db.query(
        "INSERT INTO login_flows(id,expires_at) VALUES($1,$2)",
        [login.state, new Date(login.expires)],
      );
      request.session.regenerate();
      request.session.set("login", login);
      return reply.redirect(
        oidc.buildAuthorizationUrl(client, {
          redirect_uri: callback,
          scope: "openid",
          state: login.state,
          nonce: login.nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(login.verifier),
          code_challenge_method: "S256",
          response_mode: "query",
        }).href,
      );
    },
  );
  app.get(
    "/auth/callback",
    { config: { rateLimit: { max: 20, timeWindow: 60000 } } },
    async (request, reply) => {
      const login = request.session.get("login");
      request.session.regenerate();
      if (!login || login.expires < Date.now())
        throw new HttpError(
          401,
          "LOGIN_EXPIRED",
          "Přihlášení vypršelo. Začněte znovu.",
        );
      const used = await service.db.query(
        "DELETE FROM login_flows WHERE id=$1 AND expires_at>now() RETURNING id",
        [login.state],
      );
      if (!used.rows.length)
        throw new HttpError(
          401,
          "LOGIN_REPLAY",
          "Přihlášení již bylo použito. Začněte znovu.",
        );
      let subject: string;
      try {
        const tokens = await oidc.authorizationCodeGrant(
          client,
          new URL(request.raw.url ?? "", config.PUBLIC_ORIGIN),
          {
            pkceCodeVerifier: login.verifier,
            expectedState: login.state,
            expectedNonce: login.nonce,
            idTokenExpected: true,
          },
        );
        subject = tokens.claims()!.sub;
      } catch {
        throw new HttpError(
          401,
          "LOGIN_FAILED",
          "Přihlášení se nepodařilo ověřit. Začněte znovu.",
        );
      }
      request.session.set(
        "id",
        await service.authenticate(config.OIDC_ISSUER, subject),
      );
      return reply.redirect("/");
    },
  );
  app.post("/api/v1/logout", async (request, reply) => {
    await service.revoke(sessionId(request));
    request.session.delete();
    return reply.code(204).send();
  });
}
