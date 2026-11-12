import assert from "node:assert/strict";
import { MhfeInputLifecycleCase } from "../browser-cases/mhfe-input-lifecycle.mjs";
import { MhfePendingInputCase } from "../browser-cases/mhfe-pending-input-lifecycle.mjs";
import { MhfeContainerAdaptationCase } from "../browser-cases/mhfe-container-adaptation.mjs";
import { MhfeEncryptCommandCase } from "../browser-cases/mhfe-encrypt-command.mjs";
import { RandomFixtures } from "../browser-cases/random-fixtures.mjs";
import { createHash } from "node:crypto";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { BrowserHarness } from "./host.mjs";
const { openBackupPanel, waitText, storageSnapshot, open } = BrowserHarness;
import { BrowserFixtures } from "./fixtures.mjs";
const { mnemonic } = BrowserFixtures;

async function mhfeMadePassword(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  for (const [prefix, legend] of [
    ["encrypt", "The container password: type your own, or let MHFE make one?"],
    ["rekey-new", "The new container password: yours, or made?"],
  ])
    assert.equal(await page.locator(`#mhfe-${prefix}-password-kind legend`).textContent(), legend);
  // Change password warns every user about the wallets of other passwords and asks nothing, in
  // the owner's wording, without advice to destroy the old container (mhfe 0.6.0).
  await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-rekey-panel"]').click();
  const keepOld =
    "! Wallets that other passwords open on the old container do not move to the new one: keep the old container, its passwords and its settings until you have moved their funds.";
  assert.equal(await page.locator("#mhfe-rekey-warning").innerText(), keepOld);
  // A PIM changes nothing in it: "its settings" covers the PIM.
  await page.locator("#mhfe-rekey-use-pim").check();
  await page.locator("#mhfe-rekey-pim").fill("2");
  assert.equal(await page.locator("#mhfe-rekey-warning").innerText(), keepOld);
  await page.locator("#mhfe-rekey-use-pim").uncheck();
  await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-create-panel"]').click();
  await page.locator("#mhfe-source").fill(mnemonic);
  await page.locator("#mhfe-encrypt-password-kind-words").check();
  await page.waitForFunction(
    () => (document.querySelector("#mhfe-encrypt-made-text")?.textContent ?? "") !== "",
  );
  const made = await page.locator("#mhfe-encrypt-made-text").textContent();
  assert.equal(made.split(" ").length, 5);
  assert.equal(
    await page.locator("#mhfe-encrypt-made-strength").textContent(),
    "5 words from the EFF list, about 64.6 bits.",
  );
  assert.equal(await page.locator("#mhfe-encrypt-own-password").isVisible(), false);
  await page.locator("#mhfe-encrypt-made-written").click();
  assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), "");
  await page.locator("#mhfe-encrypt-made-copy").fill(`${made}x`);
  await page.locator("#mhfe-encrypt").click();
  await waitText(
    page,
    "#mhfe-encrypt-status",
    /^That is not the password shown: correct your copy/u,
  );
  assert.equal(await page.locator("#mhfe-encrypt-made-text").textContent(), made);
  await page.locator("#mhfe-encrypt-made-written").click();
  await page.locator("#mhfe-encrypt-made-copy").fill(made);
  await page.locator("#mhfe-encrypt").click();
  await waitText(page, "#mhfe-encrypt-status", /Encrypting · round 1 of 12/u);
  assert.equal(await page.locator("#mhfe-encrypt-made-copy").inputValue(), "");
  await page.locator("#mhfe-encrypt-stop").click();
  await waitText(page, "#mhfe-encrypt-status", /worker and its memory were discarded/u);
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MHFE made password: offered in Encode and Change password; five dice words shown once, a wrong copy refused and shown again, an exact copy used; storage/no HTTP",
  );
}

