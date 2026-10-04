import { z } from "zod";
import { isIP } from "node:net";
const httpsOrigin = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password
    );
  }, "Vyžaduje se HTTPS origin bez cesty.");
export const productionSchema = z.object({
  PUBLIC_ORIGIN: httpsOrigin.transform((v) => new URL(v).origin),
  DATABASE_URL: z.string().min(1),
  SESSION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  OIDC_ISSUER: z
    .string()
    .url()
    .refine((v) => new URL(v).protocol === "https:"),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(16),
  OPERATOR_NAME: z.string().min(2),
  OPERATOR_ADDRESS: z.string().min(5),
  OPERATOR_ICO: z.string().regex(/^\d{8}$/),
  OPERATOR_EMAIL: z.email(),
  PRIVACY_URL: httpsOrigin.or(
    z
      .string()
      .url()
      .refine((v) => new URL(v).protocol === "https:"),
  ),
  TERMS_URL: z
    .string()
    .url()
    .refine((v) => new URL(v).protocol === "https:"),
  TRUST_PROXY: z.string().default(""),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
});
export type ProductionConfig = z.infer<typeof productionSchema>;
const publicDemoSchema = productionSchema.pick({
  PUBLIC_ORIGIN: true,
  SESSION_KEY: true,
  TRUST_PROXY: true,
  PORT: true,
});
export type PublicDemoConfig = z.infer<typeof publicDemoSchema>;
export function publicDemoConfig(env: NodeJS.ProcessEnv): PublicDemoConfig {
  if (env.DATABASE_URL || env.OIDC_ISSUER || env.OIDC_CLIENT_SECRET)
    throw new Error(
      "Public demo must not receive customer database or identity credentials.",
    );
  const parsed = publicDemoSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      "Public demo requires HTTPS origin, session key and a valid port.",
    );
  validateProxy(parsed.data.TRUST_PROXY);
  return parsed.data;
}
function validateProxy(value: string) {
  if (
    value &&
    !value.split(",").every((v) => {
      const [address, prefix, extra] = v.trim().split("/");
      const version = isIP(address);
      if (
        !version ||
        extra !== undefined ||
        address === "0.0.0.0" ||
        address === "::"
      )
        return false;
      if (prefix === undefined) return true;
      const bits = Number(prefix);
      return (
        /^\d+$/.test(prefix) &&
        bits >= (version === 4 ? 24 : 64) &&
        bits <= (version === 4 ? 32 : 128)
      );
    })
  )
    throw new Error(
      "TRUST_PROXY must contain explicit IP addresses or CIDR networks.",
    );
}
export function productionConfig(env: NodeJS.ProcessEnv): ProductionConfig {
  const parsed = productionSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Produkční konfigurace chybí nebo není platná: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. Hodnoty nejsou vypisovány.`,
    );
  let db: URL;
  try {
    db = new URL(parsed.data.DATABASE_URL);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL URL. Values are not logged.",
    );
  }
  if (!["postgres:", "postgresql:"].includes(db.protocol))
    throw new Error("DATABASE_URL musí být PostgreSQL.");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) &&
    db.searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error(
      "Vzdálená databáze vyžaduje sslmode=verify-full a důvěryhodný certifikát.",
    );
  validateProxy(parsed.data.TRUST_PROXY);
  return parsed.data;
}
