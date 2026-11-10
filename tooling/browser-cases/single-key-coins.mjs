import assert from "node:assert/strict";

const PHRASE = `${"abandon ".repeat(11)}about`;

/**
 * The first address of every single-key coin's variant for the public phrase, the vectors of the
 * startup self-test (packages/verification/src/derivation-self-test-*.ts), each module of which says
 * where its values come from.
 */
const FIRST_ADDRESSES = [
  ["litecoin", "litecoin-legacy", "LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez"],
  ["litecoin", "litecoin-nested-segwit", "M7wtsL7wSHDBJVMWWhtQfTMSYYkyooAAXM"],
  ["litecoin", "litecoin-native-segwit", "ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh"],
  ["dogecoin", "dogecoin", "DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC"],
  ["bitcoin-cash", "bitcoin-cash", "bitcoincash:qqyx49mu0kkn9ftfj6hje6g2wfer34yfnq5tahq3q6"],
  [
    "bitcoin-cash",
    "bitcoin-cash-coin-type-0",
    "bitcoincash:qrvcdmgpk73zyfd8pmdl9wnuld36zh9n4gms8s0u59",
  ],
  ["zcash", "zcash", "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F"],
  ["xrp", "xrp", "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3"],
  ["tron", "tron", "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH"],
  ["ethereum-classic", "ethereum-classic", "0xFA22515E43658ce56A7682B801e9B5456f511420"],
  ["cosmos", "cosmos", "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4"],
  ["injective", "injective", "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz"],
  ["solana", "solana", "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk"],
  ["solana", "solana-ledger", "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL"],
  ["stellar", "stellar", "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX"],
  ["near", "near", "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412"],
  [
    "hedera",
    "hedera",
    "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
  ],
  ["hedera", "hedera-ecdsa", "0xC283f34aDafdB758a557304C5F5e4c1E0A554713"],
  ["ton", "ton-trust", "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY"],
  ["ton", "ton-ledger", "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj"],
];

/** ton-crypto's test phrase, a TON phrase that is not a BIP39 phrase, and its W5 address. */
const TON_PHRASE =
  "hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution";
const TON_W5 = "UQDSLOFVamNZzdy4LulclcCBEFkRReZ7WscBCLAw3Pg53h3h";

/** The first shown address of the result list, as the copy buttons name it. */
const firstAddress = (page) =>
  page.evaluate(() => {
    const button = document.querySelector('#address-list [data-copy-field="address"]');
    return button?.parentElement?.querySelector(".value")?.textContent ?? null;
  });

/** Waits until the first shown address is `expected`, or with `changed`, any UQ… address but it. */
const waitForFirstAddress = (page, expected, changed = false) =>
  page.waitForFunction(
    ([address, other]) => {
      const shown =
        document
          .querySelector('#address-list [data-copy-field="address"]')
          ?.parentElement?.querySelector(".value")?.textContent ?? null;
      return other ? shown?.startsWith("UQ") === true && shown !== address : shown === address;
    },
    [expected, changed],
  );

/**
 * The Telegram wallet's tab: a BIP39 phrase that is not TON's is refused, a pasted TON phrase opens
 * the tab with its one key and no range, and "Generate a phrase the Telegram wallet accepts" draws a
 * BIP39 phrase whose Telegram wallet key the tab shows.
 */
async function checkTelegramWallet(page) {
  await page.locator("#coin").selectOption("ton");
  await page.locator('#protocol-tabs [data-adapter-id="ton"]').click();
  assert.equal(await page.locator("#count").isVisible(), false, "a TON phrase has one key");
  await page.locator("#derive-button").click();
  await page.locator("#error:not([hidden])").waitFor();
  assert.match(await page.locator("#error").innerText(), /not a TON phrase/u);
  // A TON phrase that is not BIP39's: the Telegram wallet's tab, from any other coin.
  await page.locator("#coin").selectOption("litecoin");
  await page.locator("#mnemonic").fill(TON_PHRASE);
  await page.locator('#protocol-tabs [data-adapter-id="ton"][aria-checked="true"]').waitFor();
  await waitForFirstAddress(page, TON_W5);
  assert.match(await page.locator("#ton-phrase-note").innerText(), /not a BIP39 phrase/u);
  // Telegram-compatible generation: 24 words only, and the tab shows the new phrase's key.
  await page.locator("#ton-generation-enabled").check();
  assert.equal(await page.locator("#generate-12").isDisabled(), true);
  await page.locator("#generate-24").click();
  await page.locator("#ton-phrase-note:not([hidden])").waitFor();
  await page.waitForFunction(() =>
    document.querySelector("#ton-phrase-note")?.textContent?.includes("also a TON phrase"),
  );
  await waitForFirstAddress(page, TON_W5, true);
  await page.locator("#ton-generation-enabled").uncheck();
}

/** Every single-key coin of the Multi-Chain Deriver derives its known first address in the page. */
export class SingleKeyCoinsCase {
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#count").fill("1");
    await page.locator("#mnemonic").fill(PHRASE);
    for (const [coin, adapter, expected] of FIRST_ADDRESSES) {
      await page.locator("#coin").selectOption(coin);
      await page.locator(`#protocol-tabs [data-adapter-id="${adapter}"]`).click();
      await page.locator("#derive-button").click();
      await page.waitForFunction(
        (address) =>
          document
            .querySelector('#address-list [data-copy-field="address"]')
            ?.parentElement?.querySelector(".value")?.textContent === address,
        expected,
      );
      assert.equal(await firstAddress(page), expected, adapter);
    }
    await checkTelegramWallet(page);
    return "Each single-key coin's variant derives its known first address of the public phrase in the page, and TON's Telegram wallet tab reads TON phrases";
  }
}
