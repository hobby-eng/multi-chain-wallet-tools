// AUD-023 remediation browser probe for AUD-022-API003 (and the Scanner end of AUD-022-SEC002):
// in the coordinator's fresh dist/ build of each edition, the Deriver's MnemoCode › Restore restores
// the two public shares of MnemoCode's SSKR vector bip39-128-2-of-3, writes the candidate list to
// the Scanner's one-time key with the public BIP39 passphrase TREZOR, and saves it; the Scanner of
// the same edition then opens that very file and says what it holds; Remove takes it out again.
// This exercises the page, its share worker and the transfer of the list bytes, which the Node
// probes do not. Public test data only; every HTTP(S) request is aborted and counted.
//
// Run from the repository root (heavy: starts browsers):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/remediation-browser-share-list.mjs
// BROWSER_ENGINES=chromium,firefox (default) and BROWSER_PROFILE=<id> narrow the run.
// Exit 0: every case passed; 1: a check failed; 2: a browser could not start.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild } from "../../../tooling/build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const scratch = resolve(root, "docs/audits/AUD-023-evidence/scratch/remediation");
mkdirSync(scratch, { recursive: true });
const { chromium, firefox } = await loadPlaywright();
/** Two of the three shares of MnemoCode's public SSKR vector bip39-128-2-of-3 (entropy 00..0f). */
const VECTOR_SHARES = [
  "ur:sskr/goemjzaeadaejoinoyvotkwlptsskispvwbkbwjnamstlubnampf",
  "ur:sskr/goemjzaeadadflihpkmhspcheycndschfhcmkelyvaveiesolrls",
];
const TREZOR = "TREZOR";

const artifact = (profile, tool) =>
  resolve(root, "dist", getToolBuild(profile, tool).artifactRelativePath);

async function open(context, profile, tool, run) {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => run.pageErrors.push(String(error)));
  const path = artifact(profile, tool);
  run.artifacts[path] = createHash("sha256").update(readFileSync(path)).digest("hex");
  await page.goto(pathToFileURL(path).href);
  return page;
}

