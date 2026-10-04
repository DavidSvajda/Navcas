import { z } from "zod";

const id = z.string().min(1).max(100);
export const quantity = z
  .string()
  .regex(
    /^\d{1,16}(\.\d{1,8})?$/,
    "Množství musí být nezáporné číslo, nejvýše 8 desetinných míst.",
  );
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Neplatné kalendářní datum.");
export const inputSchema = z
  .object({
    revision: id,
    asOf: date,
    horizonEnd: date,
    items: z
      .array(
        z.object({
          id,
          code: id,
          name: z.string().min(1),
          unit: id,
          step: quantity,
        }),
      )
      .max(10000),
    products: z
      .array(
        z.object({
          id,
          name: id,
          components: z
            .array(z.object({ itemId: id, perUnit: quantity }))
            .max(100),
          unsupported: z.boolean().optional(),
        }),
      )
      .max(1000),
    stock: z.array(z.object({ itemId: id, quantity })).max(10000),
    reservations: z
      .array(
        z.object({
          id,
          itemId: id,
          quantity,
          orderId: id.nullable(),
          kind: z.enum(["physical", "logical", "unknown"]),
        }),
      )
      .max(10000),
    orders: z
      .array(
        z.object({
          id,
          code: id,
          customer: id,
          productId: id,
          remaining: quantity,
          needDate: date.nullable(),
          priority: z.number().int().min(0).max(100),
          excludedReason: z.string().min(5).max(300).optional(),
        }),
      )
      .max(1000),
    receipts: z
      .array(
        z.object({
          id,
          code: id,
          supplier: id,
          itemId: id,
          remaining: quantity,
          dueDate: date.nullable(),
        }),
      )
      .max(10000),
  })
  .strict()
  .refine((v) => v.horizonEnd >= v.asOf, "Horizont končí před datem plánu.");
export type PlanInput = z.infer<typeof inputSchema>;
export const scenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    orders: z
      .array(
        z
          .object({
            id,
            needDate: date,
            priority: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .max(1000),
    receipts: z
      .array(z.object({ id, dueDate: date.nullable() }).strict())
      .max(10000),
  })
  .strict();
export type Scenario = z.infer<typeof scenarioSchema>;
export type Status = "stock" | "incoming" | "shortage" | "unknown" | "excluded";
export type Allocation = {
  source: string;
  quantity: string;
  kind: "reserved" | "stock" | "receipt";
};
export type ComponentResult = {
  itemId: string;
  required: string;
  physical: string;
  expected: string;
  shortage: string;
  physicalSources: Allocation[];
  expectedSources: Allocation[];
};
export type OrderResult = {
  id: string;
  status: Status;
  reasons: string[];
  components: ComponentResult[];
};
export type MaterialResult = {
  itemId: string;
  stock: string;
  reserved: string;
  demand: string;
  onTimeShortage: string;
  lateCoverage: string;
  netDeficit: string;
  incoming: string;
  unknown: boolean;
  orders: string[];
};
export type PlanResult = {
  engineVersion: string;
  revision: string;
  orders: OrderResult[];
  materials: MaterialResult[];
  issues: string[];
};
export type Workspace = {
  csrfToken: string;
  sessionExpiresAt: string;
  input: PlanInput;
  baseline: PlanResult;
  scenario: Scenario;
  scenarioResult: PlanResult;
  version: number;
  mode: "demo" | "live";
  organizationName?: string;
  role?: "viewer" | "planner" | "admin";
  importedAt?: string | null;
  savedAt: string | null;
};
