// AUD-023 selftests: the startup self-tests of the four Multi-Chain tools and the Dash Community
// Scanner in Firefox (the regression suite runs both engines): each passes, names its new checks,
// takes how long, and sends nothing. The Inspector's full self-test runs too.
//
// Input: dist/ (read only). Run (heavy: starts a browser):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/selftests-firefox.mjs
// Exit code 0 when every expectation holds, 1 when any fails.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";

const root = resolve(import.meta.dirname, "../../..");
const MC = `${root}/dist/multi-chain-edition`;
const DC = `${root}/dist/dash-community-edition`;
const cases = [
  [
    "Deriver",
    `${MC}/key-derivation/Wallet_Key_Derivation_Tool.html`,
    "#crypto-self-test-status.passed",
    "#crypto-self-test-details",
    // Per-coin signing check names since the AUD-023 remediation (AUD-023-BLD001).
    /^(?=.*BIP85)(?=.*Silent Payments)(?=.*(?:Compact message signatures|Bitcoin compact message signature))/su,
  ],
  [
    "Inspector",
    `${MC}/psbt-inspector/PSBT_Multisig_Inspector.html`,
    "#psbt-self-test-status.passed",
    "#psbt-self-test-details",
    /Bitcoin PSBT decoding \(BIP174\)/u,
  ],
  [
    "Viewer",
    `${MC}/activity-viewer/Wallet_Activity_Viewer.html`,
    "#viewer-crypto-self-test-status.passed",
    "#viewer-crypto-self-test-details",
    /Public-input guard/u,
  ],
  [
    "Scanner",
    `${MC}/discovery-scanner/Wallet_Discovery_Scanner.html`,
    "vault:#recovery-self-test.passed",
    "vault:#recovery-crypto-self-test-details",
    /Candidate list import.*scrypt \(RFC 7914\)/su,
  ],
  [
    "Dash Scanner",
    `${DC}/discovery-scanner/Dash_Community_Discovery_Scanner.html`,
    "vault:#recovery-self-test.passed",
    "vault:#recovery-crypto-self-test-details",
    /Candidate list import/u,
  ],
];
const { firefox } = await loadPlaywright();
const browser = await firefox.launch({ headless: true });
const results = [];
try {
  for (const [label, path, passed, details, names] of cases) {
    const context = await browser.newContext();
    const network = [];
    await context.route("**/*", (r) => {
      if (/^(file|blob|data|about):/u.test(r.request().url())) return r.continue();
      network.push(r.request().url());
      return r.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    const scope = (selector) =>
      selector.startsWith("vault:")
        ? page.frameLocator("#recovery-secret-vault").locator(selector.slice(6))
        : page.locator(selector);
    const started = Date.now();
    await page.goto(pathToFileURL(path).href);
    let text = "";
    try {
      await scope(passed).waitFor();
      text = await scope(details).innerText();
    } catch (error) {
      text = `did not pass: ${String(error).slice(0, 200)} | ${await scope(details)
        .innerText()
        .catch(() => "")}`;
    }
    console.log(`  ${label}: ${text.slice(0, 140)}… (page ready in ${Date.now() - started} ms)`);
    results.push([
      `${label}: startup passes and names its new checks`,
      names.test(text),
      text.slice(0, 200),
    ]);
    if (label === "Inspector") {
      await page.locator("#psbt-full-self-test").click();
      await page.waitForFunction(
        () => !document.querySelector("#psbt-full-self-test").disabled,
        null,
        {
          timeout: 120_000,
        },
      );
      const status = await page.locator("#psbt-full-self-test-status").innerText();
      results.push([
        "Inspector: full self-test passes",
        /^Every check passed: 14 checks/u.test(status),
        status,
      ]);
    }
    results.push([`${label}: no network request`, network.length === 0, network]);
    await context.close();
  }
} finally {
  await browser.close();
}
let failed = 0;
for (const [name, ok, detail] of results) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(`     ${JSON.stringify(detail)}`);
}
console.log(`${results.length - failed}/${results.length} expectations held.`);
process.exit(failed === 0 ? 0 : 1);
