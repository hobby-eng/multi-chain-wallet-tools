// AUD-023 selftests: after the Discovery Scanner's startup self-test fails, are the candidate-list
// controls closed, as the self-test's own comment says ("before any list can be chosen") and the
// workspace rule requires ("a failure keeps them closed")?
//
// Fault: an init script (all frames, set before any page script) makes atob() return a damaged
// byte string for the base64 text of the self-test's pinned candidate list only, so that the list
// no longer decrypts and the candidate-list check fails. Nothing in dist/ or the product changes.
// (At the reviewed snapshot the failure read "Failed to fetch" in Chromium: age-encryption 0.3.1
// read through `new Response(stream)`, which replaced its error. MnemoCode 16ccca1 reads through
// getReader, and the failure now reads "invalid tag".)
//
// Input: dist/multi-chain-edition/discovery-scanner/Wallet_Discovery_Scanner.html (read only).
// Run (heavy: starts a browser):
//   flock docs/audits/AUD-023-evidence/heavy.lock \
//     node docs/audits/AUD-023-harnesses/selftests-scanner-gate.mjs
// Exit code 0 when the list controls stay closed after the failure, 1 when they do not.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";

const root = resolve(import.meta.dirname, "../../..");
const artifact = `${root}/dist/multi-chain-edition/discovery-scanner/Wallet_Discovery_Scanner.html`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  const context = await browser.newContext();
  const network = [];
  await context.route("**/*", (r) => {
    if (/^(file|blob|data|about):/u.test(r.request().url())) return r.continue();
    network.push(r.request().url());
    return r.abort();
  });
  await context.addInitScript(() => {
    const original = globalThis.atob;
    globalThis.atob = (text) => {
      const decoded = original(text);
      // The pinned list starts with "age-encryption.org/v1\n-> X25519 IB2x": damage its last byte.
      return String(text).startsWith("YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgyNTUxOSBJQjJ4")
        ? decoded.slice(0, -1) + String.fromCharCode(decoded.charCodeAt(decoded.length - 1) ^ 1)
        : decoded;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(pathToFileURL(artifact).href);
  const vault = page.frameLocator("#recovery-secret-vault");
  await vault.locator("#recovery-self-test:not(.checking)").waitFor();
  const badge = await vault.locator("#recovery-self-test").getAttribute("class");
  const details = await vault.locator("#recovery-crypto-self-test-details").innerText();
  console.log("Self-test badge:", badge, "\nDetails:", details.slice(0, 300));
  if (!/failed/u.test(badge ?? "")) failures.push("the fault did not fail the startup self-test");
  await vault.locator('[data-input-mode="batch"]').click();
  await vault.locator("#candidate-list-import summary").click();
  const controls = {};
  for (const id of ["start-recovery-scan", "candidate-list-show-key", "candidate-list-open"])
    controls[id] = await vault.locator(`#${id}`).isEnabled();
  controls["candidate-list-file"] = await vault.locator("#candidate-list-file").isEnabled();
  console.log("Enabled after the failure:", controls);
  if (controls["start-recovery-scan"]) failures.push("scanning is enabled after the failure");
  if (controls["candidate-list-show-key"])
    failures.push("the Scanner key button is enabled after the failure");
  // Adapted during the AUD-023 remediation: a closed button cannot be clicked, so the click is
  // tried only when the button is enabled (the reviewed snapshot), never waited for.
  if (controls["candidate-list-show-key"]) await vault.locator("#candidate-list-show-key").click();
  const key = await vault
    .locator("#candidate-list-key")
    .inputValue()
    .catch(() => "");
  console.log("Scanner key shown after the failure:", key.slice(0, 12), key ? "…" : "(none)");
  if (controls["candidate-list-open"] || controls["candidate-list-file"])
    failures.push("the candidate list can still be chosen and opened after the failure");
  if (key.startsWith("age1"))
    failures.push("the Scanner key is created and shown after the failure");
  if (network.length) failures.push(`network requests: ${network.join(", ")}`);
  await context.close();
} finally {
  await browser.close();
}
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(
  failures.length === 0 ? "PASS list controls stay closed" : `${failures.length} failure(s)`,
);
process.exit(failures.length === 0 ? 0 : 1);
