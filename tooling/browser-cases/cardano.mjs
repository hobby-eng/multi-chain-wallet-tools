import assert from "node:assert/strict";

/**
 * Trezor's public fixture phrase and its first base address (m/1852'/1815'/0'/0/0 with the stake
 * key m/1852'/1815'/0'/2/0) under each of CIP-3's master keys, as Trezor publishes them
 * (trezor/trezor-firmware @433075c common/tests/fixtures/cardano/get_base_address.derivations.json),
 * with the words of each tab's notice.
 */
const TREZOR_PHRASE =
  "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north";
const TABS = [
  [
    "cardano",
    "addr1q996av5n0379tp8yllaxtgj3ffntmlrsl9sah237h65x6yt76a24dxtkgy59n8tvk00jf5dwfp8cz50g0uheuzfddcnqxp4njq",
    /Yoroi, Lace and Trust Wallet use no BIP39 passphrase.*Eternl and Typhon/u,
  ],
  [
    "cardano-ledger",
    "addr1q8afdsv8q9hr4z8qljl3qz3rvm048g8j506j6umrpg63nytg4txp8fd25x5lnmkdh5p9wudkh4llu4dxyc3jyjef0gwqa5dzfd",
    /Ledger and BitBox02 derive other keys/u,
  ],
  [
    "cardano-icarus-trezor",
    "addr1q8g9th06vccxzl96nr905al0vgg2t0fqfxrxmv7ecye3x2e66sl9kvzd905ad5natzd5wghy2w3a9lm0y7u7c5sv0c2snql3c4",
    /made from 24 words with older firmware/u,
  ],
];

/**
 * cardano-serialization-lib's phrase and the reward address of its stake key m/1852'/1815'/0'/2/0
 * under Icarus (Emurgo/cardano-serialization-lib @6b42538 rust/src/tests/address.rs, bip32_12_reward).
 */
const CSL_PHRASE = "test walk nut penalty hip pave soap entry language right filter choice";
const CSL_STAKE_ADDRESS = "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz";

/**
 * Own values (CORE-27) of test/oracles/cardano_oracle.py, which first reproduces BIP85's published
 * 12-word child: the 12-word BIP85 child, index 0, of the CSL phrase, and its first base address under
 * Ledger, the one Cardano tab of a child wallet.
 */
const CSL_CHILD_PHRASE =
  "bike relax legend rely potato boat pulp journey barrel decorate two bring";
const CSL_CHILD_LEDGER_ADDRESS =
  "addr1qyrsgsdts7tgf5xsrfuq2u3anyq2wtwehtkyd58qy44vh6kgca7ldrtxc4lrlltnmwv04cn5a8j86qzaqvcsfjz9ccssdum093";

/** The value cell of the first row's address in a result list. */
const firstAddressCell = (page, list) =>
  page.locator(`${list} [data-copy-field="address"]`).first().locator("xpath=..");

/** Derives with the chosen tab and waits until the first row's address is `expected`. */
async function deriveFirstAddress(page, expected) {
  await page.locator("#derive-button").click();
  await page.waitForFunction(
    (address) =>
      document
        .querySelector('#address-list [data-copy-field="address"]')
        ?.parentElement?.querySelector(".value")?.textContent === address,
    expected,
  );
}

/** The payload that the first row's QR code holds: the address alone (no web+cardano: link). */
async function firstQrPayload(page) {
  const cell = firstAddressCell(page, "#address-list");
  await cell.locator(".qr-trigger").click();
  const payload = await cell.locator(".payment-qr-payload").innerText();
  await cell.locator(".qr-trigger").click();
  return payload;
}

/**
 * A BIP85 child wallet derives from BIP39's seed of the child phrase: its Cardano has the Ledger
 * tab alone, and the workspace's note says so while Cardano is its coin.
 */
