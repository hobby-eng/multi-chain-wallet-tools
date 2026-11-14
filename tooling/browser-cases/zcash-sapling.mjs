import assert from "node:assert/strict";

const ABANDON_ABOUT =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/**
 * Own values (CORE-27) of test/oracles/zcash_sapling_oracle.py, which first reproduces the published
 * Sapling and ZIP-316 vectors of zcash/zcash-test-vectors and the Swift and Android SDKs' values:
 * "abandon … about", account 0, diversifier indexes 0 to 3, where index 2 has no Sapling address
 * (packages/coin-protocols/tests/zcash-sapling.test.ts holds the same values).
 */
const ROWS = [
  {
    j: 0,
    address: "zs188wzupg00tqs3y5reyjc758c6vhl8qm2kg4k43mcp533ytrdkwpy8xjdk3zqtek0ng0cv7f0nta",
    unifiedAddress:
      "u1rzu6upvddzeedfl66g2lykaturxws9xxjlc2vdz8hyu2n0qymcfjd4ufrgafp9kxpe8r20wpessjsjf6gpsre6chkvayj53gycuyr55r",
    unifiedTransparentAddress:
      "u1jl6ww3ud2f6dsu5ekr5cf2myfputgz0s3tqt8ur8zesq3fs6vudh9xyne8p8yha2cd56kzlnrjunc822ue97shduwcnnhyfdlmnh2dzp7jnd0u70tedenafz036flat3jfc273rdj32",
    // The Transparent tab's address #0 of the same phrase.
    transparentReceiver: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
  },
  {
    j: 1,
    address: "zs18mf5cfxk86548936crvphcfsfemgq20j67sgdgn9wu465hgwy8n3jmavx55pmezxkutrj98kjqf",
    unifiedAddress:
      "u1k52dmgg6wt2vavju2f7latk9808h9t6a5teeyex7ndadz2j4utpk0w4zdlnd4t6dpe9jdpvfredp37hx8493ccdf49fdc940ygrwhcwn",
  },
  { j: 2 },
  {
    j: 3,
    address: "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
    unifiedAddress:
      "u1tugn8hee4xku237444radlr7ptz5fs8t7cqcpzcmvvxan5ts835ah62nvs9jn4pxaamgn966v9mgfdepldqzr36334kxm4naxsvqll73",
  },
];

/** The same oracle's account keys of that phrase, hidden until shown; Basic mode shows the first. */
const SUMMARY = {
  unifiedFullViewingKey:
    "uview1ug8krfwhlae5gs222wu5skekpjarn7garssal4zldex6dkdhgespjcq0cdf53j5y066mv6lnkznv2u3gke2vjxv9m5aq4tsu33wh2y3xuqu9evkmh4z0a3xgjgqxfh09qv7jq3mdf0j3dcyn0tckxgjtfmhrv3f2z7ap9ngjzzglla2x6hz6p9ln7g2hsljpk6aaafmut65sj2ma9d38t2ryn0cntapgrg5m4d24mcs6wa8ty6z0zzhsupr2vmpmfe7x2ng0ujplthjzw2ydllzmfw9rrmrqttlwl50gs4as8k9r06yxwkw3v0v72lpagxq2efjjz0ejy65tnpwd6g7wlux",
  saplingFullViewingKey:
    "zxviews1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjd5k8kq2gx555yanx7mv0hsgyw8nn4dmsl44afssw5whnkfqxrgcs343rpv59a97w4320fa3m6jderp4y8rhywd3edkvqetmt9wtde7yx0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qw2wx7h",
  unifiedIncomingViewingKey:
    "uivk1lsy9eyhhrm7s6sl283xle9z6k7e072jsaurtwxyhhd0937wq6v92gfm86pc53y0es4nrq0jj9w6rhytfxf4kcz34ngt3xunt706plxclnf9tyt6r36em9y7m3fuf4gt80vdp4nnw6f43jgke4wxjcxkwlzdqlk6z9r8actg5sjjj0h8vxnmqjgauffac6ev2p6ae0q7r0peyckp70yt4se8mxj3td3sygk7lusc3xam0tnqzlq8u7",
  saplingSpendingKey:
    "secret-extended-key-main1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjdhc9v7jnk3utf4g66ddp6cll6fw0vqthr9vnczdjqkxyelkjxgtq2a5g5w6ngqj4rnewvnf3ehh7fzftv4jpkgzrtv4jqjej6zdge4gr0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qdtz6vv",
};

