import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calculatePlan, applyScenario } from "../packages/domain/engine";
import { inputSchema, type PlanInput } from "../packages/contracts";

const fixture = (): PlanInput => ({
  revision: "test-1",
  asOf: "2026-10-05",
  horizonEnd: "2026-10-31",
  items: [{ id: "a", code: "A", name: "Materiál A", unit: "ks", step: "1" }],
  products: [
    { id: "p", name: "Výrobek", components: [{ itemId: "a", perUnit: "1" }] },
  ],
  stock: [{ itemId: "a", quantity: "10" }],
  reservations: [],
  receipts: [],
  orders: [
    {
      id: "o1",
      code: "VP1",
      customer: "Firma",
      productId: "p",
      remaining: "10",
      needDate: "2026-10-06",
      priority: 50,
    },
  ],
});
const addOrder = (
  v: PlanInput,
  quantity: string,
  day = "2026-10-07",
  priority = 50,
) =>
  v.orders.push({
    ...v.orders[0],
    id: "o2",
    code: "VP2",
    remaining: quantity,
    needDate: day,
    priority,
  });
const receipt = (v: PlanInput, quantity: string, day: string | null) =>
  v.receipts.push({
    id: "r1",
    code: "OP1",
    itemId: "a",
    remaining: quantity,
    dueDate: day,
    supplier: "Dodavatel",
  });

describe("materiálové pokrytí — referenční scénáře", () => {
  it("přesná zásoba pokryje zakázku bez falešného deficitu", () => {
    const p = calculatePlan(fixture());
    expect(p.orders[0].status).toBe("stock");
    expect(p.materials[0].netDeficit).toBe("0");
  });
  it("sdílená zásoba se nepoužije dvakrát", () => {
    const v = fixture();
    addOrder(v, "4");
    const p = calculatePlan(v);
    expect(p.orders[1].components[0].shortage).toBe("4");
  });
  it("desetinná spotřeba nemá chybu 0.1 × 3", () => {
    const v = fixture();
    v.items[0].step = "0.1";
    v.products[0].components[0].perUnit = "0.1";
    v.orders[0].remaining = "3";
    v.stock[0].quantity = "0.3";
    expect(calculatePlan(v).orders[0].components[0].required).toBe("0.3");
    expect(calculatePlan(v).orders[0].status).toBe("stock");
  });
  it("kusové množství se zaokrouhluje nahoru", () => {
    const v = fixture();
    v.products[0].components[0].perUnit = "0.11";
    expect(calculatePlan(v).orders[0].components[0].required).toBe("2");
  });
  it("duplicitní komponenty se agregují před zaokrouhlením", () => {
    const v = fixture();
    v.orders[0].remaining = "1";
    v.products[0].components = [
      { itemId: "a", perUnit: "0.2" },
      { itemId: "a", perUnit: "0.3" },
    ];
    expect(calculatePlan(v).orders[0].components[0].required).toBe("1");
  });
  it("vlastní rezervace se neodečte podruhé", () => {
    const v = fixture();
    v.reservations.push({
      id: "r",
      itemId: "a",
      quantity: "7",
      orderId: "o1",
      kind: "physical",
    });
    expect(calculatePlan(v).orders[0].status).toBe("stock");
  });
  it("externí rezervace není volná zásoba", () => {
    const v = fixture();
    v.reservations.push({
      id: "r",
      itemId: "a",
      quantity: "7",
      orderId: "outside",
      kind: "physical",
    });
    expect(calculatePlan(v).orders[0].components[0].shortage).toBe("7");
  });
  it("logická rezervace nesnižuje fyzický sklad", () => {
    const v = fixture();
    v.reservations.push({
      id: "r",
      itemId: "a",
      quantity: "7",
      orderId: "outside",
      kind: "logical",
    });
    expect(calculatePlan(v).orders[0].status).toBe("stock");
  });
  it("rezervace přesahující sklad je neověřená", () => {
    const v = fixture();
    v.reservations.push({
      id: "r",
      itemId: "a",
      quantity: "11",
      orderId: "outside",
      kind: "physical",
    });
    expect(calculatePlan(v).orders[0].status).toBe("unknown");
  });
  it("neznámá rezervace není ignorována", () => {
    const v = fixture();
    v.reservations.push({
      id: "r",
      itemId: "a",
      quantity: "1",
      orderId: null,
      kind: "unknown",
    });
    expect(calculatePlan(v).orders[0].status).toBe("unknown");
  });
  it("včasná dodávka není fyzické pokrytí", () => {
    const v = fixture();
    v.stock[0].quantity = "0";
    receipt(v, "10", "2026-10-06");
    expect(calculatePlan(v).orders[0].status).toBe("incoming");
  });
  it("pozdní dodávka sníží nákupní deficit, ale nevrátí termín", () => {
    const v = fixture();
    v.stock[0].quantity = "0";
    receipt(v, "10", "2026-10-07");
    const p = calculatePlan(v);
    expect(p.orders[0].status).toBe("shortage");
    expect(p.materials[0]).toMatchObject({
      onTimeShortage: "10",
      lateCoverage: "10",
      netDeficit: "0",
    });
  });
  it("pozdní dodávka nejdříve chrání starší nezajištěnou potřebu", () => {
    const v = fixture();
    v.stock[0].quantity = "0";
    receipt(v, "10", "2026-10-07");
    addOrder(v, "5", "2026-10-08");
    const p = calculatePlan(v);
    expect(p.orders[1].components[0].shortage).toBe("5");
    expect(p.materials[0].netDeficit).toBe("5");
  });
  it("dodávka bez termínu není včasná ani jistý nákupní zdroj", () => {
    const v = fixture();
    v.stock[0].quantity = "0";
    receipt(v, "10", null);
    expect(calculatePlan(v).materials[0].netDeficit).toBe("10");
  });
  it("dodávka za horizontem nesnižuje deficit", () => {
    const v = fixture();
    v.stock[0].quantity = "0";
    receipt(v, "10", "2026-11-01");
    expect(calculatePlan(v).materials[0].netDeficit).toBe("10");
  });
  it("dokončený příkaz nevytváří potřebu", () => {
    const v = fixture();
    v.orders[0].remaining = "0";
    expect(calculatePlan(v).materials[0].demand).toBe("0");
  });
  it("chybějící BOM propaguje nejistotu do sdíleného skladu", () => {
    const v = fixture();
    addOrder(v, "2");
    v.orders[1].productId = "missing";
    expect(calculatePlan(v).orders.every((o) => o.status === "unknown")).toBe(
      true,
    );
  });
  it("chybějící datum propaguje nejistotu do dotčených materiálů", () => {
    const v = fixture();
    addOrder(v, "2");
    v.orders[1].needDate = null;
    expect(calculatePlan(v).orders[0].status).toBe("unknown");
  });
  it("auditovatelné vyloučení neblokuje zbytek plánu", () => {
    const v = fixture();
    addOrder(v, "2");
    v.orders[1].productId = "missing";
    v.orders[1].excludedReason = "Příkaz nepodporovaného procesu";
    expect(calculatePlan(v).orders[0].status).toBe("stock");
  });
  it("víceúrovňový kusovník není falešně zelený", () => {
    const v = fixture();
    v.products[0].unsupported = true;
    expect(calculatePlan(v).orders[0].status).toBe("unknown");
  });
  it("priorita rozhoduje jen mezi stejnými termíny", () => {
    const v = fixture();
    addOrder(v, "10", "2026-10-06", 90);
    expect(calculatePlan(v).orders[1].status).toBe("stock");
  });
  it("priorita pozdější zakázky nepřeskočí dřívější potřebu", () => {
    const v = fixture();
    addOrder(v, "10", "2026-10-07", 90);
    expect(calculatePlan(v).orders[0].status).toBe("stock");
  });
  it("scénář nemění vstup a odmítá cizí ID", () => {
    const v = fixture();
    const original = structuredClone(v);
    const result = applyScenario(v, {
      name: "Test",
      orders: [{ id: "o1", needDate: "2026-10-09", priority: 99 }],
      receipts: [],
    });
    expect(v).toEqual(original);
    expect(result.orders[0].needDate).toBe("2026-10-09");
    expect(() =>
      applyScenario(v, {
        name: "Test",
        orders: [{ id: "other", needDate: "2026-10-09", priority: 99 }],
        receipts: [],
      }),
    ).toThrow();
  });
  it("odmítne duplicitní zdrojovou dodávku a záporný sklad", () => {
    const v = fixture();
    receipt(v, "10", "2026-10-07");
    v.receipts.push({ ...v.receipts[0] });
    expect(() => calculatePlan(v)).toThrow(/Duplicitní/);
    v.receipts = [];
    v.stock[0].quantity = "-1";
    expect(() => calculatePlan(v)).toThrow();
  });
  it("odmítne neexistující kalendářní datum", () => {
    const v = fixture();
    v.orders[0].needDate = "2026-02-30";
    expect(inputSchema.safeParse(v).success).toBe(false);
  });
  it("má přesnost i pro velké hodnoty", () => {
    const v = fixture();
    v.items[0].step = "0.00000001";
    v.orders[0].remaining = "9999999999999999.12345678";
    v.products[0].components[0].perUnit = "1";
    v.stock[0].quantity = v.orders[0].remaining;
    expect(calculatePlan(v).orders[0].status).toBe("stock");
  });
});

