import { expect, test } from "@playwright/test";
test("přehled, filtrování, detail, materiál a kvalita dat", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Výroba pod kontrolou." }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Hledat zakázku" })
    .fill("VP-2026-041");
  await expect(
    page.getByRole("button", { name: "VP-2026-041", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "VP-2026-042", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Detail VP-2026-041" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Hliníkový profil 40 × 40", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  if (test.info().project.name === "mobile")
    await page.getByRole("button", { name: "Otevřít navigaci" }).click();
  await page.getByRole("button", { name: "Materiál", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nákupní přehled" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  if (test.info().project.name === "mobile")
    await page.getByRole("button", { name: "Otevřít navigaci" }).click();
  await page.getByRole("button", { name: "Kvalita dat", exact: true }).click();
  await expect(
    page.getByText("Podporované vstupy prošly kontrolou."),
  ).toBeVisible();
});
test("změna dodávky změní pokrytí a výchozí plán zůstane stejný", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Vyzkoušet scénář" }).click();
  const row = page.getByRole("row").filter({
    has: page.getByRole("button", { name: "VP-2026-042", exact: true }),
  });
  await expect(row.getByText("Čeká na dodávku")).toHaveCount(2);
  await page.getByLabel("Termín OP-2026-118").fill("2026-10-20");
  await expect(row.getByText("Chybí materiál")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Uložit scénář" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Uložit scénář" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Scénář uložen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vrátit změny" }).click();
  await expect(row.getByText("Čeká na dodávku")).toHaveCount(2);
  await page.getByRole("button", { name: "Uložit scénář" }).click();
  await expect(
    page.getByRole("button", { name: "Uložit scénář" }),
  ).toBeDisabled();
});