/**
 * zcash-android-wallet-sdk's PHRASE (@1aaf2c4 sdk-lib/src/androidTest/java/cash/z/ecc/android/sdk/
 * jni/TransparentTest.kt L49-51) and the zAddr it declares (L58). Its index 0 has no Sapling
 * address: the unified address that the SDK asserts holds the Sapling receiver of j = 1.
 */
const ANDROID_PHRASE =
  "deputy visa gentle among clean scout farm drive comfort patch skin salt ranch cool ramp warrior drink narrow normal lunch behind salt deal person";
const ANDROID_ZS = "zs1yc4sgtfwwzz6xfsy2xsradzr6m4aypgxhfw2vcn3hatrh5ryqsr08sgpemlg39vdh9kfupx20py";

const NOTE =
  "No Sapling address at this index: its diversifier is not valid (ZIP-32), and wallets skip it.";
/** The notices of the tab, as the coin module words them. */
const NOTICES = [
  /Where a wallet's unified address holds a Sapling receiver, it is the row's zs1 address/u,
  /A unified address with only an Orchard receiver, as Zingo shows by default, has no counterpart/u,
  /About half of the diversifier indexes have no Sapling address/u,
  /Every export leaves such a row out, except that in Advanced mode Copy selected/u,
  /holds the Transparent tab's address #j, m\/44'\/133'\/account'\/0\/j/u,
  /ZIP 304, Zcash's Sapling address signatures, is a Draft/u,
  /at least 256 bits of entropy, as a 24-word phrase has/u,
];

/** The shown values of the fields `key` in `scope`, in the page's order. */
const values = (page, scope, key) =>
  page
    .locator(`${scope} [data-copy-field="${key}"]`)
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.parentElement.querySelector(".value")?.textContent ??
          button.closest(".row")?.querySelector(".value")?.textContent,
      ),
    );

/** Derives the chosen tab and waits for its `count` rows, among them the Sapling address `expected`. */
async function derive(page, count, expected) {
  await page.locator("#derive-button").click();
  await page.waitForFunction(
    ({ count, address }) =>
      document.querySelectorAll("#address-list tbody tr").length === count &&
      [...document.querySelectorAll('#address-list [data-copy-field="address"]')].some(
        (button) => button.parentElement?.querySelector(".value")?.textContent === address,
      ),
    { count, address: expected },
  );
}

/** The Basic table's header and its rows' address cells, or the note a row shows in their place. */
async function basicTable(page) {
  return page.locator("#address-list table").evaluate((table) => ({
    headers: [...table.querySelectorAll("th")].map((cell) => cell.textContent),
    rows: [...table.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll(":scope > td")]
        .slice(2)
        .map(
          (cell) =>
            cell.querySelector(".value")?.textContent ??
            `${cell.querySelector(".table-empty")?.textContent} (${cell.colSpan})`,
        ),
    ),
  }));
}

/** The payload of the QR code of the first row's Sapling address: a ZIP-321 zcash: URI. */
async function firstQrPayload(page) {
  const cell = page
    .locator('#address-list [data-copy-field="address"]')
    .first()
    .locator("xpath=..");
  await cell.locator(".qr-trigger").click();
  const payload = await cell.locator(".payment-qr-payload").innerText();
  await cell.locator(".qr-trigger").click();
  return payload;
}

/** The summary's keys `keys`: hidden and not copyable until shown, then the oracle's texts. */
async function checkHiddenKeys(page, keys) {
  for (const key of keys) {
    // A viewing key's label says why it is hidden.
    const why = await page
      .locator(`#summary [data-copy-field="${key}"]`)
      .evaluate((button) => button.closest(".row")?.querySelector(".row-label")?.title ?? "");
    if (key !== "saplingSpendingKey")
      assert.match(why, /so it is hidden like the spending key/u, key);
    const [hidden] = await values(page, "#summary", key);
    assert.equal(typeof hidden, "string", key);
    assert.doesNotMatch(hidden, /uview1|uivk1|zxviews1|secret-extended-key-main1/u, key);
    assert.equal(await page.locator(`#summary [data-copy-field="${key}"]`).isDisabled(), true, key);
  }
  await page.locator("#toggle-result-secrets").click();
  for (const key of keys)
    assert.deepEqual(await values(page, "#summary", key), [SUMMARY[key]], key);
  await page.locator("#toggle-result-secrets").click();
  assert.doesNotMatch(
    await page.locator("#summary").innerText(),
    /uview1|uivk1|zxviews1|secret-extended-key-main1/u,
  );
}