async function mhfeMissingWords(context, profile, run) {
  const container =
    "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
  const words = container.split(" ");
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  await page
    .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]')
    .click();

  await page.locator("#mhfe-container").fill([...words.slice(0, 23), "?"].join(" "));
  await page.locator("#mhfe-decrypt").click();
  await waitText(
    page,
    "#mhfe-decrypt-marked-reading",
    /^Word 24 of the container phrase cannot be read/u,
  );
  await page.locator("#mhfe-decrypt-marked-no-card").click();
  await waitText(page, "#mhfe-decrypt-missing-candidates", /: 8 candidates\.$/u);
  // A passphrase the container phrase is not used with finds nothing, and the question stays.
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill("487a156e");
  assert.equal(await page.locator("#mhfe-decrypt-missing-coin-field").isVisible(), false);
  await page.locator("#mhfe-decrypt-missing-passphrase-used-yes").check();
  await page.locator("#mhfe-decrypt-missing-passphrase").fill("TREZOR");
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(
    page,
    "#mhfe-decrypt-marked-status",
    /^The container's own wallet does not match/u,
  );
  assert.equal(await page.locator("#mhfe-decrypt-missing").isVisible(), true);
  await page.locator("#mhfe-decrypt-missing-passphrase-used-no").check();
  await page.locator("#mhfe-decrypt-missing-run").click();
  const result = page.locator("#mhfe-decrypt-marked-result");
  await waitText(page, "#mhfe-decrypt-marked-result", /Found container phrase, 24 words/u);
  // The words found are words of the container: concealed with it until Show.
  assert.doesNotMatch(await result.innerText(), /peace/u);
  await result.getByRole("button", { name: "Show container" }).click();
  assert.match(
    await result.innerText(),
    /Found word 24: peace, with the container's own wallet\./u,
  );
  // Nothing is used before Use it.
  assert.equal(
    await page.locator("#mhfe-container").inputValue(),
    [...words.slice(0, 23), "?"].join(" "),
  );
  await result.getByRole("button", { name: "Use it" }).click();
  assert.equal(await page.locator("#mhfe-container").inputValue(), container);

  // Two missing words: only the container's own wallet can tell them, so only it is offered.
  await openMarkedMhfeWithoutCard(
    page,
    [...words.slice(0, 2), "?", ...words.slice(3, 23), "?"].join(" "),
  );
  await waitText(page, "#mhfe-decrypt-missing-candidates", /: 16,384 candidates\.$/u);
  assert.match(
    await page.locator("#mhfe-decrypt-missing-limits").innerText(),
    /^Two words are missing: only a fingerprint or an address of the container's own wallet/u,
  );
  for (const known of ["original", "passphrase", "nothing"])
    assert.equal(await page.locator(`#mhfe-decrypt-missing-known-${known}`).isVisible(), false);
  // By an address, the coin and how far the wallet goes are asked, the usual 20 addresses chosen,
  // and the scope is stated before any work.
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill("3FWJwUxDaXoGrxZQHT4EHBDZCZw7iHUaRn");
  await page.locator("#mhfe-decrypt-missing-coin-field").waitFor();
  assert.equal(await page.locator("#mhfe-decrypt-missing-gap-field").isVisible(), true);
  assert.equal(await page.locator("#mhfe-decrypt-missing-gap-20").isChecked(), true);
  if (profile.id === "dash-community") {
    // The Dash edition offers Dash alone, so a Bitcoin address of the container is not searched.
    await page.waitForFunction(
      () => document.querySelectorAll("#mhfe-decrypt-missing-coin option").length > 0,
    );
    assert.deepEqual(
      await page
        .locator("#mhfe-decrypt-missing-coin option")
        .evaluateAll((options) => options.map((option) => option.value)),
      ["dash"],
    );
  } else {
    // The coins searched are named before the work: read from a 3… address, Bitcoin and Litecoin.
    await waitText(
      page,
      "#mhfe-decrypt-missing-search",
      /^Coin: Bitcoin or Litecoin \(from the address\) · .*Search: /u,
    );
    await page.locator("#mhfe-decrypt-missing-coin").selectOption("bitcoin");
    await waitText(
      page,
      "#mhfe-decrypt-missing-search",
      /^Coin: Bitcoin · .*Search: .*, 40 addresses$/u,
    );
  }
  await page.locator("#mhfe-decrypt-missing-back").click();

  // Another valid word in place of the first fails the checksum: said, then repaired.
  await page.locator("#mhfe-container").fill(["abandon", ...words.slice(1)].join(" "));
  await page.locator("#mhfe-decrypt").click();
  await page.locator("#mhfe-decrypt-marked-again-choice").waitFor();
  await page.locator("#mhfe-decrypt-marked-repair-it").click();
  assert.equal(await page.locator("#mhfe-decrypt-marked-no-card").isVisible(), false);
  await page.locator("#mhfe-decrypt-marked-card").fill("shaft pupil patient jewel");
  await page.locator("#mhfe-decrypt-marked-repair").click();
  await waitText(page, "#mhfe-decrypt-marked-result", /Repaired word 1 of the container phrase\./u);
  await result.getByRole("button", { name: "Use it" }).click();
  assert.equal(await page.locator("#mhfe-container").inputValue(), container);

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MHFE Decode: word 24 marked ? not found with a passphrase the container phrase lacks, found by its own fingerprint without one and used only after Use it; two missing words offered only the container's own wallet, its address searched in the first 20 of each chain; a wrong first word said and repaired with four repair words; storage/no HTTP",
  );
}

