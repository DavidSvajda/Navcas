import Decimal from "decimal.js";
import {
  inputSchema,
  scenarioSchema,
  type Allocation,
  type ComponentResult,
  type OrderResult,
  type PlanInput,
  type PlanResult,
  type Scenario,
} from "../contracts/index.js";

const D = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
const q = (n: Decimal.Value) => new D(n);
const str = (n: Decimal) => n.toFixed();
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = index.get(id);
    if (group) group.push(row);
    else index.set(id, [row]);
  }
  return index;
}
const unique = (values: string[], label: string) => {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicitní identifikátor: ${label}.`);
};

export function applyScenario(raw: PlanInput, changes: Scenario): PlanInput {
  const input = inputSchema.parse(raw);
  const scenario = scenarioSchema.parse(changes);
  unique(
    scenario.orders.map((o) => o.id),
    "změny zakázek",
  );
  unique(
    scenario.receipts.map((r) => r.id),
    "změny dodávek",
  );
  const orderIds = new Set(input.orders.map((o) => o.id));
  const receiptIds = new Set(input.receipts.map((r) => r.id));
  const orderOverrides = new Map(scenario.orders.map((o) => [o.id, o]));
  const receiptOverrides = new Map(scenario.receipts.map((r) => [r.id, r]));
  for (const order of scenario.orders)
    if (!orderIds.has(order.id))
      throw new Error("Scénář odkazuje na neexistující zakázku.");
  for (const receipt of scenario.receipts)
    if (!receiptIds.has(receipt.id))
      throw new Error("Scénář odkazuje na neexistující dodávku.");
  return {
    ...input,
    orders: input.orders.map((o) => ({
      ...o,
      ...orderOverrides.get(o.id),
    })),
    receipts: input.receipts.map((r) => ({
      ...r,
      ...receiptOverrides.get(r.id),
    })),
  };
}

export function calculatePlan(raw: PlanInput): PlanResult {
  const input = inputSchema.parse(raw);
  for (const [label, rows] of [
    ["položky", input.items],
    ["výrobky", input.products],
    ["zakázky", input.orders],
    ["dodávky", input.receipts],
    ["rezervace", input.reservations],
  ] as const)
    unique(
      rows.map((x) => x.id),
      label,
    );
  unique(
    input.stock.map((x) => x.itemId),
    "stav skladu",
  );
  const items = new Map(input.items.map((i) => [i.id, i]));
  const products = new Map(input.products.map((p) => [p.id, p]));
  const expanded = input.orders.reduce(
    (sum, order) =>
      sum + (products.get(order.productId)?.components.length ?? 0),
    0,
  );
  if (expanded > 50000)
    throw new Error(
      "Plán překračuje limit 50 000 rozvinutých potřeb. Zkraťte horizont nebo rozdělte plán.",
    );
  const stock = new Map(input.stock.map((s) => [s.itemId, q(s.quantity)]));
  for (const row of [...input.stock, ...input.receipts, ...input.reservations])
    if (!items.has(row.itemId))
      throw new Error(
        "Sklad, dodávka nebo rezervace odkazuje na neexistující materiál.",
      );
  const issues: string[] = [];
  const unknownItems = new Set<string>();
  let globalUnknown = false;
  for (const item of input.items)
    if (q(item.step).lte(0)) {
      unknownItems.add(item.id);
      issues.push(`${item.code}: neplatná minimální jednotka.`);
    }
  const active = input.orders.filter(
    (o) =>
      !o.excludedReason &&
      q(o.remaining).gt(0) &&
      (!o.needDate || o.needDate <= input.horizonEnd),
  );
  const reasons = new Map<string, string[]>();
  const demands = new Map<string, Map<string, Decimal>>();
  for (const order of active) {
    const product = products.get(order.productId);
    const problems: string[] = [];
    if (!order.needDate) problems.push("Chybí datum potřeby materiálu.");
    if (!product || !product.components.length) {
      problems.push("Chybí ověřený kusovník.");
      globalUnknown = true;
    }
    if (product?.unsupported)
      problems.push("Víceúrovňový kusovník není v této verzi podporovaný.");
    const totals = new Map<string, Decimal>();
    for (const component of product?.components ?? []) {
      const item = items.get(component.itemId);
      if (!item) {
        problems.push("Kusovník obsahuje neznámý materiál.");
        globalUnknown = true;
        continue;
      }
      if (q(component.perUnit).lte(0))
        problems.push(`Neplatná spotřeba: ${item.code}.`);
      totals.set(
        item.id,
        (totals.get(item.id) ?? q(0)).plus(
          q(component.perUnit).times(order.remaining),
        ),
      );
    }
    for (const [itemId, total] of totals) {
      const step = q(items.get(itemId)!.step);
      if (step.gt(0)) totals.set(itemId, total.div(step).ceil().times(step));
    }
    if (problems.length) {
      reasons.set(order.id, problems);
      for (const itemId of totals.keys()) unknownItems.add(itemId);
      issues.push(`${order.code}: ${problems.join(" ")}`);
    }
    demands.set(order.id, totals);
  }
  const physicalReserved = new Map<string, Decimal>();
  for (const r of input.reservations) {
    if (r.kind === "unknown") {
      unknownItems.add(r.itemId);
      issues.push(`${items.get(r.itemId)!.code}: neověřený význam rezervace.`);
    }
    if (r.kind === "physical")
      physicalReserved.set(
        r.itemId,
        (physicalReserved.get(r.itemId) ?? q(0)).plus(r.quantity),
      );
  }
  for (const [itemId, reserved] of physicalReserved)
    if (reserved.gt(stock.get(itemId) ?? 0)) {
      unknownItems.add(itemId);
      issues.push(
        `${items.get(itemId)!.code}: rezervace přesahují skladovou zásobu.`,
      );
    }
  if (globalUnknown) for (const item of input.items) unknownItems.add(item.id);
  const ordered = active
    .filter((o) => o.needDate && !reasons.has(o.id))
    .sort(
      (a, b) =>
        compareId(a.needDate!, b.needDate!) ||
        b.priority - a.priority ||
        compareId(a.id, b.id),
    );
  type PassRow = { covered: Decimal; sources: Allocation[] };
  const reservationsByOwner = groupBy(
    input.reservations.filter((r) => r.kind === "physical"),
    (r) => JSON.stringify([r.orderId, r.itemId]),
  );
  const activeIds = new Set(active.map((o) => o.id));
  function pass(withReceipts: boolean) {
    const free = new Map(
      input.items.map((i) => [
        i.id,
        D.max(
          0,
          (stock.get(i.id) ?? q(0)).minus(physicalReserved.get(i.id) ?? 0),
        ),
      ]),
    );
    const reserved = new Map(
      input.reservations
        .filter((r) => r.kind === "physical")
        .map((r) => [r.id, q(r.quantity)]),
    );
    const receipts = input.receipts
      .filter((r) => r.dueDate && r.dueDate <= input.horizonEnd)
      .sort(
        (a, b) => compareId(a.dueDate!, b.dueDate!) || compareId(a.id, b.id),
      )
      .map((r) => ({ ...r, left: q(r.remaining) }));
    const receiptsByItem = groupBy(receipts, (r) => r.itemId);
    const debt: { itemId: string; left: Decimal; date: string }[] = [];
    const late = new Map<string, Decimal>();
    const rows = new Map<string, Map<string, PassRow>>();
    const drainDebt = (day: string) => {
      if (!withReceipts) return;
      for (const d of debt) {
        if (d.left.lte(0)) continue;
        for (const r of receiptsByItem.get(d.itemId) ?? []) {
          if (r.dueDate! > day || d.left.lte(0) || r.left.lte(0)) continue;
          const taken = D.min(r.left, d.left);
          r.left = r.left.minus(taken);
          d.left = d.left.minus(taken);
          late.set(d.itemId, (late.get(d.itemId) ?? q(0)).plus(taken));
        }
      }
    };
    for (const order of ordered) {
      drainDebt(order.needDate!);
      const components = new Map<string, PassRow>();
      for (const [itemId, required] of demands.get(order.id)!) {
        let left = q(required);
        const sources: Allocation[] = [];
        const take = (
          available: Decimal,
          source: string,
          kind: Allocation["kind"],
        ) => {
          const taken = D.min(available, left);
          left = left.minus(taken);
          if (taken.gt(0)) sources.push({ source, quantity: str(taken), kind });
          return available.minus(taken);
        };
        for (const r of reservationsByOwner.get(
          JSON.stringify([order.id, itemId]),
        ) ?? [])
          reserved.set(r.id, take(reserved.get(r.id)!, r.id, "reserved"));
        free.set(itemId, take(free.get(itemId)!, "Sklad", "stock"));
        if (withReceipts)
          for (const r of receiptsByItem.get(itemId) ?? [])
            if (r.dueDate! <= order.needDate!)
              r.left = take(r.left, r.code, "receipt");
        components.set(itemId, { covered: required.minus(left), sources });
        if (left.gt(0)) debt.push({ itemId, left, date: order.needDate! });
      }
      rows.set(order.id, components);
    }
    drainDebt(input.horizonEnd);
    return { rows, late, debt };
  }
  const physical = pass(false);
  const expected = pass(true);
  const orderResults: OrderResult[] = input.orders.map((order) => {
    if (order.excludedReason)
      return {
        id: order.id,
        status: "excluded",
        reasons: [order.excludedReason],
        components: [],
      };
    if (!activeIds.has(order.id))
      return {
        id: order.id,
        status: "excluded",
        reasons: [
          q(order.remaining).eq(0)
            ? "Zakázka nemá zbývající potřebu."
            : "Zakázka je mimo plánovací horizont.",
        ],
        components: [],
      };
    const components: ComponentResult[] = [...demands.get(order.id)!].map(
      ([itemId, required]) => {
        const a = physical.rows.get(order.id)?.get(itemId),
          b = expected.rows.get(order.id)?.get(itemId);
        return {
          itemId,
          required: str(required),
          physical: str(a?.covered ?? q(0)),
          expected: str(b?.covered ?? q(0)),
          shortage: str(required.minus(b?.covered ?? 0)),
          physicalSources: a?.sources ?? [],
          expectedSources: b?.sources ?? [],
        };
      },
    );
    const problems = [...(reasons.get(order.id) ?? [])];
    if (globalUnknown || components.some((c) => unknownItems.has(c.itemId)))
      problems.push(
        "Neověřená data ovlivňují sdílený materiál. Čísla jsou pouze orientační.",
      );
    const status = problems.length
      ? "unknown"
      : components.every((c) => q(c.physical).eq(c.required))
        ? "stock"
        : components.every((c) => q(c.shortage).eq(0))
          ? "incoming"
          : "shortage";
    return { id: order.id, status, reasons: problems, components };
  });
  const componentsByItem = groupBy(
    orderResults.flatMap((o) =>
      o.components.map((c) => ({ ...c, orderId: o.id })),
    ),
    (c) => c.itemId,
  );
  const debtByItem = groupBy(expected.debt, (d) => d.itemId);
  const incomingByItem = groupBy(
    input.receipts.filter((r) => r.dueDate && r.dueDate <= input.horizonEnd),
    (r) => r.itemId,
  );
  const materials = input.items.map((item) => {
    const cs = componentsByItem.get(item.id) ?? [];
    const sum = (field: "required" | "shortage") =>
      cs.reduce((n, c) => n.plus(c[field]), q(0));
    return {
      itemId: item.id,
      stock: str(stock.get(item.id) ?? q(0)),
      reserved: str(physicalReserved.get(item.id) ?? q(0)),
      demand: str(sum("required")),
      onTimeShortage: str(sum("shortage")),
      lateCoverage: str(expected.late.get(item.id) ?? q(0)),
      netDeficit: unknownItems.has(item.id)
        ? str(sum("shortage"))
        : str(
            (debtByItem.get(item.id) ?? []).reduce(
              (n, d) => n.plus(d.left),
              q(0),
            ),
          ),
      incoming: str(
        (incomingByItem.get(item.id) ?? []).reduce(
          (n, r) => n.plus(r.remaining),
          q(0),
        ),
      ),
      unknown: unknownItems.has(item.id),
      orders: cs.map((c) => c.orderId),
    };
  });
  return {
    engineVersion: "0.1.0",
    revision: input.revision,
    orders: orderResults,
    materials,
    issues: [...new Set(issues)],
  };
}
