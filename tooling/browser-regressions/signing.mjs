import assert from "node:assert/strict";
import { MessageSigningLifecycleCase } from "../browser-cases/message-signing-lifecycle.mjs";
import { MessageVerificationRoundTripCase } from "../browser-cases/message-verification-round-trip.mjs";
import { BrowserFixtures } from "./fixtures.mjs";
const { message, mnemonic } = BrowserFixtures;
import { BrowserHarness } from "./host.mjs";
const { open, waitText } = BrowserHarness;

async function verifySignature(page, address, signature, chain) {
  await page.locator('[data-mode="verify"]').click();
  await page.locator("#verify-chain").selectOption(chain);
  await page.locator("#verify-address").fill(address);
  await page.locator("#verify-message").fill(message);
  await page.locator("#verify-signature").fill(signature);
  await page.locator("#verify-message-button").click();
  await waitText(page, "#verify-validity", /^VALID/);
  await page.locator("#verify-message").fill(`${message} tampered`);
  await page.locator("#verify-message-button").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#verify-error").hidden ||
      (!document.querySelector("#verify-results").hidden &&
        document.querySelector("#verify-validity").textContent.startsWith("INVALID")),
  );
  assert.equal(
    (await page.locator("#verify-results").isVisible()) &&
      (await page.locator("#verify-validity").innerText()).startsWith("VALID"),
    false,
  );
}

async function sign(page, selector) {
  await page.locator(selector).first().click();
  await page.locator("#message-signer-dialog").waitFor({ state: "visible" });
  const address = await page.locator("#message-signer-address").innerText();
  await page.locator("#message-signer-message").fill(message);
  await page.locator("#sign-message-button").click();
  await page.locator("#message-signature-result").waitFor({ state: "visible" });
  assert.equal(await page.locator("#message-signer-error").isVisible(), false);
  const signature = await page.locator("#message-signature-output").inputValue();
  assert.ok(signature.length > 40);
  const compactChecked = await new MessageVerificationRoundTripCase(page).run(message, signature);
  await new MessageSigningLifecycleCase(page).run(message);
  await page.locator("#close-message-signer").click();
  return { address, signature, compactChecked };
}

/**
 * Signs on the first row of the public test phrase and checks the dialog's own verification; in
 * the Multi-Chain Edition on a Bitcoin P2PKH row, which offers BIP-322 and the compact format.
 */
async function verificationRoundTrip(context, profile, run) {
  const page = await open(context, profile, "key-derivation", run);
  if (profile.id === "multi-chain")
    await page.locator("#protocol-tabs button").filter({ hasText: "BIP44" }).click();
  await page.locator("#count").fill("1");
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#derive-button").click();
  await page.locator("#results").waitFor({ state: "visible" });
  const { compactChecked } = await sign(page, "#address-list [data-sign-message]");
  // Bitcoin P2PKH offers the compact format; a Dash row offers its compact format alone.
  assert.equal(compactChecked, profile.id === "multi-chain");
  run.checks.push(
    "Signing dialog verifies its own signatures: valid, not valid after an edit, blank refused; compact signed, verified and pointed to where offered",
  );
}

/** Cohesive signing cases; helpers stay private to this module. */
export class BrowserSigningCases {
  /** The dialog's own verification round trip, a case of its own. */
  static verificationRoundTrip = verificationRoundTrip;
  /** Shared sign boundary for the native browser cases. */
  static sign = sign;
  /** Shared verifySignature boundary for the native browser cases. */
  static verifySignature = verifySignature;
}
