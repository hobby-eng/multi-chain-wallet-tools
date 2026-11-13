import assert from "node:assert/strict";
import { MessageVerificationRoundTripCase } from "./message-verification-round-trip.mjs";
import { TON_PHRASE, TON_W5 } from "./single-key-coins.mjs";

const PHRASE = `${"abandon ".repeat(11)}about`;
/** NEAR's and TON's fields beside the message; the nonce and the timestamp fill themselves. */
const NEAR_INPUTS = { "#message-signer-input-recipient": "public.example" };
const TON_INPUTS = { "#message-signer-input-domain": "public.example" };
/** Keplr's StdSignature, ADR-036's response, and the Base64 SignatureMap of Hedera's. */
const ADR036 = /^\{"pub_key":\{"type":"tendermint\/PubKeySecp256k1"/u;
const SIGNATURE_MAP = /^Cm[A-Za-z0-9+/]+={0,2}$/u;
/** CIP-30's DataSignature: a COSE_Sign1 (an array of four, 0x84) and the COSE_Key, in hex. */
const DATA_SIGNATURE = /^\{"signature":"84[0-9a-f]+","key":"a4[0-9a-f]+"\}$/u;
const CIP30 = "CIP-30 signData (CIP-8 COSE_Sign1)";
/** The message of TON's binary payload, in hex, and the same bytes with one more. */
const BYTES = { message: "4f66666c696e65", tampered: "4f66666c696e6521" };

/**
 * @typedef {object} Variant
 * @property {boolean} [menu] whether the address offers several formats, its default selected
 * @property {string} [format] the format to select
 * @property {Record<string, string>} [inputs] the fields beside the message, by selector
 * @property {RegExp} [output] the form of the output
 * @property {string} [message] the message to sign instead of the case's, such as hex bytes
 * @property {string} [tampered] another message in the same form
 */

/**
 * Each signing coin's variant, the form of its first address, the format the dialog names, and for
 * a coin with several formats or fields, the format to select, the fields and the output's form.
 * @type {readonly [string, string, RegExp, string, Variant?][]}
 */
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
  ["ethereum", "ethereum", /^0x/u, "Ethereum personal_sign (EIP-191), every EVM network"],
  ["ethereum-classic", "ethereum-classic", /^0x/u, "Ethereum Classic personal_sign (EIP-191)"],
  ["tron", "tron", /^T/u, "Tron signMessageV2 (TIP-191)"],
  [
    "solana",
    "solana",
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u,
    "Solana signMessage (raw bytes)",
    { menu: true },
  ],
  [
    "solana",
    "solana-ledger",
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u,
    "Solana off-chain message (version 0)",
    { format: "solana-offchain-v0" },
  ],
  ["stellar", "stellar", /^G/u, "Stellar SEP-53 signed message"],
  ["near", "near", /^[0-9a-f]{64}$/u, "NEAR NEP-413 signMessage", { inputs: NEAR_INPUTS }],
  [
    "ton",
    "ton-trust",
    /^UQ/u,
    "TON Connect signData (text)",
    { menu: true, inputs: TON_INPUTS, output: /^\{"signature":/u },
  ],
  [
    "ton",
    "ton-ledger",
    /^UQ/u,
    "TON Connect signData (binary)",
    { format: "ton-sign-data-binary", inputs: TON_INPUTS, ...BYTES },
  ],
  ["cosmos", "cosmos", /^cosmos1/u, "Cosmos signArbitrary (ADR-036)", { output: ADR036 }],
  [
    "injective",
    "injective",
    /^inj1/u,
    "Injective signArbitrary (ADR-036, Keccak-256)",
    { menu: true, output: ADR036 },
  ],
  [
    "injective",
    "injective",
    /^inj1/u,
    "Injective personal_sign (EIP-191)",
    { format: "injective-eip191", output: /^0x/u },
  ],
  [
    "hedera",
    "hedera",
    /^0\.0\.302a/u,
    "Hedera hedera_signMessage (HIP-820) · Ed25519",
    { output: SIGNATURE_MAP },
  ],
  [
    "hedera",
    "hedera-ecdsa",
    /^0x/u,
    "Hedera hedera_signMessage (HIP-820) · ECDSA",
    { output: SIGNATURE_MAP },
  ],
  ["cardano", "cardano", /^addr1q/u, CIP30, { output: DATA_SIGNATURE }],
  ["cardano", "cardano-ledger", /^addr1q/u, CIP30, { output: DATA_SIGNATURE }],
];

/**
 * Signs `message` from the sign icon `selector`, in the variant's format and with its fields, and
 * answers the signature and the address.
 */
async function sign(page, selector, message, { format, inputs = {} } = {}) {
  await page.locator(selector).first().click();
  await page.locator("#message-signer-dialog").waitFor({ state: "visible" });
  const address = await page.locator("#message-signer-address").innerText();
  if (format !== undefined)
    await page.locator("#message-signer-format-select").selectOption(format);
  for (const [field, value] of Object.entries(inputs)) await page.locator(field).fill(value);
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

/** Hedera signs ASCII text only (decision D5): the dialog refuses other text before any work. */
async function refusesOtherThanAscii(page) {
  await page.locator("#message-signer-message").fill("Grüße");
  await page.locator("#sign-message-button").click();
  await page.locator("#message-signer-error:not([hidden])").waitFor();
  assert.equal(
    await page.locator("#message-signer-error").innerText(),
    "Hedera wallets count the length of other text differently; use ASCII text.",
  );
}

/**
 * Cardano's stake key (role 2) signs for its reward address with its own key, though that address is
 * no payment address; and a DataSignature with a byte after its COSE_Sign1 is refused as unreadable,
 * not read as far as it goes.
 */
async function cardanoStakeKey(page, message) {
  await page.locator("#coin").selectOption("cardano");
  await page.locator('#protocol-tabs [data-adapter-id="cardano"]').click();
  await page.locator("#branch-select").selectOption("2");
  await page.locator("#derive-button").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#address-list [data-sign-message]")
        ?.dataset.signAddress?.startsWith("stake1u") === true,
  );
  const proof = await sign(page, "#address-list [data-sign-message]", message);
  assert.match(proof.address, /^stake1u/u);
  assert.match(proof.signature, DATA_SIGNATURE);
  await new MessageVerificationRoundTripCase(page).run(message, proof.signature);
  await page
    .locator("#message-verification-signature")
    .fill(proof.signature.replace('","key"', '00","key"'));
  await page.locator("#verify-message-signature-button").click();
  await page.locator("#message-verification-error").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#message-verification-error").innerText(),
    "This signature is not in the selected format.",
  );
  await page.locator("#close-message-signer").click();
  await page.locator("#branch-select").selectOption("0");
}

/**
 * The Telegram wallet's row, whose key comes from a TON phrase: pasting one selects its tab, and its
 * W5 address signs and verifies.
 */
async function telegramWallet(page, message) {
  await page.locator("#mnemonic").fill(TON_PHRASE);
  await page.locator('#protocol-tabs [data-adapter-id="ton"][aria-checked="true"]').waitFor();
  await page.locator("#derive-button").click();
  await page.waitForFunction(
    (address) =>
      document.querySelector("#address-list [data-sign-message]")?.dataset.signAddress === address,
    TON_W5,
  );
  const proof = await sign(page, "#address-list [data-sign-message]", message, {
    inputs: TON_INPUTS,
  });
  assert.match(proof.signature, /^\{"signature":/u);
  await new MessageVerificationRoundTripCase(page).run(message, proof.signature);
  await page.locator("#close-message-signer").click();
}

/** Every signing coin's address signs and verifies its own signature in the Multi-Chain Deriver. */
export class MessageSigningCoinsCase {
  static async run(page, message) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(PHRASE);
    for (const [coin, adapter, form, format, variant = {}] of VARIANTS) {
      await derive(page, coin, adapter, form);
      const signed = variant.message ?? message;
      const proof = await sign(page, "#address-list [data-sign-message]", signed, variant);
      assert.match(proof.address, form);
      assert.equal(await page.locator("#message-signer-format").innerText(), format, adapter);
      const menu = variant.menu === true || variant.format !== undefined;
      assert.equal(await page.locator("#message-signer-format-field").isVisible(), menu);
      if (variant.output !== undefined) assert.match(proof.signature, variant.output);
      const compact = await new MessageVerificationRoundTripCase(page).run(
        signed,
        proof.signature,
        variant.tampered,
      );
      assert.equal(compact, false, `${adapter} offers no compact format`);
      if (coin === "hedera") await refusesOtherThanAscii(page);
      await page.locator("#close-message-signer").click();
      if (adapter === "bitcoin-cash") await bitcoinCashLegacy(page, message, proof.signature);
    }
    await cardanoStakeKey(page, message);
    await telegramWallet(page, message);
    return "Litecoin (three address types), Dogecoin, Bitcoin Cash (CashAddr and legacy, one signature), Zcash, Ethereum, Ethereum Classic, Tron, Solana (both formats), Stellar, NEAR, TON (text, binary, and the Telegram wallet's row), Cosmos, Injective (ADR-036 and EIP-191), Hedera (Ed25519 and ECDSA, ASCII only) and Cardano (Icarus and Ledger base addresses, and a stake key's reward address, with a non-canonical DataSignature refused) sign and verify their own signatures in the page";
  }
}
