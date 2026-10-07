// Renders the PNG fallbacks with the Playwright Chromium already installed for e2e (no new dependency).
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const sized = (svg, size) => svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1, colorScheme: "light" });
for (const [file, size, out] of [
  ["src/app/icon1.svg", 32, "src/app/icon2.png"],
  ["scripts/brand/mark-16.svg", 16, "src/app/icon3.png"],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized(await readFile(file, "utf8"), size)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log("wrote src/app/icon2.png and src/app/icon3.png");