async function openMarkedMhfeWithoutCard(page, container) {
  await page.locator("#mhfe-container").fill(container);
  await page.locator("#mhfe-decrypt").click();
  await page.locator("#mhfe-decrypt-marked-no-card").click(); // Opening reads candidates asynchronously and resets the previous answers before showing.
  await page.locator("#mhfe-decrypt-missing").waitFor({ state: "visible" });
}

async function chooseMissingMhfeAddressPath(page, coin, address, path = "") {
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill(address);
  await page.locator("#mhfe-decrypt-missing-coin").selectOption(coin);
  await page.locator("#mhfe-decrypt-missing-use-path").check();
  await page.locator("#mhfe-decrypt-missing-path").fill(path);
}

async function mhfeCustomPath(context, profile, run) {
  const container =
    "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
  const knownPath = "m/123'/4/9'/8";
  const enteredPath = "m/123h/4/9h/8";
  const wrongPath = "m/123'/4/9'/9";
  const coin = profile.id === "dash-community" ? "dash" : "bitcoin";
  const address =
    coin === "dash"
      ? "XbTRnErdGtvGpfkNXN9SWDfPE2Cw8XLNVz"
      : "bc1qpph2gpw6eyuhl0gm6w5hcml80rvy3th3l0l9qu";
  const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
  for (const prefix of [
    "mhfe-decrypt-missing",
    "mhfe-check-missing",
    "mhfe-rekey-missing",
    "mhfe-wallets-missing",
    "mhfe-check-no-length",
  ]) {
    assert.equal(await page.locator(`#${prefix}-use-path`).count(), 1);
    assert.equal(await page.locator(`#${prefix}-path`).count(), 1);
    assert.equal(
      await page.locator(`#${prefix}-path-label`).textContent(),
      "Only one derivation path",
    );
    assert.equal(await page.locator(`#${prefix}-path`).getAttribute("placeholder"), "m/…");
  }
  await page
    .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]')
    .click();
  const words = container.split(" ");
  const marked = [...words.slice(0, 23), "?"].join(" ");
  await openMarkedMhfeWithoutCard(page, marked);
  await waitText(page, "#mhfe-decrypt-missing-candidates", /: 8 candidates\.$/u);
  await chooseMissingMhfeAddressPath(page, coin, address);
  await page.locator("#mhfe-decrypt-missing-passphrase-used-no").check();

  // Choosing a path but leaving it empty must not silently start the usual wider search.
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(page, "#mhfe-decrypt-marked-status", /derivation path/iu);
  assert.equal(await page.locator("#mhfe-decrypt-marked-result > *").count(), 0);
  await page.locator("#mhfe-decrypt-missing-path").fill("m/2147483648");
  await waitText(page, "#mhfe-decrypt-missing-search", /path/iu);
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(page, "#mhfe-decrypt-marked-status", /path/iu);
  assert.equal(await page.locator("#mhfe-decrypt-marked-result > *").count(), 0);

  await page.locator("#mhfe-decrypt-missing-path").fill(wrongPath);
  await waitText(page, "#mhfe-decrypt-missing-search", /m\/123'\/4\/9'\/9/u);
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(
    page,
    "#mhfe-decrypt-marked-status",
    /^The container's own wallet does not match/u,
  );
  assert.equal(await page.locator("#mhfe-container").inputValue(), marked);

  await page.locator("#mhfe-decrypt-missing-path").fill(enteredPath);
  await waitText(page, "#mhfe-decrypt-missing-search", /m\/123'\/4\/9'\/8/u);
  assert.equal(
    (await page.locator("#mhfe-decrypt-missing-search").innerText()).split("Search: ").at(-1),
    `only ${knownPath}`,
  );
  await page.locator("#mhfe-decrypt-missing-run").click();
  await waitText(page, "#mhfe-decrypt-marked-result", /Found container phrase, 24 words/u);
  const result = page.locator("#mhfe-decrypt-marked-result");
  await result.getByRole("button", { name: "Show container" }).click();
  assert.match(await result.innerText(), /Found word 24: peace/u);
  assert.equal(await page.locator("#mhfe-container").inputValue(), marked);

  // A completed search closes its questions. Reopen them to test a reference-kind change.
  await openMarkedMhfeWithoutCard(page, marked);
  await chooseMissingMhfeAddressPath(page, coin, address, enteredPath);
  // A fingerprint is a different reference; the previous exact path cannot follow it.
  await page.locator("#mhfe-decrypt-missing-reference").fill("487a156e");
  assert.equal(await page.locator("#mhfe-decrypt-missing-path-field").isVisible(), false);
  assert.equal(await page.locator("#mhfe-decrypt-missing-use-path").isChecked(), false);
  assert.equal(await page.locator("#mhfe-decrypt-missing-path").inputValue(), "");
  await page.locator("#mhfe-decrypt-missing-reference").fill(address);
  assert.equal(await page.locator("#mhfe-decrypt-missing-use-path").isChecked(), false);

  // With two missing words the exact path replaces the gap, including a stale invalid own gap.
  await openMarkedMhfeWithoutCard(
    page,
    [...words.slice(0, 2), "?", ...words.slice(3, 23), "?"].join(" "),
  );
  await page.locator("#mhfe-decrypt-missing-known-container").check();
  await page.locator("#mhfe-decrypt-missing-reference").fill(address);
  await page.locator("#mhfe-decrypt-missing-coin").selectOption(coin);
  await page.locator("#mhfe-decrypt-missing-gap-other").check();
  await page.locator("#mhfe-decrypt-missing-gap-own").fill("-1");
  await page.locator("#mhfe-decrypt-missing-use-path").check();
  await page.locator("#mhfe-decrypt-missing-path").fill(enteredPath);
  assert.equal(await page.locator("#mhfe-decrypt-missing-gap-field").isVisible(), false);
  await waitText(page, "#mhfe-decrypt-missing-search", /m\/123'\/4\/9'\/8/u);
  assert.equal(
    (await page.locator("#mhfe-decrypt-missing-search").innerText()).split("Search: ").at(-1),
    `only ${knownPath}`,
  );
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "Missing-word custom path: all five hosts present; empty and overflow paths refuse; wrong path does not match; h spelling finds the independently computed Bitcoin/Dash address, describes the canonical path and finds the public final word; fingerprint clears the path; exact path excludes a stale invalid gap; no Argon2, storage or HTTP",
  );
}

