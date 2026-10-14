// AUD-023 build reviewer harness: opens each selective Deriver variant built by
// build-selective-variants.mjs as a file:// page in a fresh browser context and checks that its
// startup self-test passes, that it raises no page error and makes no network request, and prints
// the startup checks it ran and the coins MnemoCode's wallet question offers. No secret is typed.
//
//   node docs/audits/AUD-023-harnesses/build-variant-startup.mjs [chromium|firefox] [variant-id ...]
//
// Exits 1 when a variant does not pass its startup self-test, raises a page error or makes a
// request.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { VARIANTS } from "./build-selective-variants.mjs";

const out = resolve(import.meta.dirname, "../AUD-023-evidence/builds/build");
const [engineName = "chromium", ...requested] = process.argv.slice(2);
const ids = requested.length > 0 ? requested : Object.keys(VARIANTS);
const playwright = await loadPlaywright();
const browser = await playwright[engineName].launch({ headless: true });
let failures = 0;
try {
  for (const id of ids) {
    const path = resolve(out, `${id}.html`);
    if (!existsSync(path)) {
      console.log(`${id}: not built`);
      failures += 1;
      continue;
    }
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    context.on("request", (request) => {
      if (
        !request.url().startsWith("file:") &&
        !request.url().startsWith("data:") &&
        !request.url().startsWith("blob:")
      )
        requests.push(request.url());
    });
    await page.goto(pathToFileURL(path).href);
    const status = page.locator("#crypto-self-test-status");
    await page
      .waitForFunction(
        () =>
          /passed|failed/u.test(
            document.querySelector("#crypto-self-test-status")?.className ?? "",
          ),
        undefined,
        { timeout: 120_000 },
      )
      .catch(() => undefined);
    const className = (await status.getAttribute("class")) ?? "";
    const details = ((await page.locator("#crypto-self-test-details").textContent()) ?? "")
      .replace(/\s+/gu, " ")
      .trim();
    const coins = await page
      .locator("#mnemocode-forgotten-wallet-coin option")
      .allTextContents()
      .catch(() => []);
    const tabs = await page
      .locator("[data-recovery-tab]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-controls")));
    const passed = /\bpassed\b/u.test(className);
    const ok = passed && errors.length === 0 && requests.length === 0;
    if (!ok) failures += 1;
    console.log(
      `${engineName}/${id}: ${ok ? "OK" : "FAILED"}; status "${(await status.textContent())?.trim()}" (${className}); ` +
        `page errors ${errors.length}${errors.length ? ` [${errors.join(" | ")}]` : ""}; requests ${requests.length}` +
        `${requests.length ? ` [${requests.join(", ")}]` : ""}\n  checks: ${details}\n  recovery tabs: ${tabs.join(", ")}\n` +
        `  MnemoCode wallet coins: ${coins.join(", ") || "(none)"}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failures === 0 ? 0 : 1;
