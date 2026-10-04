import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("přístupnost a přetečení všech hlavních obrazovek", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Výroba pod kontrolou." }),
  ).toBeVisible();
  for (const name of [
    "Přehled",
    "Zakázky",
    "Materiál",
    "Scénáře",
    "Kvalita dat",
    "Ověření pro vaši firmu",
  ]) {
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Otevřít navigaci" }).click();
    await page
      .getByRole("navigation", { name: "Hlavní navigace" })
      .getByRole("button", { name, exact: name !== "Zakázky" })
      .click();
    await page.waitForTimeout(350);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations,
      `${name}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })))}`,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `overflow: ${name}`,
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("právní informace jsou dosažitelné a dialog má přístupný název", async ({
  page,
}) => {
  await page.goto("/#cookies");
  const dialog = page.getByRole("dialog", {
    name: "Cookies a ukládání v prohlížeči",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("mh_demo", { exact: true })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Podmínky ukázky" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Placená služba zatím není nabízena k objednání.", {
        exact: false,
      }),
  ).toBeVisible();
});
test("nezdařený export zachová stránku i scénář a ukáže chybu", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Výroba pod kontrolou." }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Otevřít navigaci" }).click();
  await page
    .getByRole("navigation", { name: "Hlavní navigace" })
    .getByRole("button", { name: "Materiál", exact: true })
    .click();
  await page.route("**/api/v1/exports/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Export dočasně není dostupný." }),
    }),
  );
  await page.getByRole("button", { name: "Export CSV" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Export dočasně není dostupný.",
  );
  await expect(
    page.getByRole("heading", { name: "Nákupní přehled" }),
  ).toBeVisible();
});