async function checkedMnemonic(context, profile, run) {
  await RandomFixtures.walletCheckDraw(context);
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  assert.equal(await page.locator("#wallet-check-enabled").isChecked(), false);
  // A new phrase is a new wallet: ordinary generation starts it without the old BIP39 passphrase
  // (owner's decision, 2026-10-08); the MHFE wallet check below keeps the one it was drawn for.
  const exactPassphrase = "  ＴＲＥＺＯＲ  ";
  await page.evaluate(() => {
    // Zero entropy is Trezor's public vector at each BIP39 length; no random secrets in evidence.
    Object.defineProperty(crypto, "getRandomValues", {
      value: (bytes) => {
        bytes.fill(0);
        return bytes;
      },
    });
  });
  for (const count of [12, 15, 18, 21, 24]) {
    await page.locator("#passphrase").fill(exactPassphrase);
    await page.locator(`#generate-${count}`).click();
    assert.equal(await page.locator("#passphrase").inputValue(), "");
    assert.equal((await page.locator("#mnemonic").inputValue()).split(" ").length, count);
  }
  // The addresses say right above the table whether they belong to the wallet with a passphrase.
  await page.waitForFunction(
    () => (document.querySelector("#address-list")?.children.length ?? 0) > 0,
  );
  assert.equal(await page.locator("#passphrase-in-use").isVisible(), false);
  await page.locator("#passphrase").fill(exactPassphrase);
  await page.locator("#passphrase-in-use").waitFor();
  await page.locator("#clear-all").click();
  assert.equal(await page.locator("#passphrase").inputValue(), "");
  // The page's zero source was for the vectors above; the draw's workers keep their own source.
  await page.locator("#wallet-check-enabled").check();
  await waitText(page, "#passphrase-need", /required for MHFE generation/u);
  for (const count of [12, 15, 18, 21])
    assert.equal(await page.locator(`#generate-${count}`).isDisabled(), true);
  // The check alone, as MHFE rated it: 16 of the 256 bits.
  await waitText(page, "#generation-bits", /keeps about 240 of its 256 random bits/u);
  // The check needs a passphrase; the refusal stands next to the Generate buttons.
  await page.locator("#generate-24").click();
  await waitText(page, "#generation-error", /needs a BIP39 passphrase/u);
  assert.equal(await page.locator("#error").isVisible(), false);
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  await page.locator("#passphrase").fill("TREZOR");
  // One passphrase field, checked with Show (owner, 2026-10-25): its warning shows while it holds text.
  await page.locator("#passphrase-warning").waitFor({ state: "visible" });
  await page.locator("#toggle-passphrase").click();
  assert.equal(await page.locator("#passphrase").getAttribute("type"), "text");
  await page.locator("#toggle-passphrase").click();
  assert.equal(await page.locator("#passphrase").getAttribute("type"), "password");
  await page.locator("#chosen-words-enabled").check();
  await page.locator("#toggle-sensitive-values").click();
  await page.locator("#chosen-word-1-position").selectOption("1");
  await page.locator("#chosen-word-1").fill("abandon");
  await page.locator("#chosen-words-never").fill("zoo");
  await waitText(page, "#chosen-words-panel", /rule out almost every wrong password/u);
  // A fixed word costs 11 bits and the check 16; the excluded word a small fraction of a bit.
  await waitText(
    page,
    "#generation-bits",
    /^Not recommended: the phrase keeps about 228 of its 256/u,
  );
  assert.equal(await page.locator("#chosen-words-strength").isVisible(), false);
  const hasProfile = (phrase, passphrase) => {
    const seed = mnemonicToSeedSync(phrase, passphrase);
    try {
      return createHash("sha256")
        .update("MHFE-WALLET-CHECK-SEED-1", "ascii")
        .update(Buffer.from([0, 0, 1, 0]))
        .update(seed)
        .digest("hex")
        .startsWith("0000");
    } finally {
      seed.fill(0);
    }
  };
  const publicPhrase = (counter) => {
    const entropy = new Uint8Array(32);
    new DataView(entropy.buffer).setBigUint64(24, BigInt(counter), false);
    return entropyToMnemonic(entropy, wordlist);
  };
  // The profile vector that passes with "TREZOR": the first draw, which meets the wishes, is taken,
  // and MHFE's own check of it passes.
  await page.evaluate(() => {
    window.mhfeRandom = 76562;
  });
  await page.locator("#generate-24").click();
  await page.waitForFunction(
    (phrase) => document.querySelector("#mnemonic").value === phrase,
    publicPhrase(76562),
  );
  const drawn = await page.locator("#mnemonic").inputValue();
  assert.equal(hasProfile(drawn, "TREZOR"), true);
  assert.equal(await page.locator("#passphrase").inputValue(), "TREZOR");
  // The same wishes with the passphrase "trezor": the vector does not pass, and Stop drops the
  // draw while the phrase shown before stays. The fixture's first draw is held until Stop.
  await page.evaluate(() => {
    window.mhfeDrawDelay = 5000;
  });
  await page.locator("#passphrase").fill("trezor");
  await page.locator("#generate-24").click();
  await page.locator("#generation-stop").waitFor({ state: "visible" });
  await page.locator("#generation-stop").click();
  await page.locator("#generation-stop").waitFor({ state: "hidden" });
  await waitText(page, "#generation-line", /^Stopped /u);
  await page.evaluate(() => {
    window.mhfeDrawDelay = 0;
  });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#generation-error").isVisible(), false, "Stop is not a failure");
  assert.ok(
    (await page.locator("#mnemonic").inputValue()) === drawn,
    "the cancelled draw is dropped",
  );
  await page.locator("#clear-all").click();
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  assert.equal(await page.locator("#wallet-check-enabled").isChecked(), false);
  // A stuck random source is refused before any draw; nothing is shown.
  await page.evaluate(() => {
    window.mhfeRandom = "stuck";
  });
  await page.locator("#wallet-check-enabled").check();
  await page.locator("#passphrase").fill("TREZOR");
  await page.locator("#generate-24").click();
  await waitText(page, "#generation-error", /random/iu);
  assert.equal(await page.locator("#mnemonic").inputValue(), "");
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "The Deriver draws the checked phrase on its own workers and MHFE checks it: passphrase required, its warning and Show, the published profile vector with chosen and excluded words, the rating shown, cancel and Clear drop the draw, a stuck random source refused; no storage or HTTP",
  );
}

