import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoInput, emptyScenario } from "../../fixtures/demo";
import { calculatePlan } from "../../packages/domain/engine";
async function navigate(page: import("@playwright/test").Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole("button", { name: "Otevřít navigaci" }).click();
  await button.click();
}
async function live(
  page: import("@playwright/test").Page,
  role: "admin" | "viewer" = "admin",
) {
  const baseline = calculatePlan(demoInput);
  const raw = {
    input: demoInput,
    baseline,
    scenario: emptyScenario(),
    scenarioResult: baseline,
    version: 0,
    savedAt: null,
    csrfToken: "test-token",
    sessionExpiresAt: "2026-10-05T12:00:00Z",
  };
  await page.route("**/api/v1/scenarios/preview", (r) =>
    r.fulfill({ json: { result: baseline } }),
  );
  const workspace = {
    ...raw,
    mode: "live",
    role,
    organizationName: "Testovací výroba",
    importedAt: "2026-10-04T10:00:00Z",
  };
  await page.route("**/api/v1/service", (r) =>
    r.fulfill({
      json: {
        mode: "live",
        loginUrl: "/auth/login",
        operator: {
          name: "Test operator",
          ico: "12345678",
          address: "Test address",
          email: "test@example.com",
          privacyUrl: "https://example.com/privacy",
          termsUrl: "https://example.com/terms",
        },
      },
    }),
  );
  await page.route("**/api/v1/workspace", (r) =>
    r.fulfill({ json: workspace }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Výroba pod kontrolou." }),
  ).toBeVisible();
  return workspace;
}
test("přihlášení neukazuje ukázková data jako firemní plán", async ({
  page,
}) => {
  await page.route("**/api/v1/service", (r) =>
    r.fulfill({
      json: { mode: "live", loginUrl: "/auth/login", operator: null },
    }),
  );
  await page.route("**/api/v1/workspace", (r) =>
    r.fulfill({
      status: 401,
      json: { code: "LOGIN_REQUIRED", message: "Přihlaste se." },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Přihlásit se firemním účtem" }),
  ).toHaveAttribute("href", "/auth/login");
  await expect(page.getByText("VP-2026-041", { exact: true })).toHaveCount(0);
});
test("import vyžaduje kontrolu a potvrzení, a po uložení obnoví plán", async ({
  page,
}) => {
  const w = await live(page);
  let writes = 0;
  const input = { ...w.input, revision: "new-import" };
  await page.route("**/api/v1/imports/preview", (r) =>
    r.fulfill({ json: { result: w.baseline, revision: input.revision } }),
  );
  await page.route("**/api/v1/input", (r) => {
    writes++;
    return r.fulfill({
      json: {
        ...w,
        input,
        version: w.version + 1,
        scenario: { name: "Pracovní scénář", orders: [], receipts: [] },
      },
    });
  });
  await navigate(page, "Import dat");
  await page.getByLabel("Soubor plánu").setInputFiles({
    name: "plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(input)),
  });
  const commit = page.getByRole("button", {
    name: "Nahradit plán těmito daty",
  });
  await expect(commit).toBeDisabled();
  expect(writes).toBe(0);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.getByRole("checkbox").check();
  await commit.click();
  await expect(
    page.getByText("Nová data jsou načtená.", { exact: false }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await expect(
    page.getByRole("heading", { name: "Výroba pod kontrolou." }),
  ).toBeVisible();
});
test("chybný soubor a selhání importu zachovají aktuální plán", async ({
  page,
}) => {
  const w = await live(page);
  await navigate(page, "Import dat");
  await page.getByLabel("Soubor plánu").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json"),
  });
  await expect(page.getByRole("alert")).toContainText("není platný JSON");
  await page.route("**/api/v1/imports/preview", (r) =>
    r.fulfill({ json: { result: w.baseline, revision: "next" } }),
  );
  await page.route("**/api/v1/input", (r) =>
    r.fulfill({
      status: 409,
      json: { message: "Plán se změnil.", code: "VERSION_CONFLICT" },
    }),
  );
  await page.getByLabel("Soubor plánu").setInputFiles({
    name: "plan.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...w.input, revision: "next" })),
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Nahradit plán těmito daty" }).click();
  await expect(page.getByRole("alert")).toContainText("Plán se změnil.");
  await navigate(page, "Přehled");
  await expect(
    page.getByRole("button", { name: "VP-2026-041", exact: true }),
  ).toBeVisible();
});
test("čtenář nedostane import ani možnost uložit scénář", async ({ page }) => {
  await live(page, "viewer");
  await expect(
    page.getByRole("button", { name: "Import dat", exact: true }),
  ).toHaveCount(0);
  await navigate(page, "Scénáře");
  await expect(
    page.getByRole("button", { name: "Uložit scénář" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Cookies", exact: true }).click();
  await expect(page.getByText("__Host-navcas", { exact: true })).toBeVisible();
});