describe("vlastnosti enginu", () => {
  it("nikdy nealokuje více fyzické zásoby, než existuje", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.array(fc.integer({ min: 1, max: 1000 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (stock, needs) => {
          const v = fixture();
          v.stock[0].quantity = String(stock);
          v.orders = needs.map((n, i) => ({
            ...v.orders[0],
            id: `o${i}`,
            code: `VP${i}`,
            remaining: String(n),
          }));
          const p = calculatePlan(v);
          const total = p.orders.reduce(
            (sum, o) => sum + Number(o.components[0].physical),
            0,
          );
          expect(total).toBe(
            Math.min(
              stock,
              needs.reduce((a, b) => a + b, 0),
            ),
          );
          expect(calculatePlan(v)).toEqual(p);
        },
      ),
      { numRuns: 150 },
    );
  });
  it("ani očekávaná dodávka není použita dvakrát", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (stock, incoming, need) => {
          const v = fixture();
          v.stock[0].quantity = String(stock);
          v.orders[0].remaining = String(need);
          addOrder(v, String(need));
          receipt(v, String(incoming), "2026-10-06");
          const p = calculatePlan(v);
          expect(
            p.orders.reduce((n, o) => n + Number(o.components[0].expected), 0),
          ).toBeLessThanOrEqual(stock + incoming);
          expect(Number(p.materials[0].netDeficit)).toBe(
            Math.max(0, need * 2 - stock - incoming),
          );
        },
      ),
      { numRuns: 150 },
    );
  });
});
