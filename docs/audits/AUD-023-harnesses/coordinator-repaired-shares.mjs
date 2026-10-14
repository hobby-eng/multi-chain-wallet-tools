// AUD-023 coordinator: the required verification of AUD-023-API001 on the built pages. Shares that
// a repair writes again must go where MnemoCode's sskr-export saves them: a text file with one
// share per line, and cards in every page size. Written after the remediation, so it has no
// baseline run; at the reviewed snapshot the repair offered neither.
//
// Steps per edition and engine, as a person does them: split the public test phrase into 2-of-3
// word shares; in Forgotten, repair share 2 with its 8th element replaced by ?; save the repaired
// shares as a text file; then in Encode › Printable cards choose "shares" (which must now name the
// repaired shares) and save cards at A6, A4 and business-card size. Every HTTP(S) request is
// aborted and must not occur; storage must stay empty.
//
// Input: dist/ of both editions (read only), from `pnpm build`. Downloads go to Playwright's
// temporary folder and are deleted with the browser. Run (heavy: starts browsers):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/coordinator-repaired-shares.mjs
// BROWSER_ENGINES (default chromium,firefox) narrows the engines. Exit 0 when every check holds,
// 1 when one fails, 2 when a browser or page could not start.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";

const root = resolve(import.meta.dirname, "../../..");
const PAGES = {
  "multi-chain": "dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
  "dash-community": "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
};
// The public BIP39 test phrase.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// The place of the element marked unreadable in share 2 (1-based 8, as the regression suite uses).
const MARKED_ELEMENT = 7;
const SIZES = [
  ["a6", "share-cards-a6.pdf", "%PDF-"],
  ["a4", "share-cards-a4.pdf", "%PDF-"],
  ["business", "share-cards-business.zip", "PK"],
];

const results = [];
const check = (label, ok, observed) => {
  results.push({ label, ok: Boolean(ok), observed });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : `\n     observed: ${JSON.stringify(observed)}`}`);
};

async function waitText(page, selector, pattern, timeout = 120_000) {
  await page.waitForFunction(
    ([s, source]) => new RegExp(source, "u").test(document.querySelector(s)?.textContent ?? ""),
    [selector, pattern.source],
    { timeout },
  );
}

async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), trigger()]);
  return { name: file.suggestedFilename(), bytes: readFileSync(await file.path()) };
}

async function run(browser, engine, profile) {
  const label = `${profile} ${engine}`;
  const context = await browser.newContext({ acceptDownloads: true });
  const requests = [];
  await context.route("**/*", (route) => {
    if (/^(file|blob|data|about):/u.test(route.request().url())) return route.continue();
    requests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(pathToFileURL(resolve(root, PAGES[profile])).href);
  await page.locator("#crypto-self-test-status.passed").waitFor({ timeout: 120_000 });
  const tab = (name) =>
    page.locator(`[data-operation-tab][aria-controls="mnemocode-${name}-panel"]`).click();

  await page.locator("#recovery-backup-mode").click();
  await page.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
  await page.locator("#mnemocode-source").fill(PHRASE);
  await page.locator("#mnemocode-split-section > summary").click();
  await page.locator("#mnemocode-split-form").selectOption("words");
  await page.locator("#mnemocode-split").click();
  const split = page.locator("#mnemocode-split-result");
  await split.locator(".share-secret").first().waitFor();
  const shares = await split.locator(".share-secret").allTextContents();
  check(`${label}: the split writes 3 shares`, shares.length === 3, shares.length);

  const marked = shares[1].split(" ");
  marked[MARKED_ELEMENT] = "?";
  await tab("forgotten");
  await page.locator("#mnemocode-forgotten-kind-share").check();
  await page.locator("#mnemocode-forgotten-shares").fill(`${shares[0]}\n${marked.join(" ")}`);
  await page.locator("#mnemocode-forgotten-shares-wallet-none").check();
  await page.locator("#mnemocode-forgotten-shares-repair").click();
  await waitText(page, "#mnemocode-forgotten-shares-status", /The shares are written again\./u);
  const repaired = page.locator("#mnemocode-forgotten-shares-result");

  const text = await download(page, () =>
    repaired.getByRole("button", { name: "Save as a text file" }).click(),
  );
  check(
    `${label}: the repaired shares are saved as a text file, one share per line`,
    text.bytes.toString("utf8") === `${shares[0]}\n${shares[1]}\n`,
    { name: text.name, lines: text.bytes.toString("utf8").split("\n").length },
  );
  check(
    `${label}: the result points to the card export`,
    /Printable cards/u.test(await repaired.innerText()),
    await repaired.innerText(),
  );

  await tab("create");
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#mnemocode-cards-section > summary").click();
  await page.locator("#mnemocode-card-source-shares").check();
  const note = await page.locator("#mnemocode-card-source-shares-note").innerText();
  check(`${label}: the card source names the repaired shares`, /repaired shares/u.test(note), note);
  for (const [size, name, magic] of SIZES) {
    await page.locator("#mnemocode-card-page-size").selectOption(size);
    const file = await download(page, () => page.locator("#export-mnemocode-cards").click());
    await waitText(page, "#mnemocode-cards-status", /^Saved /u);
    const status = await page.locator("#mnemocode-cards-status").innerText();
    check(
      `${label}: repaired shares print as cards at ${size}`,
      file.name === name && file.bytes.subarray(0, magic.length).toString("latin1") === magic,
      { name: file.name, bytes: file.bytes.length, status },
    );
  }

  const storage = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  check(`${label}: nothing stored`, storage[0] === 0 && storage[1] === 0, storage);
  check(`${label}: no network request`, requests.length === 0, requests);
  check(`${label}: no page error`, errors.length === 0, errors);
  await context.close();
}

const { chromium, firefox } = await loadPlaywright();
let setupFailed = false;
for (const engine of (process.env.BROWSER_ENGINES ?? "chromium,firefox").split(",")) {
  let browser;
  try {
    browser = await { chromium, firefox }[engine].launch({ headless: true });
  } catch (error) {
    console.log(`SETUP ${engine} could not start: ${error}`);
    setupFailed = true;
    continue;
  }
  try {
    for (const profile of Object.keys(PAGES)) await run(browser, engine, profile);
  } catch (error) {
    console.log(`FAIL ${engine}: ${error}`);
    results.push({ label: `${engine} run`, ok: false, observed: String(error) });
  } finally {
    await browser.close();
  }
}
const failed = results.filter((result) => !result.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed.`);
process.exit(failed > 0 ? 1 : setupFailed ? 2 : 0);