async function checkChildWallet(page) {
  await page.locator("#include-bip85").check();
  await page.locator("#bip85-tab").click();
  await page.locator("#bip85-words").selectOption("12");
  await page.locator("#derive-bip85").click();
  await page.locator("#bip85-result").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelector("#bip85-output")?.value.trim().split(/\s+/u).length === 12,
  );
  assert.equal(await page.locator("#bip85-output").inputValue(), CSL_CHILD_PHRASE);
  await page.locator("#open-bip85-wallet").click();
  const note = page.locator("#bip85-wallet-cardano-note");
  assert.equal(await note.isHidden(), true, "the Cardano note waits for Cardano");
  await page.locator("#bip85-wallet-coin").selectOption("cardano");
  assert.deepEqual(
    await page
      .locator("#bip85-wallet-tabs [data-adapter-id]")
      .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.adapterId)),
    ["cardano-ledger"],
  );
  await note.waitFor({ state: "visible" });
  assert.match(await note.innerText(), /only its Ledger tab.*read a child phrase with Icarus/su);
  // Silent Payments are Bitcoin's: the child offers them under Bitcoin only.
  const silentPayments = page.locator("#bip85-wallet-include-silent-payment");
  assert.equal(await silentPayments.isVisible(), false, "no Silent Payments under Cardano");
  // Its options row holds that option alone, so no empty row is left either.
  const options = page.locator("#bip85-wallet-workspace .feature-tab-options");
  assert.equal(await options.count(), 1);
  assert.equal(await options.isVisible(), false, "no empty options row under Cardano");
  await page.locator("#bip85-wallet-count").fill("1");
  await page.locator("#derive-bip85-wallet").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('#bip85-wallet-list [data-copy-field="address"]')
        ?.parentElement?.querySelector(".value")
        ?.textContent?.startsWith("addr1") === true,
  );
  assert.equal(
    await firstAddressCell(page, "#bip85-wallet-list").locator(".value").textContent(),
    CSL_CHILD_LEDGER_ADDRESS,
    "the child wallet's Ledger address",
  );
  await page.locator("#bip85-wallet-coin").selectOption("bitcoin");
  await note.waitFor({ state: "hidden" });
  await silentPayments.waitFor({ state: "visible" });
  assert.equal(await options.isVisible(), true, "the options row is back under Bitcoin");
}

/** Cardano in the Multi-Chain Deriver, and nowhere in Dash Community's. */
export class CardanoCase {
  /**
   * The three tabs derive Trezor's published base addresses of its phrase, each with its notice
   * and a plain-address QR; the stake key's role derives cardano-serialization-lib's reward address,
   * without a QR; a child wallet offers the Ledger tab alone and says why.
   */
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    assert.equal(await page.locator('#coin option[value="cardano"]').textContent(), "Cardano");
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(TREZOR_PHRASE);
    await page.locator("#coin").selectOption("cardano");
    assert.deepEqual(
      await page
        .locator("#protocol-tabs [data-adapter-id]")
        .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.adapterId)),
      TABS.map(([adapter]) => adapter),
    );
    assert.equal(await page.locator("#branch-label").innerText(), "Role (CIP-1852)");
    assert.deepEqual(
      await page
        .locator("#branch-select option")
        .evaluateAll((options) => options.map((option) => option.textContent)),
      ["0 — receive addresses", "1 — change addresses", "2 — stake key"],
    );
    for (const [adapter, address, notice] of TABS) {
      await page.locator(`#protocol-tabs [data-adapter-id="${adapter}"]`).click();
      await deriveFirstAddress(page, address);
      assert.match(await page.locator("#result-notices").innerText(), notice, adapter);
      assert.match(await page.locator("#result-notices").innerText(), /Byron-era wallets/u);
      assert.equal(await firstQrPayload(page), address, `${adapter} QR`);
    }
    await page.locator("#mnemonic").fill(CSL_PHRASE);
    await page.locator('#protocol-tabs [data-adapter-id="cardano"]').click();
    await page.locator("#branch-select").selectOption("2");
    await deriveFirstAddress(page, CSL_STAKE_ADDRESS);
    assert.equal(
      await firstAddressCell(page, "#address-list").locator(".qr-trigger").count(),
      0,
      "a reward address is no payment address",
    );
    await checkChildWallet(page);
    return "Cardano's Icarus, Ledger and Icarus-Trezor tabs derive Trezor's published base addresses with their notices and plain-address QR codes, its stake key cardano-serialization-lib's reward address, and a BIP85 child wallet offers the Ledger tab alone with its note";
  }

  /** Dash Community's Deriver has no Cardano: no coin, no tab, no word of it. */
  static async absent(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    assert.equal(await page.locator('#coin option[value="cardano"]').count(), 0);
    assert.doesNotMatch(await page.content(), /\b(?:cardano|icarus)\b|\baddr1|\bstake1/iu);
    return "Dash Community's Deriver offers no Cardano and names none";
  }
}
