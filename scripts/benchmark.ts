import { performance } from "node:perf_hooks";
import { calculatePlan } from "../packages/domain/engine.js";
import type { PlanInput } from "../packages/contracts/index.js";
const input: PlanInput = {
  revision: "synthetic-benchmark",
  asOf: "2026-10-01",
  horizonEnd: "2026-10-31",
  items: Array.from({ length: 10_000 }, (_, i) => ({
    id: `i${i}`,
    code: `M${i}`,
    name: `Materiál ${i}`,
    unit: "ks",
    step: "1",
  })),
  products: Array.from({ length: 100 }, (_, i) => ({
    id: `p${i}`,
    name: `Produkt ${i}`,
    components: Array.from({ length: 20 }, (_, j) => ({
      itemId: `i${i * 20 + j}`,
      perUnit: "2.5",
    })),
  })),
  stock: Array.from({ length: 10_000 }, (_, i) => ({
    itemId: `i${i}`,
    quantity: "10",
  })),
  reservations: [],
  orders: Array.from({ length: 500 }, (_, i) => ({
    id: `o${i}`,
    code: `VP${i}`,
    customer: "Model",
    productId: `p${i % 100}`,
    remaining: "4",
    needDate: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`,
    priority: 50,
  })),
  receipts: Array.from({ length: 2000 }, (_, i) => ({
    id: `r${i}`,
    code: `OP${i}`,
    supplier: "Model",
    itemId: `i${i}`,
    remaining: "12",
    dueDate: "2026-10-12",
  })),
};
const samples = [];
for (let n = 0; n < 5; n++) {
  const start = performance.now();
  const result = calculatePlan(input);
  samples.push(Math.round(performance.now() - start));
  if (result.orders.length !== 500) throw new Error("Neúplný výsledek");
}
console.log(
  JSON.stringify(
    {
      profile: {
        items: 10000,
        orders: 500,
        bomEdges: 2000,
        expandedComponents: 10000,
        receipts: 2000,
      },
      milliseconds: samples,
      medianMs: [...samples].sort((a, b) => a - b)[2],
      note: "Lokální syntetické měření, nikoli produkční SLA ani měření skutečného ERP.",
    },
    null,
    2,
  ),
);
