// Capture README screenshots from the live production build at
// http://127.0.0.1:7878. Run after `npm run build` and after the service is
// loaded.
//
// One-off setup (Playwright is not in package.json):
//   npm install --no-save playwright
//   npx playwright install chromium
//   node docs/take-screenshots.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "screenshots");
const BASE = "http://127.0.0.1:7878";

const SHOTS = [
  { name: "01-jobs-list.png", path: "/" },
  { name: "02-job-new.png", path: "/new" },
  { name: "03-job-logs.png", path: "/jobs/health/logs" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2, // crisp for retina-style rendering on GitHub
  colorScheme: "dark",
});
const page = await ctx.newPage();

for (const shot of SHOTS) {
  await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  // Settle a touch — auto-refresh timers can be mid-cycle on first paint.
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, shot.name),
    fullPage: false,
  });
  console.log(`captured ${shot.name}`);
}

await browser.close();
