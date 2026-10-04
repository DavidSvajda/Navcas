import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { inputSchema } from "../packages/contracts/index.js";
import { csv } from "../packages/contracts/csv.js";
import { calculatePlan } from "../packages/domain/engine.js";
import { demoInput } from "../fixtures/demo.js";

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      out: { type: "string" },
      demo: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "npm run validate:data -- --input normalizovana-data.json [--out adresar]\nnpm run validate:data -- --demo\nNepřipojuje se k ERP. --input přijímá ověřený PlanInput, nikoli nezmapovaný Flexi export.",
    );
    return;
  }
  if (!!values.input === !!values.demo)
    throw new Error(
      "Vyberte právě jeden zdroj: --input soubor.json nebo --demo.",
    );
  if (values.input && (await stat(values.input)).size > 5 * 1024 * 1024)
    throw new Error("Vstup přesahuje limit 5 MB.");
  const input = inputSchema.parse(
    values.demo
      ? structuredClone(demoInput)
      : JSON.parse(
          (await readFile(values.input!, "utf8")).replace(/^\uFEFF/, ""),
        ),
  );
  const result = calculatePlan(input);
  const out = resolve(
    values.out ??
      join("artifacts", "g0-" + new Date().toISOString().replace(/[:.]/g, "-")),
  );
  await mkdir(out, { recursive: true });
  const title = values.demo
    ? "MODELOVÁ DATA — NENÍ DŮKAZ POUŽITELNOSTI VE FIRME"
    : "NORMALIZOVANÝ VSTUP — FYZICKOU REALITU MUSÍ POTVRDIT ZÁKAZNÍK";
  const review = [
    [
      "Zakázka",
      "Materiál",
      "Datum potřeby",
      "Stav výpočtu",
      "Potřeba",
      "Přiděleno fyzicky",
      "Včetně včasných dodávek",
      "Chybí v termínu",
      "Jednotka",
      "Skutečnost potvrzená ve firmě",
      "Rozdíl / příčina",
      "Potvrdil",
      "Datum kontroly",
    ],
  ];
  for (const orderResult of result.orders) {
    const order = input.orders.find((o) => o.id === orderResult.id)!;
    for (const component of orderResult.components) {
      const item = input.items.find((i) => i.id === component.itemId)!;
      review.push([
        order.code,
        item.code,
        order.needDate ?? "",
        orderResult.status,
        component.required,
        component.physical,
        component.expected,
        component.shortage,
        item.unit,
        "",
        "",
        "",
        "",
      ]);
    }
    if (!orderResult.components.length)
      review.push([
        order.code,
        "",
        order.needDate ?? "",
        orderResult.status,
        "",
        "",
        "",
        "",
        "",
        "",
        orderResult.reasons.join(" "),
        "",
        "",
      ]);
  }
  const materials = [
    [
      "Materiál",
      "Jednotka",
      "Potřeba",
      "Nedostatek v termínu",
      "Pozdní pokrytí",
      "Čistý deficit",
      "Důvěra",
    ],
  ];
  for (const m of result.materials) {
    const item = input.items.find((i) => i.id === m.itemId)!;
    materials.push([
      item.code,
      item.unit,
      m.demand,
      m.onTimeShortage,
      m.lateCoverage,
      m.unknown ? "" : m.netDeficit,
      m.unknown ? "NEOVĚŘENO" : "STRUKTURA OVĚŘENA; ZKONTROLOVAT REALITU",
    ]);
  }
  await writeFile(
    join(out, "plan.json"),
    JSON.stringify(result, null, 2),
    "utf8",
  );
  await writeFile(join(out, "review.csv"), csv(review), "utf8");
  await writeFile(join(out, "materials.csv"), csv(materials), "utf8");
  const summary = `${title}\nRevize: ${input.revision}\nEngine: ${result.engineVersion}\nZakázek: ${result.orders.length}\nNeověřené zakázky: ${result.orders.filter((o) => o.status === "unknown").length}\nProblémy vstupů: ${result.issues.length}\n\n${result.issues.join("\n")}\n\nVýstup není objednávka ani potvrzení fyzické dostupnosti. Vyplňte review.csv s vedoucím výroby. Zapište i dobu získání a mapování dat.\n`;
  await writeFile(join(out, "summary.txt"), summary, "utf8");
  console.log(summary + "\nVýstupy: " + out);
}
main().catch((error) => {
  console.error(
    "Kontrola se nezdařila:",
    error instanceof Error ? error.message : "Neznámá chyba.",
  );
  process.exitCode = 1;
});