/** Cohesive mhfe cases; helpers stay private to this module. */
export class MhfeBrowserCases {
  /** Actual preliminary readings handle refusals and retire managed inputs before delayed replies. */
  static mhfeContainerPreviews = async (context, profile, run) => {
    const cases = [
      ...["decrypt", "check", "rekey"].map((prefix) => ({ kind: "refusal", value: prefix })),
      ...["decrypt", "check", "rekey"].map((prefix) => ({ kind: "healthy", value: prefix })),
      ...["edit", "clear", "pagehide", "operation"].map((value) => ({ kind: "retirement", value })),
    ];
    for (const { kind, value } of cases) {
      const { page } = await openBackupPanel(context, profile, run, "mhfe-panel");
      try {
        const probe = new MhfeContainerAdaptationCase(page);
        await probe[kind](value);
      } finally {
        await page.close();
      }
    }
    assert.equal(run.requests.length, 0);
    run.checks.push(
      "MHFE preliminary container reads: three visible input-free refusals, three real successful reads, and managed input retirement on edit, programmatic Clear, dispatched pagehide and explicit operation; no KDF or immutable/worker-memory erasure claim",
    );
  };
  /** Real worker replies stay withheld until retirement has wiped the observed host buffers. */
  static mhfePendingInputs = async (context, profile, run) => {
    for (const action of ["edit", "clear", "pagehide", "rollback", "replacement"]) {
      const { page } = await openBackupPanel(context, profile, run, "mhfe-panel");
      try {
        const probe = new MhfePendingInputCase(page);
        if (action === "rollback") await probe.openingRollback();
        else if (action === "replacement") await probe.markedReplacement();
        else await probe.repairRetirement(action);
      } finally {
        await page.close();
      }
    }
    run.checks.push(
      "MHFE managed host input bytes wiped before delayed real-worker replies on edit, programmatic Clear, dispatched pagehide, opening cancellation and prompt replacement; no immutable-string or worker-memory erasure claim",
    );
  };

