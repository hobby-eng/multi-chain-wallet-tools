// AUD-023 selftests: drives the built artifacts in Chromium to see what each page does with its
// startup and full self-tests: the pass path, a startup failure, a full self-test that fails part
// way, double clicks, and whether a failed startup really keeps a feature's controls closed.
//
// Faults are injected without touching dist/ or the product: either a browser-level override
// (crypto.getRandomValues returns a constant, set before any page script runs) or a copy of the
// artifact in the scratch folder where one expected literal is changed and the page's CSP script
// hash is recomputed for the changed script. Every non-file request is aborted and counted.
//
// Inputs: dist/<edition>/ (the coordinator's build, read only). Public test data only.
// Run (heavy: starts a browser):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/selftests-browser.mjs
// Exit code 0 when every expectation holds, 1 when any fails (a FAIL names the defect).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";

const root = resolve(import.meta.dirname, "../../..");
const scratch = resolve(root, "docs/audits/AUD-023-evidence/scratch/selftests");
mkdirSync(scratch, { recursive: true });
const MC = resolve(root, "dist/multi-chain-edition");
const ARTIFACTS = {
  deriver: `${MC}/key-derivation/Wallet_Key_Derivation_Tool.html`,
  inspector: `${MC}/psbt-inspector/PSBT_Multisig_Inspector.html`,
  viewer: `${MC}/activity-viewer/Wallet_Activity_Viewer.html`,
  scanner: `${MC}/discovery-scanner/Wallet_Discovery_Scanner.html`,
};
const DC = resolve(root, "dist/dash-community-edition");
const DASH = {
  deriver: `${DC}/key-derivation/Dash_Community_Key_Derivation_Tool.html`,
  inspector: `${DC}/psbt-inspector/Dash_Community_PSBT_Multisig_Inspector.html`,
};
const PHRASE = `${"abandon ".repeat(11)}about`;
const SECRET_MARKERS = ["abandon", "AGE-SECRET-KEY", "Satoshi", "TREZOR", "bb051cd0dd"];

const expectations = [];
function expect(name, ok, observed) {
  expectations.push({ name, ok: Boolean(ok), observed });
}

/** A copy of `artifact` with `from` replaced by `to` once, its CSP script hash recomputed. */
function mutatedCopy(artifact, from, to, name) {
  const html = readFileSync(artifact, "utf8");
  // indexOf, not a regular expression: the scripts are tens of megabytes.
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>", start);
  if (start < 0 || html.indexOf("<script", end) >= 0)
    throw new Error(`${artifact}: expected one inline script`);
  const script = html.slice(start + "<script>".length, end);
  const hash = (text) => createHash("sha256").update(text, "utf8").digest("base64");
  if (!html.includes(`'sha256-${hash(script)}'`))
    throw new Error("CSP hash of the script not found");
  if (script.split(from).length !== 2) throw new Error(`${from} must occur once in the script`);
  const changed = script.replace(from, to);
  const output = html
    .replace(script, () => changed)
    .replace(`'sha256-${hash(script)}'`, `'sha256-${hash(changed)}'`);
  const path = `${scratch}/${name}.html`;
  writeFileSync(path, output);
  return path;
}

async function withPage(browser, path, options, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const network = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^(file|blob|data):/u.test(url)) return route.continue();
    network.push(url);
    return route.abort();
  });
  if (options.initScript) await context.addInitScript(options.initScript);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const consoleLines = [];
  const errors = [];
  page.on("console", (message) => consoleLines.push(message.text()));
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await page.goto(pathToFileURL(path).href);
    return await run(page);
  } finally {
    const leaked = consoleLines.filter((line) => SECRET_MARKERS.some((m) => line.includes(m)));
    expect(`${options.label}: no test secret in the console`, leaked.length === 0, leaked);
    expect(`${options.label}: no network request`, network.length === 0, network);
    if (errors.length) console.log(`  page errors (${options.label}):`, errors.slice(0, 3));
    await context.close();
  }
}

const text = (page, selector) => page.locator(selector).innerText();
const disabled = (page, selector) => page.locator(selector).isDisabled();