/** Zcash's Sapling tab in the Multi-Chain Deriver, and nowhere in Dash Community's. */
export class ZcashSaplingCase {
  /**
   * The Sapling tab derives the oracle's rows of "abandon … about" (index 2 without an address)
   * in Basic and Advanced mode with its notices, a zcash: QR and hidden account keys, and the Android
   * SDK's declared address at index 1 of its phrase, whose index 0 has none, under the right column.
   */
  static async run(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    assert.equal(await page.locator('#coin option[value="zcash"]').textContent(), "Zcash");
    await page.locator("#mnemonic").fill(ABANDON_ABOUT);
    await page.locator("#coin").selectOption("zcash");
    assert.deepEqual(
      await page
        .locator("#protocol-tabs [data-adapter-id]")
        .evaluateAll((tabs) => tabs.map((tab) => [tab.dataset.adapterId, tab.textContent.trim()])),
      [
        ["zcash", "Transparent · BIP44"],
        ["zcash-sapling", "Shielded Sapling · ZIP-32"],
      ],
    );
    assert.match(await page.content(), /Shielded Sapling ZIP-32 gives a row for each diversifier/u);
    await page.locator('#protocol-tabs [data-adapter-id="zcash-sapling"]').click();
    // The tab sets its own default count; the case then asks for four indexes.
    await page.locator("#count").fill("4");
    assert.equal(await page.locator("#start-label").innerText(), "First diversifier index");
    assert.equal(await page.locator("#count-label").innerText(), "Number of indexes");
    await derive(page, 4, ROWS[3].address);
    assert.equal(
      await page.locator("#path-preview").innerText(),
      "m/32'/133'/0' · diversifier index 0…3",
    );
    assert.deepEqual(await basicTable(page), {
      headers: ["Use", "Path", "Sapling address", "Unified address (Sapling only)"],
      rows: ROWS.map((row) =>
        row.address === undefined ? [`${NOTE} (2)`] : [row.address, row.unifiedAddress],
      ),
    });
    const notices = await page.locator("#result-notices").innerText();
    for (const notice of NOTICES) assert.match(notices, notice);
    assert.equal(await firstQrPayload(page), `zcash:${ROWS[0].address}`);
    await checkHiddenKeys(page, ["unifiedFullViewingKey"]);

    await page.locator("#mode-advanced").click();
    const cards = page.locator("#address-list .address-card");
    await cards.first().waitFor();
    assert.equal(await cards.count(), 4);
    // Rows 0, 1 and 3 have addresses; the first one's receivers are the oracle's.
    const unified = await values(page, "#address-list", "unifiedTransparentAddress");
    assert.equal(unified.length, 3);
    assert.equal(unified[0], ROWS[0].unifiedTransparentAddress);
    const [receiver] = await values(page, "#address-list", "transparentReceiver");
    assert.equal(receiver, ROWS[0].transparentReceiver);
    assert.equal(await cards.nth(2).locator(".row-note").innerText(), NOTE);
    assert.equal(await cards.nth(2).locator('[data-copy-field="address"]').count(), 0);
    await checkHiddenKeys(page, Object.keys(SUMMARY));
    await page.locator("#mode-basic").click();

    // The Android SDK's phrase: index 0 has no address, so the first row is a note.
    await page.locator("#count").fill("2");
    await page.locator("#mnemonic").fill(ANDROID_PHRASE);
    await derive(page, 2, ANDROID_ZS);
    const android = await basicTable(page);
    assert.deepEqual(android.headers, [
      "Use",
      "Path",
      "Sapling address",
      "Unified address (Sapling only)",
    ]);
    assert.deepEqual(android.rows[0], [`${NOTE} (2)`]);
    assert.equal(android.rows[1]?.[0], ANDROID_ZS);
    assert.match(android.rows[1]?.[1] ?? "", /^u1[02-9ac-hj-np-z]+$/u);
    return "Zcash's Sapling tab derives the oracle's zs1 and unified addresses of abandon … about with index 2 shown as having none, in Basic and Advanced mode with its notices, a zcash: QR and account keys hidden until shown, and the Android SDK's declared address at index 1 of its phrase under the address column while index 0 shows its note";
  }

  /** Dash Community's Deriver has no Zcash: no coin, no Sapling tab, no word of it. */
  static async absent(page) {
    await page.locator("#crypto-self-test-status.passed").waitFor();
    assert.equal(await page.locator('#coin option[value="zcash"]').count(), 0);
    assert.doesNotMatch(
      await page.content(),
      /\bsapling\b|\bzxviews1|secret-extended-key-main|\bzs1[02-9ac-hj-np-z]{75}\b/iu,
    );
    return "Dash Community's Deriver offers no Zcash and names no Sapling";
  }
}
