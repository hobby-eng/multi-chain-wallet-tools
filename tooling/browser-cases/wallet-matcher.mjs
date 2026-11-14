import assert from "node:assert/strict";

const ABOUT = `${"abandon ".repeat(11)}about`;
const WALK = "test walk nut penalty hip pave soap entry language right filter choice";
/**
 * Cardano's addresses and the paths the Matcher must find them at: cardano-serialization-lib's base,
 * enterprise and reward addresses of "test walk nut …" (Emurgo/cardano-serialization-lib @6b42538
 * rust/src/tests/address.rs, bip32_12_*), and own values of test/oracles/cardano_oracle.py for
 * "abandon … about": Icarus's change address 1/0 and Ledger's receive address 0/5.
 */
const CARDANO = [
  [
    "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7",
    "m/1852'/1815'/0'/0/0",
  ],
  ["addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8", "m/1852'/1815'/0'/0/0"],
  ["stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz", "m/1852'/1815'/0'/2/0"],
  [
    "addr1qykhadtnvjpkxh76xgr0mu4huc9tg800x2sxsqemn9uz8jh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq28kufu",
    "m/1852'/1815'/0'/1/0",
  ],
  [
    "addr1q8muu868678ae33qfj2ccu6fu4t0492eewtujzq09kyrwwgayfawlf9hwv2fzuygt2km5v92kvf8e3s3mk7ynxw77cwq5kt7sh",
    "m/1852'/1815'/0'/0/5",
  ],
];
/** CIP-19's enterprise address of a script (cardano-foundation/CIPs @7720fed CIP-0019/README.md). */
const SCRIPT_ADDRESS = "addr1w8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcyjy7wx";
/**
 * Zcash's shielded addresses and the rows the Matcher must find them at: the unified address that
 * zcash-android-wallet-sdk @1aaf2c4 TransparentTest.kt asserts for its PHRASE (P2PKH, Sapling and
 * Orchard receivers; its Sapling receiver is the row at j = 1), and own values of
 * test/oracles/zcash_sapling_oracle.py for "abandon … about": the unified address of Sapling and
 * P2PKH receivers at j = 0 and the zs1 address at j = 3, past a range of two indexes, which only
 * the account's keys find. The unified address of an Orchard receiver alone is account 9's at
 * j = 0 in zcash/zcash-test-vectors @78321be unified_address.json.
 */
const ZCASH_ANDROID_PHRASE =
  "deputy visa gentle among clean scout farm drive comfort patch skin salt ranch cool ramp warrior drink narrow normal lunch behind salt deal person";
const ZCASH = [
  [
    "u1jl6ww3ud2f6dsu5ekr5cf2myfputgz0s3tqt8ur8zesq3fs6vudh9xyne8p8yha2cd56kzlnrjunc822ue97shduwcnnhyfdlmnh2dzp7jnd0u70tedenafz036flat3jfc273rdj32",
    "m/32'/133'/0' · diversifier index 0",
  ],
  [
    "u1t23erzgkn7c6c2jn66rspl4m45lg8rn3f7mn7le4yxk7693wr7sgx472jn95s00x8kx3hct5ej4tf76k59dfhsd809t7mzt9ldzw8f5083fw4xqvxfshl9u7ed2wyv6ypmzny0px0nvszslr5kr7fgk2zgfnlycddzqak4adsqjdzp76y7fl0k4ygamjr43t6rpxsf6xql8g20rdk0h",
    "m/32'/133'/0' · diversifier index 1",
  ],
  [
    "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
    "m/32'/133'/0' · diversifier index 3",
  ],
];
const ZCASH_ORCHARD_ONLY =
  "u1ddnjsdcpm36r6aq79n3s68shjweksnmwtdltrh046s8m6xcws9ygyawalxx8n6hg6vegk0wh8zjnafxgh6msppjsljvyt0ynece3lvm0";
/** Dash Core's first address of "abandon … about", the startup vector of Dash's derivation. */
const DASH_ADDRESS = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";
/** As many phrases as the Matcher's list takes, 100: the two public phrases above in turn. */
const MANY_PHRASES = Array.from({ length: 50 }, () => `${WALK}\n${ABOUT}`).join("\n");

/**
 * Runs the Matcher with these fields and answers its final status line; `coin` is chosen when the
 * edition has several (Dash Community's one coin needs no choice).
 */
async function search(page, { phrases, targets, coin, change = false, count = "6" }) {
  await page.locator("#matcher-seeds").fill(phrases);
  await page.locator("#matcher-addresses").fill(targets);
  if (coin !== undefined) await page.locator("#matcher-coin").selectOption(coin);
  await page.locator("#matcher-search-change").setChecked(change);
  await page.locator("#matcher-index-count").fill(count);
  await page.locator("#run-wallet-matcher").click();
  await page.waitForFunction(() => {
    const status = document.querySelector("#wallet-matcher-status")?.textContent ?? "";
    return status !== "" && !/^(?:Validating|Checking|Preparing|Scanning)/u.test(status);
  });
  return page.locator("#wallet-matcher-status").innerText();
}

/**
 * Starts a search of 100 phrases and cancels it while their seeds are made: the status line shows
 * how many phrases are prepared before all are, Cancel answers, and its line stays. Answers every
 * status line the run showed.
 */
