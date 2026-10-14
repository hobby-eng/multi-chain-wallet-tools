// Bounded final-page inspection: no secrets, provider calls, cards, PDFs, or MHFE operations.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild } from "../../../tooling/build-profiles.mjs";

const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(root, "docs/audits/AUD-022-evidence");
const label = process.argv[2] ?? "verified";
assert.match(label, /^[a-z0-9-]+$/u);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const report = { browser: browser.version(), pages: [], layouts: [] };
try {
  for (const id of ["multi-chain", "dash-community"]) {
    const profile = BUILD_PROFILES[id];
    for (const tool of ["key-derivation", "discovery-scanner", "activity-viewer"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const file = resolve(root, "dist", getToolBuild(profile, tool).artifactRelativePath);
      await page.goto(pathToFileURL(file).href);
      // Scanner metadata belongs to its opaque Secret Vault, as in the production page.
      const scope =
        tool === "discovery-scanner" ? page.frameLocator("#recovery-secret-vault") : page;
      const passport = await scope.locator(".passport-dependencies").innerText();
      assert.match(passport, /wasm-bindgen 0\.2\.129/u);
      assert.doesNotMatch(passport, /wasm-bindgen 0\.2\.128/u);
      report.pages.push({
        id,
        tool,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
        passport,
      });
      if (tool === "key-derivation") {
        await page.locator("#crypto-self-test-status.passed").waitFor();
        await page.locator("#recovery-backup-mode").click();
        for (const [tab, width, height] of [
          ["mhfe", 1280, 900],
          ["mnemocode", 1280, 900],
          ["mhfe", 390, 844],
          ["mnemocode", 390, 844],
        ]) {
          await page.setViewportSize({ width, height });
          await page.locator(`[data-recovery-tab][aria-controls="${tab}-panel"]`).click();
          await page.locator(`#${tab}-panel`).scrollIntoViewIfNeeded();
          const dimensions = await page.evaluate(() => ({
            contentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
          }));
          const screenshot = `${id}-${tab}-${width}-${label}.png`;
          await page.screenshot({ path: resolve(evidence, screenshot) });
          report.layouts.push({ id, tab, width, height, dimensions, screenshot });
          assert.ok(dimensions.contentWidth <= width + 1, "Recovery page overflows horizontally");
        }
      }
      await context.close();
    }
  }
} finally {
  writeFileSync(
    resolve(evidence, `browser-layout-${label}-report.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(
  JSON.stringify({
    metadataPages: report.pages.length,
    layouts: report.layouts.length,
    browser: report.browser,
  }),
);
