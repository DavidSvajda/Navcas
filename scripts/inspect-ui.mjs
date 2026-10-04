import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));
page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE:", message.text());
});
await page.goto(process.env.APP_URL || "http://127.0.0.1:5173/");
await page.waitForTimeout(1500);
console.log((await page.locator("body").innerText()).slice(0, 1500));
await mkdir("artifacts", { recursive: true });
await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
console.log(
  "DOCUMENT WIDTH:",
  await page.evaluate(() => document.documentElement.scrollWidth),
);
console.log(
  "OVERFLOW:",
  await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.right > innerWidth + 1 &&
          ["absolute", "fixed"].includes(getComputedStyle(el).position)
        );
      })
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        right: el.getBoundingClientRect().right,
        left: el.getBoundingClientRect().left,
      }))
      .slice(0, 15),
  ),
);
await browser.close();