async function shareListCase(context, profile, run) {
  const scanner = await open(context, profile, "discovery-scanner", run);
  const vault = scanner.frameLocator("#recovery-secret-vault");
  await vault.locator("#recovery-self-test.passed").waitFor();
  await vault.locator('[data-input-mode="batch"]').click();
  await vault.locator("#candidate-list-import > summary").click();
  await vault.locator("#candidate-list-show-key").click();
  const key = vault.locator("#candidate-list-key");
  await key.waitFor({ state: "visible" });
  const recipient = await key.inputValue();
  assert.match(recipient, /^age1[0-9a-z]+$/u);
  run.checks.push("Scanner: one-time key shown");

  const deriver = await open(context, profile, "key-derivation", run);
  await deriver.locator("#crypto-self-test-status.passed").waitFor();
  await deriver.locator("#recovery-backup-mode").click();
  await deriver.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
  await deriver.locator('[data-operation-tab][aria-controls="mnemocode-restore-panel"]').click();
  await deriver.locator("#mnemocode-restore-shares").fill(VECTOR_SHARES.join("\n"));
  await deriver.locator("#mnemocode-restore-list").check();
  await deriver.locator("#mnemocode-restore-list-protect-key").check();
  await deriver.locator("#mnemocode-restore-list-key").fill(recipient);
  // The BIP39 passphrase the list stores, asked also without a wallet check.
  await deriver.locator("#mnemocode-restore-wallet-passphrase").fill(TREZOR);
  await deriver.locator("#mnemocode-restore").click();
  await deriver.waitForFunction(() =>
    /The phrase is restored\./u.test(
      document.querySelector("#mnemocode-restore-status")?.textContent ?? "",
    ),
  );
  const result = deriver.locator("#mnemocode-restore-result");
  assert.match(await result.innerText(), /candidates\.age: 1 candidates/u);
  const [download] = await Promise.all([
    deriver.waitForEvent("download"),
    result.locator("button", { hasText: "Save candidate list" }).click(),
  ]);
  assert.equal(download.suggestedFilename(), "candidates.age");
  const bytes = readFileSync(await download.path());
  await download.delete();
  assert.ok(bytes.length > 0);
  run.checks.push("Deriver: share restore wrote a one-record list to the Scanner key and saved it");

  await vault.locator("#candidate-list-file").setInputFiles({
    name: "candidates.age",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  assert.equal(await vault.locator("#candidate-list-passphrase-field").isHidden(), true);
  await vault.locator("#candidate-list-open").click();
  const status = vault.locator("#candidate-list-status");
  await status.filter({ hasText: /candidate from the list/u }).waitFor();
  assert.equal(
    await status.innerText(),
    "1 candidate from the list, with the BIP39 passphrase stored in the list. They are checked in place of the phrases typed above.",
  );
  assert.equal(await vault.locator("#candidate-list-remove").isVisible(), true);
  run.checks.push("Scanner: opened the Deriver's file: 1 candidate, with its stored passphrase");

  await vault.locator("#candidate-list-remove").click();
  assert.equal(await status.innerText(), "");
  assert.equal(await vault.locator("#candidate-list-remove").isHidden(), true);
  run.checks.push("Scanner: Remove took the list out");
  assert.deepEqual(run.requests, []);
  assert.deepEqual(run.pageErrors, []);
}

/**
 * AUD-022-API001/API002 in the page: a word search whose phrase no word completes, with a list
 * asked for, completes and says that no list was written; a BIP39 passphrase that no list can
 * store is refused before the search starts.
 */
async function forgottenListCase(context, profile, run) {
  const deriver = await open(context, profile, "key-derivation", run);
  await deriver.locator("#crypto-self-test-status.passed").waitFor();
  await deriver.locator("#recovery-backup-mode").click();
  await deriver.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
  await deriver.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  // From the browser regression suite: no fifth word gives a valid phrase ending in "sure".
  const impossible = Array(24).fill("abandon");
  impossible[4] = "?";
  impossible[23] = "sure";
  await deriver.locator("#mnemocode-forgotten-kind-word").check();
  await deriver.locator("#mnemocode-forgotten-where-places").check();
  await deriver.locator("#mnemocode-forgotten-phrase").fill(impossible.join(" "));
  await deriver.locator("#mnemocode-forgotten-wallet-none").check();
  await deriver.locator("#mnemocode-forgotten-list").check();
  await deriver.locator("#mnemocode-forgotten-list-protect-passphrase").check();
  await deriver.locator("#mnemocode-forgotten-list-passphrase").fill("synthetic list passphrase");
  await deriver
    .locator("#mnemocode-forgotten-list-passphrase-confirm")
    .fill("synthetic list passphrase");
  await deriver.locator("#mnemocode-forgotten-search").click();
  const status = deriver.locator("#mnemocode-forgotten-status");
  await status.filter({ hasText: /Search complete/u }).waitFor();
  const result = deriver.locator("#mnemocode-forgotten-result");
  assert.match(await result.innerText(), /No valid phrase fits/u);
  assert.match(await result.innerText(), /No candidate to save, so no list was written\./u);
  assert.equal(await result.locator("button", { hasText: "Save candidate list" }).count(), 0);
  run.checks.push(
    "Deriver Forgotten: empty search with a list asked for completes, no list (API001)",
  );

  await deriver.locator("#mnemocode-forgotten-wallet-passphrase").fill("x".repeat(257));
  await deriver.locator("#mnemocode-forgotten-search").click();
  await status.filter({ hasText: /longer than 256 bytes/u }).waitFor();
  assert.doesNotMatch(await status.innerText(), /Search complete/u);
  run.checks.push(
    "Deriver Forgotten: a 257-byte BIP39 passphrase for the list is refused before the search (API002)",
  );
  assert.deepEqual(run.requests, []);
  assert.deepEqual(run.pageErrors, []);
}

const report = { startedAt: new Date().toISOString(), runs: [] };
let failed = false;
let startFailure = false;
for (const engine of (process.env.BROWSER_ENGINES ?? "chromium,firefox").split(",")) {
  let browser;
  try {
    browser = await { chromium, firefox }[engine].launch({
      headless: true,
      downloadsPath: scratch,
      executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`],
    });
  } catch (error) {
    startFailure = true;
    report.runs.push({ engine, passed: false, error: String(error) });
    continue;
  }
  try {
    for (const profile of Object.values(BUILD_PROFILES)) {
      if (process.env.BROWSER_PROFILE && process.env.BROWSER_PROFILE !== profile.id) continue;
      const run = {
        engine,
        version: browser.version(),
        profile: profile.id,
        passed: false,
        artifacts: {},
        checks: [],
        requests: [],
        pageErrors: [],
      };
      report.runs.push(run);
      const context = await browser.newContext({ acceptDownloads: true });
      await context.route(/^https?:\/\//u, async (route) => {
        run.requests.push(route.request().url());
        await route.abort();
      });
      try {
        await shareListCase(context, profile, run);
        await forgottenListCase(context, profile, run);
        run.passed = true;
      } catch (error) {
        failed = true;
        run.error = String(error.stack ?? error);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
report.completedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 2));
process.exitCode = startFailure ? 2 : failed ? 1 : 0;