/** Counts how often the status line reads `running` from now on. */
async function countRuns(page, selector, running) {
  await page.evaluate(
    ([sel, value]) => {
      window.__runs = 0;
      const node = document.querySelector(sel);
      new MutationObserver(() => {
        if (node.textContent === value) window.__runs += 1;
      }).observe(node, { childList: true, characterData: true, subtree: true });
    },
    [selector, running],
  );
}

/** Ticks a feature's checkbox, waits for its tab, opens it and waits for its button. */
async function openFeatureTab(page, checkbox, tab, button) {
  await page.locator(checkbox).check();
  await page.locator(tab).waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(tab).click();
  await page.locator(button).waitFor({ state: "visible", timeout: 10_000 });
}

/**
 * Waits for a tab's own output; when none comes by itself, presses its button once it is enabled.
 * Returns the output text, empty when the tab refused or showed an error. (No eval: the pages'
 * CSP forbids it.)
 */
async function deriveInTab(page, button, outputSelector, property, errorSelector) {
  const read = ([o, p]) => document.querySelector(o)?.[p] ?? "";
  const settled = () =>
    page
      .waitForFunction(
        ([o, p, e]) =>
          (document.querySelector(o)?.[p] ?? "") !== "" ||
          document.querySelector(e)?.hidden === false,
        [outputSelector, property, errorSelector],
        { timeout: 8_000 },
      )
      .then(
        () => true,
        () => false,
      );
  if (!(await settled())) {
    const enabled = await page
      .locator(button)
      .isEnabled({ timeout: 20_000 })
      .catch(() => false);
    if (enabled) {
      await page.locator(button).click();
      await settled();
    }
  }
  return page.evaluate(read, [outputSelector, property]);
}

