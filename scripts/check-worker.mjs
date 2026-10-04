import { CalculationQueue } from "../dist/server/apps/api/calculator.js";
import assert from "node:assert/strict";
const queue = new CalculationQueue();
const input = {
  revision: "worker-smoke",
  asOf: "2026-10-04",
  horizonEnd: "2026-10-31",
  items: [{ id: "steel", code: "ST", name: "Ocel", unit: "kg", step: "0.01" }],
  products: [
    {
      id: "frame",
      name: "Rám",
      components: [{ itemId: "steel", perUnit: "2.5" }],
    },
  ],
  stock: [{ itemId: "steel", quantity: "10" }],
  orders: [
    {
      id: "order",
      code: "VP1",
      customer: "Test",
      productId: "frame",
      remaining: "5",
      needDate: "2026-10-05",
      priority: 50,
    },
  ],
  reservations: [],
  receipts: [],
};
try {
  const r = await queue.calculate(input);
  assert.equal(r.orders[0].status, "shortage");
  assert.equal(r.materials[0].netDeficit, "2.5");
  await assert.rejects(
    queue.calculate({
      ...input,
      stock: [{ itemId: "missing", quantity: "1" }],
    }),
    { statusCode: 400 },
  );
  const jobs = Array.from({ length: 10 }, () => queue.calculate(input));
  const results = await Promise.allSettled(jobs);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 8);
  assert.equal(results.filter((r) => r.status === "rejected").length, 2);
  console.log(
    "Calculation worker OK: exact results, invalid input, bounded queue and recovery.",
  );
} finally {
  await queue.close();
}
