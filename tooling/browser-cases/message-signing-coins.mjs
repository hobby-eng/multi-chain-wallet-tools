import assert from "node:assert/strict";
import { MessageVerificationRoundTripCase } from "./message-verification-round-trip.mjs";

const PHRASE = `${"abandon ".repeat(11)}about`;

/** Each compact coin's variant, the form of its first address, and the format the dialog names. */
const VARIANTS = [
  ["litecoin", "litecoin-legacy", /^L/u, "Litecoin Core compact P2PKH"],
  ["litecoin", "litecoin-nested-segwit", /^M/u, "Litecoin compact P2SH-P2WPKH (BIP137)"],
  ["litecoin", "litecoin-native-segwit", /^ltc1q/u, "Litecoin compact P2WPKH (BIP137)"],
  ["dogecoin", "dogecoin", /^D/u, "Dogecoin Core compact P2PKH"],
  [
    "bitcoin-cash",
    "bitcoin-cash",
    /^bitcoincash:q/u,
    "Bitcoin Cash compact P2PKH (Bitcoin's message format)",
  ],
  ["zcash", "zcash", /^t1/u, "Zcash compact t1 P2PKH"],
];

/** Signs `message` from the sign icon `selector` and answers the signature and the address. */
async function sign(page, selector, message) {
  await page.locator(selector).first().click();
  await page.locator("#message-signer-dialog").waitFor({ state: "visible" });
  const address = await page.locator("#message-signer-address").innerText();
  await page.locator("#message-signer-message").fill(message);
  await page.locator("#sign-message-button").click();
  await page.locator("#message-signature-result").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#message-signature-verification").innerText(),
    /^Verified locally against the selected address · /u,
  );
  return { address, signature: await page.locator("#message-signature-output").inputValue() };
}

/** Derives row 0 of a variant and waits for its sign icon on an address of the coin's form. */
async function derive(page, coin, adapter, form) {
  await page.locator("#coin").selectOption(coin);
  await page.locator(`#protocol-tabs [data-adapter-id="${adapter}"]`).click();
  await page.locator("#derive-button").click();
  await page.waitForFunction(
    (pattern) =>
      new RegExp(pattern, "u").test(
        document.querySelector("#address-list [data-sign-message]")?.dataset.signAddress ?? "",
      ),
    form.source,
  );
}

/** Bitcoin Cash's legacy form signs from its own icon in Advanced mode, with the same signature. */
async function bitcoinCashLegacy(page, message, cashAddrSignature) {
  await page.locator("#mode-advanced").click();
  // In Advanced mode every payment address of the row has its own icon; the legacy one starts with 1.
  const legacyIcon = '#address-list [data-sign-message][data-sign-address^="1"]';
  await page.locator(legacyIcon).first().waitFor();
  const proof = await sign(page, legacyIcon, message);
  assert.match(proof.address, /^1/u);
  assert.equal(proof.signature, cashAddrSignature);
  await page.locator("#close-message-signer").click();
  await page.locator("#mode-basic").click();
}

/** Every compact coin's address signs and verifies its own signature in the Multi-Chain Deriver. */
export class MessageSigningCoinsCase {
  static async run(page, message) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(PHRASE);
    for (const [coin, adapter, form, format] of VARIANTS) {
      await derive(page, coin, adapter, form);
      const proof = await sign(page, "#address-list [data-sign-message]", message);
      assert.match(proof.address, form);
      assert.equal(await page.locator("#message-signer-format").innerText(), format, adapter);
      assert.equal(await page.locator("#message-signer-format-field").isVisible(), false);
      const compact = await new MessageVerificationRoundTripCase(page).run(
        message,
        proof.signature,
      );
      assert.equal(compact, false, `${adapter} offers one format`);
      await page.locator("#close-message-signer").click();
      if (adapter === "bitcoin-cash") await bitcoinCashLegacy(page, message, proof.signature);
    }
    return "Litecoin (three address types), Dogecoin, Bitcoin Cash (CashAddr and legacy, one signature) and Zcash sign and verify their own signatures in the page";
  }
}