async function cancelWhilePreparing(page, { target, coin }) {
  await page.locator("#matcher-seeds").fill(MANY_PHRASES);
  await page.locator("#matcher-addresses").fill(target);
  if (coin !== undefined) await page.locator("#matcher-coin").selectOption(coin);
  await page.locator("#matcher-index-count").fill("1");
  await page.evaluate(() => {
    const status = document.querySelector("#wallet-matcher-status");
    const lines = [];
    globalThis.matcherStatusLines = lines;
    new MutationObserver(() => lines.push(status.textContent)).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await page.locator("#run-wallet-matcher").click();
  const prepared = await page.waitForFunction(
    () =>
      /^Preparing (\d+)\/100 seed phrases…$/u.exec(
        document.querySelector("#wallet-matcher-status")?.textContent ?? "",
      )?.[1],
  );
  assert.ok(Number(await prepared.jsonValue()) < 100, "progress shows before every seed is made");
  await page.locator("#cancel-wallet-matcher").click();
  await page.waitForFunction(
    () => document.querySelector("#wallet-matcher-status")?.textContent === "Search cancelled.",
  );
  // The stopped run publishes nothing later, and the search can start again.
  await page.waitForTimeout(1_000);
  assert.equal(await page.locator("#wallet-matcher-status").innerText(), "Search cancelled.");
  assert.equal(await page.locator("#run-wallet-matcher").isEnabled(), true);
  return page.evaluate(() => globalThis.matcherStatusLines);
}

/**
 * Zcash's Sapling variant: two unified addresses found by their Sapling receivers among the rows of
 * a range of two indexes, a zs1 address past it found by the account's keys, the private keys of
 * a finding (the account's, which a Sapling row has not), and an Orchard-only address refused.
 */
async function zcashSearch(page) {
  assert.equal(
    await search(page, {
      phrases: `${ABOUT}\n${ZCASH_ANDROID_PHRASE}`,
      targets: ZCASH.map(([address]) => address).join("\n"),
      coin: "zcash",
      count: "2",
    }),
    "3 matches found.",
  );
  const results = page.locator("#wallet-matcher-results");
  const text = await results.innerText();
  for (const [address, path] of ZCASH) {
    assert.ok(text.includes(address), address);
    assert.ok(text.includes(path), path);
  }
  await results.getByRole("button", { name: "Show private keys" }).click();
  await results.getByRole("button", { name: "Hide private keys" }).waitFor();
  assert.match(
    await results.innerText(),
    /Sapling extended spending key[^\n]*\n?\s*secret-extended-key-main1/u,
  );
  await results.getByRole("button", { name: "Hide private keys" }).click();
  assert.equal(
    await search(page, { phrases: ABOUT, targets: ZCASH_ORCHARD_ONLY, coin: "zcash" }),
    "Address 1: a unified address with an Orchard receiver and no Sapling receiver, which cannot be searched: Orchard keys are not derived here.",
  );
}

/** The Wallet Matcher searches each coin of its edition: Cardano's three variants in Multi-Chain. */
export class WalletMatcherCase {
  static async run(page, multiChain) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    await page.locator("#recovery-backup-mode").click();
    await page.locator("#wallet-matcher-panel").waitFor({ state: "visible" });
    if (!multiChain) {
      assert.equal(await page.locator("#matcher-coin").isDisabled(), true, "Dash is the only coin");
      assert.equal(await page.locator("#matcher-coin").inputValue(), "dash");
      assert.equal(
        await search(page, { phrases: ABOUT, targets: DASH_ADDRESS, count: "1" }),
        "1 match found.",
      );
      assert.match(
        await page.locator("#wallet-matcher-results").innerText(),
        /m\/44'\/5'\/0'\/0\/0/u,
      );
      // Dash Community holds no Cardano and no Zcash: their addresses are none of its coins'.
      for (const target of [CARDANO[1][0], ZCASH[1][0], ZCASH[2][0]])
        assert.equal(
          await search(page, { phrases: ABOUT, targets: target, count: "1" }),
          "Address 1 is not recognized for the selected network.",
        );
      await cancelWhilePreparing(page, { target: DASH_ADDRESS });
      return "Dash Community's Matcher finds Dash Core's first address, recognizes no Cardano or Zcash address, and shows the seeds' progress of 100 phrases until Cancel";
    }
    // Below 24 words Icarus-Trezor's keys are Icarus's: each Icarus address is found twice.
    assert.equal(
      await search(page, {
        phrases: `${WALK}\n${ABOUT}`,
        targets: CARDANO.map(([address]) => address).join("\n"),
        coin: "cardano",
        change: true,
      }),
      "9 matches found.",
    );
    const results = await page.locator("#wallet-matcher-results").innerText();
    for (const [address, path] of CARDANO) {
      assert.ok(results.includes(address), address);
      assert.ok(results.includes(path), path);
    }
    // Without change addresses, role 1 is not searched.
    assert.equal(
      await search(page, { phrases: ABOUT, targets: CARDANO[3][0], coin: "cardano" }),
      "0 matches found.",
    );
    assert.equal(
      await search(page, {
        phrases: ABOUT,
        targets: `${CARDANO[4][0]}\n${SCRIPT_ADDRESS}`,
        coin: "cardano",
      }),
      "Address 2: a Cardano address of a script or a pointer, which no key of a recovery phrase derives.",
    );
    await zcashSearch(page);
    // Cardano's seeds of a phrase are two CIP-3 roots (4096 rounds each) and BIP39's: 100 phrases
    // take seconds, so Cancel lands while they are made, before any structure is searched.
    const lines = await cancelWhilePreparing(page, {
      target: CARDANO[1][0],
      coin: "cardano",
    });
    assert.ok(!lines.some((line) => line.startsWith("Scanning")), lines.join(" | "));
    return "The Matcher finds Zcash's Sapling receivers in rows and by its keys past the range, refuses an Orchard-only address, finds Cardano's published and oracle addresses under Icarus, Icarus-Trezor and Ledger on roles 0, 1 (with change addresses) and 2, names the line of a script address, and shows the seeds' progress of 100 phrases until Cancel stops it";
  }
}
