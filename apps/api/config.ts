import { z } from "zod";
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
export function productionConfig(env: NodeJS.ProcessEnv): ProductionConfig {
  const parsed = productionSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Produkční konfigurace chybí nebo není platná: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. Hodnoty nejsou vypisovány.`,
    );
  const db = new URL(parsed.data.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(db.protocol))
    throw new Error("DATABASE_URL musí být PostgreSQL.");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) &&
    db.searchParams.get("sslmode") !== "verify-full"
  )
    throw new Error(
      "Vzdálená databáze vyžaduje sslmode=verify-full a důvěryhodný certifikát.",
    );
  if (
    parsed.data.TRUST_PROXY &&
    !parsed.data.TRUST_PROXY.split(",").every((v) =>
      /^([\da-f:.]+)(\/\d{1,3})?$/i.test(v.trim()),
    )
  )
    throw new Error(
      "TRUST_PROXY musí obsahovat explicitní IP adresy nebo CIDR sítě.",
    );
  return parsed.data;
}