  /** Bounded host input admission and public repair controls, without a full-cost KDF. */
  static mhfeInputLifecycle = async (context, profile, run) => {
    const { page } = await openBackupPanel(context, profile, run, "mhfe-panel");
    await new MhfeInputLifecycleCase(page).run();
    run.checks.push(
      "MHFE exact public repair and raw Encode/repair admission without an Argon2 recovery",
    );
  };
  /** Encode's memory level and the mhfe command beside it, without an Argon2 run. */
  static mhfeEncryptCommand = async (context, profile, run) => {
    const { page, before } = await openBackupPanel(context, profile, run, "mhfe-panel");
    run.checks.push(await new MhfeEncryptCommandCase(page).run());
    assert.deepEqual(await storageSnapshot(page), before);
    assert.equal(run.requests.length, 0);
    run.checks.push(
      "MHFE Encode's mhfe command: shown only for a PIM or memory level other than 0, exact for every choice, copied exactly with the phrase hidden and shown, Encrypt closed above level 0; storage/no HTTP",
    );
  };
  /** Shared checkedMnemonic boundary for the native browser cases. */
  static checkedMnemonic = checkedMnemonic;
  /** Shared mhfeMissingWords boundary for the native browser cases. */
  static mhfeMissingWords = mhfeMissingWords;
  /** Shared mhfeCustomPath boundary for the native browser cases. */
  static mhfeCustomPath = mhfeCustomPath;
  /** Shared mhfeMadePassword boundary for the native browser cases. */
  static mhfeMadePassword = mhfeMadePassword;
}
