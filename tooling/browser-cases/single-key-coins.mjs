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
];

/** The first shown address of the result list, as the copy buttons name it. */
const firstAddress = (page) =>
  page.evaluate(() => {
    const button = document.querySelector('#address-list [data-copy-field="address"]');
    return button?.parentElement?.querySelector(".value")?.textContent ?? null;
  });

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
    return "Each single-key coin's variant derives its known first address of the public phrase in the page";
  }
}
