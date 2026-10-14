// AUD-026 build reviewer (CHECK-BLD-002): opens selective pages that build-selective-sample.mjs wrote
// to the scratch folder (first argument) as file:// URLs in headless Chromium, and waits for each
// page's startup self-test to pass, as tooling/verify-selective-browser-smoke.mjs does for its own
// five variants (which never run while one of them fails to build). It also checks that the page
// raised no error and that the controls of a left-out feature are absent. Exit 1 on any failure.
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const scratch = resolve(
  process.argv[2] ?? resolve(root, "../tmp/wallet-tools/aud026/build/selective"),
);
const DERIVER = { selfTest: "#crypto-self-test-status.passed" };
const VAULT = {
  selfTest: "#recovery-crypto-self-test-status.passed",
  frame: "#recovery-secret-vault",
};
const cases = [
  ["E01", "Deriver Dash+Ethereum, every feature (no default coin)", DERIVER, []],
  ["E02", "Deriver without mhfe", DERIVER, ["#mhfe-panel", "#wallet-check-enabled"]],
  ["E03", "Deriver without mnemocode", DERIVER, ["#mnemocode-panel"]],
  ["E04", "Deriver Ethereum derive only", DERIVER, ["#mhfe-panel", "#bip85-panel"]],
  ["E16", "Deriver Ethereum derive+mhfe", DERIVER, ["#mnemocode-panel"]],
  ["S27", "Deriver Bitcoin derive+mhfe", DERIVER, ["#mnemocode-panel"]],
  ["E09", "Dash Deriver derive+mhfe", DERIVER, ["#mnemocode-panel"]],
  ["E07", "Dash Deriver without mhfe", DERIVER, ["#mhfe-panel", "#wallet-check-enabled"]],
  ["E12", "Discovery Dash+Ethereum", VAULT, []],
];
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
let failures = 0;
try {
  for (const [id, label, kind, absent] of cases) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    const started = Date.now();
    let outcome = "pass";
    try {
      await page.goto(pathToFileURL(resolve(scratch, `${id}.html`)).href);
      const scope = kind.frame === undefined ? page : page.frameLocator(kind.frame);
      await scope.locator(kind.selfTest).waitFor({ timeout: 120_000 });
      for (const selector of absent) {
        const count = await scope.locator(selector).count();
        if (count !== 0) throw new Error(`${selector} present (${count})`);
      }
      if (errors.length > 0) throw new Error(`page errors: ${errors.join("; ")}`);
    } catch (error) {
      failures += 1;
      const status = await page
        .locator(kind.selfTest.split(".")[0])
        .first()
        .textContent()
        .catch(() => null);
      outcome = `FAIL ${String(error.message).split("\n")[0]} (status: ${status ?? "n/a"}; errors: ${errors.join("; ") || "none"})`;
    }
    console.log(
      `${outcome.startsWith("FAIL") ? "FAIL" : "pass"} ${id} ${label} ${Date.now() - started} ms${outcome === "pass" ? "" : `\n     ${outcome}`}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Selective startup cases failing: ${failures}/${cases.length}`);
if (failures > 0) process.exitCode = 1;
