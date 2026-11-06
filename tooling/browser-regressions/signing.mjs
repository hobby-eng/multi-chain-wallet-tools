import assert from "node:assert/strict";
import { MessageSigningLifecycleCase } from "../browser-cases/message-signing-lifecycle.mjs";
import { BrowserFixtures } from "./fixtures.mjs";
const { message } = BrowserFixtures;
import { BrowserHarness } from "./host.mjs";
const { waitText } = BrowserHarness;

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
  await new MessageSigningLifecycleCase(page).run(message);
  await page.locator("#close-message-signer").click();
  return { address, signature };
}

/** Cohesive signing cases; helpers stay private to this module. */
export class BrowserSigningCases {
  /** Shared sign boundary for the native browser cases. */
  static sign = sign;
  /** Shared verifySignature boundary for the native browser cases. */
  static verifySignature = verifySignature;
}
