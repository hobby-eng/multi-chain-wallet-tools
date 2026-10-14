// AUD-023 selftests: does the Deriver's "Run the full self-test" respect the one-heavy-job rule of
// Recover & Back Up (recovery-job-gate.ts: "only one runs at a time across all panels")? The full
// self-test runs MnemoCode's full self-test, which the MnemoCode tab itself runs as a heavy job.
// The check starts a heavy job (the MnemoCode tab's self-test) and looks at whether the full
// self-test can start beside it, and the other way round.
//
// Input: dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html (read only).
// Run (heavy: starts a browser):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/selftests-heavy-gate.mjs
// Exit code 0 when the gate holds both ways, 1 when it does not.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";

const root = resolve(import.meta.dirname, "../../..");
const artifact = `${root}/dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  const context = await browser.newContext();
  await context.route("**/*", (r) =>
    /^(file|blob|data):/u.test(r.request().url()) ? r.continue() : r.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.goto(pathToFileURL(artifact).href);
  await page.locator("#crypto-self-test-status.passed").waitFor();
  const state = () =>
    page.evaluate(() => ({
      full: document.querySelector("#full-self-test-status").textContent.trim(),
      fullButtonDisabled: document.querySelector("#full-self-test").disabled,
      mnemocode: document.querySelector("#mnemocode-self-test-status").textContent.trim(),
      mhfeButtonDisabled: document.querySelector("#mhfe-selftest").disabled,
      busy: document.querySelector("#recovery-busy").textContent.trim(),
    }));
  const idle = () =>
    page.waitForFunction(
      () =>
        !document.querySelector("#full-self-test").disabled &&
        !/Running/u.test(document.querySelector("#mnemocode-self-test-status").textContent),
      null,
      { timeout: 300_000 },
    );

  // 1. Full self-test first: does the gate know that a heavy job runs?
  await page.locator("#full-self-test").click();
  const duringFull = await state();
  console.log("During the full self-test:", duringFull);
  if (!duringFull.mhfeButtonDisabled)
    failures.push("MHFE self-test (2 GiB) can start while the full self-test runs");
  await page.evaluate(() => document.querySelector("#mnemocode-self-test").click());
  const both = await state();
  console.log("After pressing the MnemoCode tab's self-test as well:", both);
  if (
    /Running the full self-test/u.test(both.full) &&
    /Running the self-test/u.test(both.mnemocode)
  )
    failures.push("two MnemoCode full self-tests run at once (full self-test + MnemoCode tab)");
  await idle();

  // 2. A heavy job first: can the full self-test start beside it?
  await page.evaluate(() => document.querySelector("#mnemocode-self-test").click());
  const duringHeavy = await state();
  console.log("During the MnemoCode tab's self-test:", duringHeavy);
  if (!duringHeavy.fullButtonDisabled)
    failures.push("the full self-test button stays enabled while a heavy job runs");
  await idle();
  await context.close();
} finally {
  await browser.close();
}
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(
  failures.length === 0 ? "PASS the heavy-job gate holds" : `${failures.length} failure(s)`,
);
process.exit(failures.length === 0 ? 0 : 1);
