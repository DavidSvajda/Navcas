import { describe, it, expect } from "vitest";
import { inputSchema } from "../packages/contracts/index";
import { demoInput, emptyScenario } from "../fixtures/demo";
import { calculatePlan, applyScenario } from "../packages/domain/engine";
describe("hranice importu a scénáře", () => {
  it("prázdný firemní plán je platný a nemá skryté demo zakázky", () => {
    const result = calculatePlan({
      ...demoInput,
      items: [],
      products: [],
      stock: [],
      orders: [],
      receipts: [],
      reservations: [],
    });
    expect(result.orders).toEqual([]);
    expect(result.materials).toEqual([]);
  });
  it("opakovaný řádek kusovníku se přičte ke stejné komponentě", () => {
    const input = structuredClone(demoInput);
    const before = calculatePlan(input);
    input.products[0].components.push(input.products[0].components[0]);
    const after = calculatePlan(input);
    expect(after.orders[0].components[0].required).not.toBe(
      before.orders[0].components[0].required,
    );
    expect(
      after.orders[0].components.filter(
        (c) => c.itemId === input.products[0].components[0].itemId,
      ),
    ).toHaveLength(1);
  });
  it.each(["2026-02-29", "2026-13-01", "2026-04-31"])(
    "odmítá neplatný den %s",
    (asOf) =>
      expect(inputSchema.safeParse({ ...demoInput, asOf }).success).toBe(false),
  );
  it.each(["-1", "NaN", "Infinity", "1e20", "1.123456789"])(
    "odmítá neplatné množství %s",
    (quantity) => {
      expect(
        inputSchema.safeParse({
          ...demoInput,
          stock: [{ ...demoInput.stock[0], quantity }],
        }).success,
      ).toBe(false);
    },
  );
  it("storno s důvodem nevytváří poptávku", () => {
    const input = structuredClone(demoInput);
    input.orders = input.orders.map((o) => ({
      ...o,
      excludedReason: "Zakázka byla stornována",
    }));
    const r = calculatePlan(input);
    expect(r.orders.every((o) => o.status === "excluded")).toBe(true);
    expect(r.materials.every((m) => m.demand === "0")).toBe(true);
  });
  it("výchozí plán a scénář nemohou změnit vstupní objekt", () => {
    const input = structuredClone(demoInput),
      before = JSON.stringify(input);
    calculatePlan(input);
    applyScenario(input, emptyScenario());
    expect(JSON.stringify(input)).toBe(before);
  });
  it("výsledek je deterministický i po jiném předchozím výpočtu", () => {
    const first = calculatePlan(demoInput);
    calculatePlan({ ...demoInput, stock: [] });
    expect(calculatePlan(demoInput)).toEqual(first);
  });
});
