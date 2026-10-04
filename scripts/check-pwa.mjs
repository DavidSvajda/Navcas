import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3001/");
  await page.getByRole("heading", { name: "Výroba pod kontrolou." }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const manifest = await (
    await context.request.get("http://127.0.0.1:3001/manifest.webmanifest")
  ).json();
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons)
    assert.equal(
      (await context.request.get("http://127.0.0.1:3001" + icon.src)).status(),
      200,
    );
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys.map(async (key) =>
          (await (await caches.open(key)).keys()).map((r) => r.url),
        ),
      )
    ).flat();
  });
  assert.equal(
    cached.some((url) => url.includes("/api")),
    false,
  );
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("heading", { name: "Pro aktuální plán potřebujete připojení." })
    .waitFor();
  assert.equal(
    (await page.locator("body").innerText()).includes("VP-2026"),
    false,
  );
  await context.setOffline(false);
  await page.getByRole("link", { name: "Zkusit znovu" }).click();
  await page.getByRole("heading", { name: "Výroba pod kontrolou." }).waitFor();
  console.log(
    "PWA OK: manifest, ikony, registrace, veřejná cache, offline stránka a návrat online.",
  );
} finally {
  await browser.close();
}