// Overridden before any page script: the Web Crypto source returns a constant.
const constantRandomness = () => {
  const original = Crypto.prototype.getRandomValues;
  Crypto.prototype.getRandomValues = function (array) {
    original.call(this, array);
    return array.fill(7);
  };
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
try {
  // ---------------------------------------------------------------- Deriver, as built
  await withPage(browser, ARTIFACTS.deriver, { label: "Deriver" }, async (page) => {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    const details = await text(page, "#crypto-self-test-details");
    const milliseconds = Number(details.match(/passed in ([\d,]+) ms/u)?.[1].replaceAll(",", ""));
    console.log(`  Deriver startup: ${details.slice(0, 120)}… (${milliseconds} ms)`);
    expect(
      "Deriver: startup names BIP85, Silent Payments, compact signatures, randomness",
      /BIP85/u.test(details) &&
        /Silent Payments/u.test(details) &&
        // Per-coin names since the AUD-023 remediation (AUD-023-BLD001); one name before it.
        /Compact message signatures|Bitcoin compact message signature/u.test(details) &&
        /randomness/u.test(details),
      details,
    );
    expect("Deriver: startup suite under 2 s", milliseconds < 2000, milliseconds);
    expect(
      "Deriver: full self-test button enabled after a pass",
      !(await disabled(page, "#full-self-test")),
    );
    await countRuns(page, "#full-self-test-status", "Running the full self-test…");
    await page.locator("#full-self-test").dblclick();
    expect(
      "Deriver: full self-test button disabled while it runs",
      await disabled(page, "#full-self-test"),
    );
    await page.waitForFunction(() => !document.querySelector("#full-self-test").disabled, null, {
      timeout: 300_000,
    });
    const status = await text(page, "#full-self-test-status");
    const rows = await page.locator("#full-self-test-result tr").count();
    console.log(`  Deriver full self-test: ${status} (${rows} rows)`);
    expect(
      "Deriver: a double click starts one full run",
      (await page.evaluate(() => window.__runs)) === 1,
      await page.evaluate(() => window.__runs),
    );
    // Known gap (brief): MnemoCode's candidate-encryption check fails in browsers until upstream.
    expect(
      "Deriver: full self-test passes (known gap: MnemoCode candidate encryption)",
      /^Every check passed/u.test(status),
      status,
    );
  });

  // ---------------------------------------------------------------- Deriver, broken randomness
  await withPage(
    browser,
    ARTIFACTS.deriver,
    { label: "Deriver broken randomness", initScript: constantRandomness },
    async (page) => {
      await page.locator("#crypto-self-test-status.failed").waitFor();
      const details = await text(page, "#crypto-self-test-details");
      expect(
        "Deriver: constant randomness fails the startup self-test",
        /repeats itself/u.test(details),
        details,
      );
      expect(
        "Deriver: derive and generate stay disabled",
        (await disabled(page, "#generate-12")) && (await disabled(page, "#derive-button")),
      );
      expect("Deriver: full self-test stays disabled", await disabled(page, "#full-self-test"));
    },
  );

  // ---------------------------------------------------------------- Deriver, BIP85 answer wrong
  const bip85Copy = mutatedCopy(
    ARTIFACTS.deriver,
    "Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhp",
    "Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhq",
    "deriver-bip85-mutated",
  );
  await withPage(
    browser,
    bip85Copy,
    { label: "Deriver BIP85 known answer changed" },
    async (page) => {
      await page.locator("#crypto-self-test-status.failed").waitFor();
      const details = await text(page, "#crypto-self-test-details");
      expect(
        "Deriver: a wrong BIP85 answer fails the startup self-test",
        /BIP85 WIF/u.test(details),
        details,
      );
      // Does the failure keep BIP85 and Silent Payments closed, as the workspace rule requires?
      await page.locator("#mnemonic").fill(PHRASE);
      // As a person does it: tick "Child seeds (BIP85)", open its tab, press Derive (the tab may
      // already derive by itself once the phrase is complete).
      await openFeatureTab(page, "#include-bip85", "#bip85-tab", "#derive-bip85");
      const bip85Output = await deriveInTab(
        page,
        "#derive-bip85",
        "#bip85-output",
        "value",
        "#bip85-error",
      );
      const words = bip85Output.trim().split(/\s+/u).filter(Boolean).length;
      console.log(`  BIP85 after failed startup: output words=${words}`);
      expect("Deriver: BIP85 stays closed after its startup check failed", words === 0, {
        words,
      });
      await openFeatureTab(
        page,
        "#include-silent-payment",
        "#silent-payment-tab",
        "#derive-silent-payment",
      );
      const spAddress = await deriveInTab(
        page,
        "#derive-silent-payment",
        "#silent-payment-address",
        "textContent",
        "#silent-payment-error",
      );
      console.log(`  Silent Payments after failed startup: address=${spAddress.slice(0, 16)}…`);
      expect(
        "Deriver: Silent Payments stay closed after a failed startup",
        !spAddress.startsWith("sp1"),
        { spAddress: spAddress.slice(0, 16) },
      );
    },
  );

  // ---------------------------------------------------------------- Deriver, full-only failure
  const bip38Copy = mutatedCopy(
    ARTIFACTS.deriver,
    "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH",
    "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpJ",
    "deriver-bip38-mutated",
  );
  await withPage(
    browser,
    bip38Copy,
    { label: "Deriver BIP38 known answer changed" },
    async (page) => {
      await page.locator("#crypto-self-test-status.passed").waitFor();
      await page.locator("#full-self-test").click();
      // Since the AUD-023 remediation (AUD-023-SEC001) a failed full self-test closes the page's
      // cryptographic controls as a failed startup does, the full self-test's own button included,
      // so the run's end is read from its status line rather than from the button.
      await page.waitForFunction(
        () => {
          const status = document.querySelector("#full-self-test-status")?.textContent ?? "";
          return status.startsWith("✗") || status.startsWith("Every check passed");
        },
        null,
        { timeout: 300_000 },
      );
      const status = await text(page, "#full-self-test-status");
      const rows = await page.locator("#full-self-test-result tr").count();
      console.log(`  Deriver full self-test with a wrong BIP38 answer: ${status} (${rows} rows)`);
      expect(
        "Deriver: a wrong BIP38 answer fails the full self-test and says so",
        /^✗ Failed: .*BIP38 (?:dash-core|Dash).*Do not use this copy/u.test(status),
        status,
      );
      expect(
        "Deriver: the full self-test stays closed after a failure, as after a failed startup",
        await disabled(page, "#full-self-test"),
      );
      expect(
        "Deriver: the startup badge reads failed after a failed full self-test",
        await page.locator("#crypto-self-test-status.failed").isVisible(),
        await text(page, "#crypto-self-test-status"),
      );
      expect(
        "Deriver: generation is closed after a failed full self-test",
        await disabled(page, "#generate-12"),
      );
    },
  );

  // ---------------------------------------------------------------- Inspector
  await withPage(browser, ARTIFACTS.inspector, { label: "Inspector" }, async (page) => {
    await page.locator("#psbt-self-test-status.passed").waitFor();
    const details = await text(page, "#psbt-self-test-details");
    const ms = Number(details.match(/passed in ([\d,]+) ms/u)?.[1].replaceAll(",", ""));
    console.log(`  Inspector startup: ${details.slice(0, 100)}… (${ms} ms)`);
    expect("Inspector: startup suite under 1 s", ms < 1000, ms);
    await countRuns(page, "#psbt-full-self-test-status", "Running the full self-test…");
    await page.locator("#psbt-full-self-test").dblclick();
    await page.waitForFunction(
      () => !document.querySelector("#psbt-full-self-test").disabled,
      null,
      {
        timeout: 120_000,
      },
    );
    const status = await text(page, "#psbt-full-self-test-status");
    expect(
      "Inspector: full self-test passes",
      /^Every check passed: 14 checks/u.test(status),
      status,
    );
    expect(
      "Inspector: a double click starts one full run",
      (await page.evaluate(() => window.__runs)) === 1,
    );
  });
  const txidCopy = mutatedCopy(
    ARTIFACTS.inspector,
    "82efd652d7ab1197f01a5f4d9a30cb4c68bb79ab6fec58dfa1bf112291d1617b",
    "82efd652d7ab1197f01a5f4d9a30cb4c68bb79ab6fec58dfa1bf112291d1617c",
    "inspector-txid-mutated",
  );
  await withPage(browser, txidCopy, { label: "Inspector BIP174 answer changed" }, async (page) => {
    await page.locator("#psbt-self-test-status.failed").waitFor();
    const details = await text(page, "#psbt-self-test-details");
    const visiblePanels = await page.locator("section[id$='-panel']:visible").count();
    const enabledModes = await page.locator("[data-mode]:enabled").count();
    expect(
      "Inspector: a wrong BIP174 answer fails at start and names the check",
      /BIP174 transaction id.*Every workflow stays closed/u.test(details),
      details,
    );
    expect(
      "Inspector: every workflow panel hidden and every mode button disabled",
      visiblePanels === 0 && enabledModes === 0,
      { visiblePanels, enabledModes },
    );
    expect(
      "Inspector: full self-test stays disabled",
      await disabled(page, "#psbt-full-self-test"),
    );
  });
  const dashBip38Copy = mutatedCopy(
    ARTIFACTS.inspector,
    "XsTESCXpDo3tCFuFptBnH6CVS6beCGeKVh",
    "XsTESCXpDo3tCFuFptBnH6CVS6beCGeKVi",
    "inspector-bip38-mutated",
  );
  await withPage(
    browser,
    dashBip38Copy,
    { label: "Inspector Dash BIP38 answer changed" },
    async (page) => {
      await page.locator("#psbt-self-test-status.passed").waitFor();
      await page.locator("#psbt-full-self-test").click();
      await page.waitForFunction(
        () => !document.querySelector("#psbt-full-self-test").disabled,
        null,
        {
          timeout: 120_000,
        },
      );
      const status = await text(page, "#psbt-full-self-test-status");
      const rows = await page.locator("#psbt-full-self-test-result tr").count();
      console.log(
        `  Inspector full self-test with a wrong Dash BIP38 answer: ${status} (${rows} rows)`,
      );
      expect(
        "Inspector: a full-only failure says so and keeps the passed rows",
        /^✗ Failed: Self-test failed: Dash BIP38 address\./u.test(status) && rows === 13,
        { status, rows },
      );
    },
  );

  // ---------------------------------------------------------------- Dash Community, as built
  await withPage(browser, DASH.deriver, { label: "Dash Deriver" }, async (page) => {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    const details = await text(page, "#crypto-self-test-details");
    console.log(`  Dash Deriver startup: ${details.slice(0, 100)}…`);
    expect(
      "Dash Deriver: startup names BIP85 and the Dash compact signature, no Bitcoin check",
      /BIP85/u.test(details) &&
        /Dash compact message signature/u.test(details) &&
        !/Bitcoin|Silent/u.test(details),
      details,
    );
  });
  await withPage(browser, DASH.inspector, { label: "Dash Inspector" }, async (page) => {
    await page.locator("#psbt-self-test-status.passed").waitFor();
    await page.locator("#psbt-full-self-test").click();
    await page.waitForFunction(
      () => !document.querySelector("#psbt-full-self-test").disabled,
      null,
      {
        timeout: 120_000,
      },
    );
    const status = await text(page, "#psbt-full-self-test-status");
    expect(
      "Dash Inspector: full self-test passes with Dash checks only",
      /^Every check passed: 7 checks/u.test(status),
      status,
    );
  });

  // ---------------------------------------------------------------- Activity Viewer
  await withPage(browser, ARTIFACTS.viewer, { label: "Viewer" }, async (page) => {
    await page.locator("#viewer-crypto-self-test-status.passed").waitFor();
    const details = await text(page, "#viewer-crypto-self-test-details");
    const external = await text(page, "#viewer-external-self-test");
    expect(
      "Viewer: startup names the public-input guard",
      /Public-input guard/u.test(details),
      details,
    );
    expect(
      "Viewer: Bitcoin and Ethereum address checks passed",
      /^Address checks passed/u.test(external),
      external,
    );
  });
  const guardCopy = mutatedCopy(
    ARTIFACTS.viewer,
    "XBHddvWWiMu3nZhhpTXBQWJMmdz5JNKJD85b9fgKAckCT2coW3Y4",
    "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
    "viewer-guard-mutated",
  );
  await withPage(browser, guardCopy, { label: "Viewer guard sample changed" }, async (page) => {
    await page.locator("#viewer-crypto-self-test-status.failed").waitFor({ timeout: 60_000 });
    const details = await text(page, "#viewer-crypto-self-test-details");
    expect(
      "Viewer: a guard that lets the WIF sample through fails the startup self-test",
      /let a WIF private key through/u.test(details),
      details,
    );
    expect("Viewer: the lookup button stays disabled", await disabled(page, "#scan-button"));
  });
  const eipCopy = mutatedCopy(
    ARTIFACTS.viewer,
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD",
    "viewer-eip55-mutated",
  );
  await withPage(browser, eipCopy, { label: "Viewer EIP-55 answer changed" }, async (page) => {
    await page.locator("#viewer-crypto-self-test-status.passed").waitFor();
    const external = await text(page, "#viewer-external-self-test");
    expect(
      "Viewer: a wrong EIP-55 answer is reported in the passport",
      /EIP-55 checksum\. Lookups stay closed/u.test(external),
      external,
    );
    await page.locator("#viewer-coin").selectOption("ethereum");
    await page.locator("#full-viewing-key").fill("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    await page.locator("#scan-button").click();
    const error = await text(page, "#viewer-error");
    expect(
      "Viewer: an Ethereum lookup is refused with the failure",
      /Lookups stay closed/u.test(error),
      error,
    );
  });

  // ---------------------------------------------------------------- Discovery Scanner
  await withPage(browser, ARTIFACTS.scanner, { label: "Scanner" }, async (page) => {
    const vault = page.frameLocator("#recovery-secret-vault");
    await vault.locator("#recovery-self-test.passed").waitFor();
    const details = await vault.locator("#recovery-crypto-self-test-details").innerText();
    console.log(`  Scanner startup: ${details.slice(0, 160)}…`);
    expect(
      "Scanner: startup names the candidate list and scrypt checks",
      /Candidate list import/u.test(details) && /scrypt \(RFC 7914\)/u.test(details),
      details,
    );
    expect(
      "Scanner: default build checks the public-input guard, as its README says",
      /Public-input guard/u.test(details),
      details.match(/[^·]*guard[^·]*/u)?.[0] ?? "(no guard check)",
    );
  });
} finally {
  await browser.close();
}

let failed = 0;
for (const e of expectations) {
  if (!e.ok) failed += 1;
  console.log(`${e.ok ? "PASS" : "FAIL"} ${e.name}`);
  if (!e.ok || e.observed !== undefined)
    console.log(`     observed: ${JSON.stringify(e.observed)?.slice(0, 400)}`);
}
console.log(`${expectations.length - failed}/${expectations.length} expectations held.`);
process.exit(failed === 0 ? 0 : 1);
