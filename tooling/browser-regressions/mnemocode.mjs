import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BrowserHarness } from "./host.mjs";
const {
  openSeedShiftEncoding,
  waitText,
  open,
  openWithLinkedPhrase,
  storageSnapshot,
  openBackupPanel,
} = BrowserHarness;
import { BrowserFixtures } from "./fixtures.mjs";
const { mnemonic } = BrowserFixtures;

async function mnemocodeLateCards(context, profile, run) {
  const { page } = await openSeedShiftEncoding(context, profile, run);
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#mnemocode-cards-section > summary").click();
  await page.locator("#mnemocode-card-qr").check();
  let downloads = 0;
  page.on("download", () => (downloads += 1));
  const images = page.locator("#mnemocode-cards-qr-images");
  // The control: an export whose phrase stays offers its sheet's QR code as an image.
  await page.locator("#export-mnemocode-cards").click();
  await waitText(page, "#mnemocode-cards-status", /^Saved /u);
  assert.equal(await images.isVisible(), true);
  assert.equal(downloads, 1);
  // The phrase of Generate & Derive changes after the next export has read it and before
  // MnemoCode draws the cards, in the frame the page leaves after the press. MnemoCode draws every
  // card in one call, which keeps the page busy until the file is made, so nothing can change
  // during the drawing itself.
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  await page.locator("#mnemocode-card-page-size").selectOption("business");
  await page.locator("#mnemonic").evaluate((field) => {
    const status = document.querySelector("#mnemocode-cards-status");
    new MutationObserver((_, observer) => {
      if (!status.textContent.startsWith("Rendering cards")) return;
      observer.disconnect();
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await page.locator("#export-mnemocode-cards").click();
  await waitText(page, "#mnemocode-cards-status", /nothing was saved/u);
  assert.equal(await images.isHidden(), true);
  assert.equal(await images.locator("button").count(), 0);
  assert.equal(downloads, 1);
  run.checks.push(
    "Cards of a phrase changed while they were drawn: no file and no QR image of the old phrase",
  );
}

async function mnemocodeShareList(context, profile, run) {
  const vectorShares = BrowserFixtures.sskrShares;
  const scanner = await open(context, profile, "discovery-scanner", run);
  const vault = scanner.frameLocator("#recovery-secret-vault");
  await vault.locator('[data-input-mode="batch"]').click();
  await vault.locator("#candidate-list-import > summary").click();
  await vault.locator("#candidate-list-show-key").click();
  const key = vault.locator("#candidate-list-key");
  await key.waitFor({ state: "visible" });
  const recipient = await key.inputValue();
  assert.match(recipient, /^age1[0-9a-z]+$/u);

  const deriver = await open(context, profile, "key-derivation", run);
  await deriver.locator("#recovery-backup-mode").click();
  await deriver.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
  await deriver.locator('[data-operation-tab][aria-controls="mnemocode-restore-panel"]').click();
  await deriver.locator("#mnemocode-restore-shares").fill(vectorShares.join("\n"));
  await deriver.locator("#mnemocode-restore-list").check();
  await deriver.locator("#mnemocode-restore-list-protect-key").check();
  await deriver.locator("#mnemocode-restore-list-key").fill(recipient);
  await deriver.locator("#mnemocode-restore-wallet-passphrase").fill("TREZOR");
  await deriver.locator("#mnemocode-restore").click();
  await waitText(deriver, "#mnemocode-restore-status", /The phrase is restored\./u);
  const result = deriver.locator("#mnemocode-restore-result");
  const [download] = await Promise.all([
    deriver.waitForEvent("download"),
    result.locator("button", { hasText: "Save candidate list" }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  await download.delete();
  // Its final consumer has the encrypted file; keep only the Scanner's one-time key alive.
  await deriver.close();
  assert.equal(context.pages().length, 1);

  // The list file is chosen with a button in the shared style, the file's name beside it.
  const chooser = vault.locator("label.file-choice", {
    has: vault.locator("#candidate-list-file"),
  });
  assert.equal(await chooser.innerText(), "Choose the list file");
  const fileName = vault.locator(".file-choice-name");
  assert.equal(await fileName.innerText(), "No file chosen");
  await vault.locator("#candidate-list-file").setInputFiles({
    name: "candidates.age",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  assert.equal(await fileName.innerText(), "candidates.age");
  const reveal = vault.locator("#reveal-recovery-input");
  assert.equal(await reveal.isVisible(), true);
  await vault.locator("#candidate-list-open").click();
  const status = vault.locator("#candidate-list-status");
  await status.filter({ hasText: /candidate from the list/u }).waitFor();
  assert.equal(
    await status.innerText(),
    "1 candidate from the list, with the BIP39 passphrase stored in the list. They are checked in place of the phrases typed above.",
  );
  // The list's candidates are never shown, so Show input, which would show nothing, is gone.
  assert.equal(await reveal.isVisible(), false);
  await vault.locator("#candidate-list-remove").click();
  assert.equal(await status.innerText(), "");
  assert.equal(await reveal.isVisible(), true);
  assert.equal(await fileName.innerText(), "No file chosen");
  run.checks.push(
    "Restore writes the shares' candidate list to the Scanner key; the Scanner chooses it with a shared-style file button, opens it, hides Show input while it stands in, and removes it",
  );
}

async function mnemocodeRoundTrip(context, profile, run) {
  const { page, before } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
  assert.equal(await page.locator("#recovery-workspace").isVisible(), true);
  assert.equal(await page.locator("#mnemocode-panel").isVisible(), true);
  assert.match(
    await page.locator("#mnemocode-panel .linked-recovery-source").innerText(),
    /Generate & Derive/u,
  );

  // MnemoCode writes English words and word numbers only masked: Direct does not offer them.
  for (const format of ["english", "indexes", "unicode", "colors", "colors-unicode"]) {
    const mode = format === "english" || format === "indexes" ? "seedshift" : "direct";
    await decodeRecord(page, await encodeRecord(page, mode, format), mode);
  }
  // A record read from a file with the shared-style file button fills the field as if typed.
  const record = await encodeRecord(page, "seedshift", "indexes");
  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  await page.locator("#mnemocode-input").fill("");
  const recordFile = page
    .locator("#mnemocode-decode-panel label.file-choice")
    .filter({ hasText: "Open a record file" });
  assert.equal(await recordFile.count(), 1);
  await recordFile.locator('input[type="file"]').setInputFiles({
    name: "record.mnc",
    mimeType: "text/plain",
    buffer: Buffer.from(`${record}\n`),
  });
  await page.waitForFunction(
    (expected) => document.querySelector("#mnemocode-input")?.value === expected,
    record.trim(),
  );
  // MnemoCode's word hints below a field shown as typed: English codes get them and Tab completes
  // the word, Unicode codes get none, and a press below the field while a hint shows still lands,
  // as the hint goes only after the click.
  const codes = page.locator("#mnemocode-input");
  const codesHint = "#mnemocode-input + .word-hint";
  await page.locator("#toggle-mnemocode-input").click();
  await codes.fill("abandon zo");
  await waitText(page, codesHint, /^zone zoo$/u);
  await codes.fill("abandon artw");
  await waitText(page, codesHint, /^artwork$/u);
  await codes.press("Tab");
  assert.equal(await codes.inputValue(), "abandon artwork ");
  await codes.fill("7684 5728 CA");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(codesHint).isVisible(), false);
  await codes.fill("abandon z");
  await waitText(page, codesHint, /^4 BIP39 words begin with this letter$/u);
  await page.locator("#decode-mnemocode").click();
  await page.waitForFunction(
    () => (document.querySelector("#mnemocode-decode-result")?.textContent ?? "").trim() !== "",
  );
  await page.locator(codesHint).waitFor({ state: "hidden" });
  await page.locator("#toggle-mnemocode-input").click();
  for (const mode of ["seedshift", "seedshift-legacy"]) {
    await decodeRecord(page, await encodeRecord(page, mode, "english"), mode);
  }
  await decodeRecord(
    page,
    await encodeRecord(page, "seedshift-legacy-valid", "english"),
    "seedshift-legacy-valid",
    true,
  );

  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-encode-format").selectOption("english");
  await page.locator("#mnemocode-encode-dates").fill("23-13-1999");
  await page.locator("#encode-mnemocode").click();
  assert.match(
    await page.locator("#mnemocode-encode-result").innerText(),
    /month must be an integer from 1 through 12/u,
  );
  await page.locator("#mnemocode-encode-dates").fill("23-12-1999");
  assert.equal(await page.locator("#mnemocode-encode-result").innerText(), "");
  await page.locator("#encode-mnemocode").click();
  await page.locator("#mnemocode-encode-result article .share-secret").waitFor();

  // Forgotten: one word, every candidate listed; the words found stay concealed until shown, and no
  // button copies the candidates in bulk.
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  const forgottenResult = page.locator("#mnemocode-forgotten-result");
  const forgottenStatus = page.locator("#mnemocode-forgotten-status");
  await page.locator("#mnemocode-forgotten-phrase").fill(mnemonic.replace(/about$/u, "?"));
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", /Search complete/u);
  assert.match(
    await forgottenResult.innerText(),
    /128 candidates\. A valid checksum does not prove/u,
  );
  assert.equal(
    await forgottenResult
      .locator(".candidate-found")
      .first()
      .evaluate((found) => found.classList.contains("concealed")),
    true,
  );
  assert.equal(await forgottenResult.locator("button").filter({ hasText: "Copy all" }).count(), 0);

  // The replacements of an old Original Seedshift phrase's last word.
  await page.locator("#mnemocode-forgotten-where-legacy").check();
  await page
    .locator("#mnemocode-forgotten-phrase")
    .fill("mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital");
  await page.locator("#mnemocode-forgotten-search").click();
  const wordOptions = forgottenResult.locator(".mnemocode-word-options");
  await wordOptions.waitFor();
  assert.match(await wordOptions.inputValue(), /checksum-bits\tlegacy-tail/u);
  assert.equal(
    (await wordOptions.inputValue()).split("\n").filter((line) => line.includes("\tpreserved"))
      .length,
    1,
  );
  assert.match(
    await forgottenResult.locator(".warning-callout").innerText(),
    /128 checksum-valid final-word replacements/u,
  );

  const impossibleWords = Array(24).fill("abandon");
  impossibleWords[4] = "?";
  impossibleWords[23] = "sure";
  await page.locator("#mnemocode-forgotten-where-places").check();
  await page.locator("#mnemocode-forgotten-phrase").fill(impossibleWords.join(" "));
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", /Search complete/u);
  assert.match(await forgottenResult.innerText(), /No valid phrase fits/u);
  assert.equal(await forgottenResult.locator("textarea").count(), 0);
  assert.equal(await forgottenStatus.isVisible(), true);

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MnemoCode Encode/Decode UI: all five representations; a record opened from a file; word hints with Tab completion, none for Unicode codes, a press below a hint still landing; Direct, Seedshift, legacy and legacy-valid modes; Forgotten word search in its worker and exact-legacy final-word replacements; MNC1/QR; storage/no HTTP",
  );
}

async function mnemocodeShares(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mnemocode-panel");
  const tab = (name) =>
    page.locator(`[data-operation-tab][aria-controls="mnemocode-${name}-panel"]`).click();
  await page.locator("#mnemocode-source").fill(mnemonic);
  await page.locator("#mnemocode-split-section > summary").click();
  await page.locator("#mnemocode-split-form").selectOption("words");
  await page.locator("#mnemocode-split").click();
  const split = page.locator("#mnemocode-split-result");
  await split.locator(".share-secret").first().waitFor();
  const shares = await split.locator(".share-secret").allTextContents();
  assert.equal(shares.length, 3);
  assert.match(await split.innerText(), /3 shares, any 2 restore it/u);
  assert.match(await split.innerText(), /Original fingerprint 73c5da0a\./u);
  // Concealed until shown, and the section's Show button leaves Encode's records alone.
  assert.equal(await split.locator(".secret-copy-action").first().isDisabled(), true);
  await page.locator("#toggle-mnemocode-split-result").click();
  assert.equal(await split.locator(".secret-copy-action").first().isDisabled(), false);
  assert.equal(await page.locator("#toggle-mnemocode-created").innerText(), "Show records");

  const marked = shares[1].split(" ");
  marked[7] = "?";
  await tab("restore");
  await page.locator("#mnemocode-restore-shares").fill(`${shares[0]}\n${marked.join(" ")}`);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
  const restored = page.locator("#mnemocode-restore-result");
  // What the repair filled in is MnemoCode's line for each share: share 2, element 8, its own word.
  assert.match(await restored.innerText(), /Filled in where \? stood:/u);
  const repairLines = restored.locator(".mnemocode-repairs li");
  assert.equal(await repairLines.count(), 1);
  const repairLine = await repairLines.innerText();
  assert.match(repairLine, /^Share 2: element 8\b/u);
  assert.ok(repairLine.includes(shares[1].split(" ")[7]), repairLine);
  assert.match(await restored.innerText(), /Original fingerprint 73c5da0a\./u);
  await page.locator("#mnemocode-restore-shares").fill(mnemonic);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /not a Shamir share/u);

  // A share typed into Decode goes to Restore as its first share, as MnemoCode's decode sends it;
  // a share typed in Restore before stays below it (AUD-023-UI001), and the two restore.
  await page.locator("#mnemocode-restore-shares").fill(shares[1]);
  await tab("decode");
  await page.locator("#mnemocode-input").fill(shares[0]);
  await page.locator("#decode-mnemocode").click();
  await waitText(page, "#mnemocode-restore-status", /share text was added/u);
  assert.match(await page.locator("#mnemocode-restore-status").innerText(), /stay below it/u);
  assert.equal(
    await page.locator("#mnemocode-restore-shares").inputValue(),
    `${shares[0]}\n${shares[1]}`,
  );
  assert.equal(await page.locator("#mnemocode-restore-panel").isVisible(), true);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);

  // A ? inside a color stands for one hex digit: two unreadable digits of one color are settled.
  await tab("create");
  await page.locator("#mnemocode-split-form").selectOption("colors");
  await page.locator("#mnemocode-split").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#mnemocode-split-result .share-secret")
      ?.textContent?.trim()
      .startsWith("#"),
  );
  const colored = await split.locator(".share-secret").allTextContents();
  const colors = colored[1].trim().split(/\s+/u);
  const place = colors.length - 2;
  const color = colors[place];
  colors[place] = `${color.slice(0, 3)}?${color[4]}?${color[6]}`;
  await tab("restore");
  await page.locator("#mnemocode-restore-shares").fill(`${colored[0]}\n${colors.join(" ")}`);
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
  assert.match(await restored.innerText(), /Original fingerprint 73c5da0a\./u);
  // A color with a ? but not six symbols is refused by its place, without the share's text.
  colors[place] = `${color.slice(0, 5)}?`;
  await page.locator("#mnemocode-restore-shares").fill(`${colored[0]}\n${colors.join(" ")}`);
  await page.locator("#mnemocode-restore").click();
  await waitText(
    page,
    "#mnemocode-restore-status",
    new RegExp(`^Share 2: color ${place + 1} has 5 of 6 symbols`, "u"),
  );
  assert.doesNotMatch(await page.locator("#mnemocode-restore-status").innerText(), /#/u);

  // Shares in Unicode codes show their codes apart above the joined text, behind the section's Show
  // button, and the restore shows the backup so too (MnemoCode, owner 2026-10-13).
  await tab("create");
  await page.locator("#mnemocode-split-form").selectOption("unicode");
  await page.locator("#mnemocode-split").click();
  await split.locator(".apart-codes").first().waitFor();
  const unicode = await split.locator(".share-secret").allTextContents();
  const apartShares = await split.locator(".apart-codes").allTextContents();
  assert.equal(apartShares.length, 3);
  apartShares.forEach((codes, index) =>
    assert.equal(codes.replaceAll(" ", ""), unicode[index].replace(/\s/gu, "")),
  );
  assert.match(await split.innerText(), /Joined, for copying:/u);
  assert.match(
    (await split.locator(".apart-codes").first().getAttribute("class")) ?? "",
    /\bconcealed\b/u,
  );
  await page.locator("#toggle-mnemocode-split-result").click();
  assert.doesNotMatch(
    (await split.locator(".apart-codes").first().getAttribute("class")) ?? "",
    /\bconcealed\b/u,
  );
  await tab("restore");
  await page.locator("#mnemocode-restore-shares").fill(unicode.slice(0, 2).join("\n"));
  await page.locator("#mnemocode-restore").click();
  await waitText(page, "#mnemocode-restore-status", /The phrase is restored\./u);
  assert.match(await restored.innerText(), /mapped Unicode code points of/u);
  const backup = restored.locator(".apart-codes");
  assert.match((await backup.getAttribute("class")) ?? "", /\bconcealed\b/u);
  await restored.getByRole("button", { name: "Show backup" }).click();
  assert.doesNotMatch((await backup.getAttribute("class")) ?? "", /\bconcealed\b/u);
  assert.equal(
    ((await backup.textContent()) ?? "").replaceAll(" ", ""),
    await restored.locator("textarea").first().inputValue(),
  );

  await tab("forgotten");
  await page.locator("#mnemocode-forgotten-kind-share").check();
  await page.locator("#mnemocode-forgotten-shares").fill(`${shares[0]}\n${marked.join(" ")}`);
  await page.locator("#mnemocode-forgotten-shares-wallet-none").check();
  await page.locator("#mnemocode-forgotten-shares-repair").click();
  await waitText(page, "#mnemocode-forgotten-shares-status", /The shares are written again\./u);
  const repaired = page.locator("#mnemocode-forgotten-shares-result");
  assert.deepEqual(await repaired.locator(".share-secret").allTextContents(), [
    shares[0],
    shares[1],
  ]);
  assert.doesNotMatch(await repaired.innerText(), /abandon/u, "a repair never shows the phrase");

  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MnemoCode shares: 2-of-3 split with fingerprints and its own reveal gate; restore with a ? element repaired jointly; ? digits inside a color repaired, a short color refused by its place; Unicode shares and their restored backup shown apart and joined; a share typed into Decode handed to Restore; a phrase refused as a share; share repair without the phrase; storage/no HTTP",
  );
}

async function mnemocodeCoinEvidence(context, profile, run) {
  const { page, before } = await openBackupPanel(context, profile, run, "mnemocode-panel");
  await page.locator('[data-operation-tab][aria-controls="mnemocode-forgotten-panel"]').click();
  await page.locator("#mnemocode-forgotten-phrase").fill(mnemonic.replace(/about$/u, "?"));
  await page.locator("#mnemocode-forgotten-wallet-address-choice").check();
  const label = await page.locator("#mnemocode-forgotten-wallet-address-label").innerText();
  assert.equal(label, profile.id === "dash-community" ? "Dash address" : "Address");
  // The coin is read from the address: no coin is asked, and the page names the coins it is read
  // as. The first Dash Core receiving address of the public test phrase, among the first 20.
  await page
    .locator("#mnemocode-forgotten-wallet-address")
    .fill("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5");
  await waitText(
    page,
    "#mnemocode-forgotten-wallet-address-coins",
    /^Read as an address of Dash\.$/u,
  );
  if (profile.id !== "dash-community") {
    // BIP44's first receiving address is of Bitcoin's form and of Bitcoin Cash's.
    await page
      .locator("#mnemocode-forgotten-wallet-address")
      .fill("1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA");
    await waitText(
      page,
      "#mnemocode-forgotten-wallet-address-coins",
      /^Read as an address of Bitcoin or Bitcoin Cash: each is looked for on its own paths\.$/u,
    );
    await page
      .locator("#mnemocode-forgotten-wallet-address")
      .fill("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5");
  }
  assert.equal(await page.locator("#mnemocode-forgotten-wallet-addresses").inputValue(), "20");
  await page.locator("#mnemocode-forgotten-search").click();
  await waitText(page, "#mnemocode-forgotten-status", /^Search complete/u);
  assert.match(
    await page.locator("#mnemocode-forgotten-result").innerText(),
    /Matched 1 of \d+ candidates against the address locally\./u,
  );
  assert.deepEqual(await storageSnapshot(page), before);
  assert.equal(run.requests.length, 0);
  run.checks.push(
    "MnemoCode wallet by an address, its coin read from it: a forgotten word found by a Dash address among the first 20; the coins named while typed; Dash-only label in the Dash edition; storage/no HTTP",
  );
}

/** Cohesive mnemocode cases; helpers stay private to this module. */
export class MnemoCodeBrowserCases {
  /** Shared mnemocodeRoundTrip boundary for the native browser cases. */
  static mnemocodeRoundTrip = mnemocodeRoundTrip;
  /** Shared mnemocodeShares boundary for the native browser cases. */
  static mnemocodeShares = mnemocodeShares;
  /** Shared mnemocodeLateCards boundary for the native browser cases. */
  static mnemocodeLateCards = mnemocodeLateCards;
  /** Shared mnemocodeShareList boundary for the native browser cases. */
  static mnemocodeShareList = mnemocodeShareList;
  /** Shared mnemocodeCoinEvidence boundary for the native browser cases. */
  static mnemocodeCoinEvidence = mnemocodeCoinEvidence;
}

async function encodeRecord(page, mode, format) {
  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator("#mnemocode-encode-mode").selectOption(mode);
  await page.locator("#mnemocode-encode-format").selectOption(format);
  if (mode === "direct") {
    await page.locator("#mnemocode-encode-dates").evaluate((input) => {
      input.value = "";
    });
  } else {
    await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
  }
  await page.locator("#encode-mnemocode").click();
  const payload = page.locator("#mnemocode-encode-result article .share-secret").first();
  await payload.waitFor();
  const value = (await payload.textContent()) ?? "";
  assert.doesNotMatch(value, /^MNC1:/u);
  // Codes written joined are shown apart above the joined text too, concealed alike, so that a
  // person sees which code to mark with ? (MnemoCode, owner 2026-10-13).
  const apart = page.locator("#mnemocode-encode-result article .apart-codes");
  const joined = format === "unicode" || format === "colors-unicode";
  assert.equal(await apart.count(), joined ? 1 : 0);
  if (joined) {
    const codes = ((await apart.textContent()) ?? "").split(" ");
    if (format === "unicode") assert.equal(codes.length, mnemonic.split(" ").length);
    assert.equal(codes.join(""), value.replace(/\s/gu, ""));
    assert.match((await apart.getAttribute("class")) ?? "", /\bconcealed\b/u);
    assert.match(
      await page.locator("#mnemocode-encode-result").innerText(),
      /Joined, for copying:/u,
    );
  }
  // The Original Seedshift adds its optional checksum-valid last word, concealed like the record,
  // where the shifted phrase of the test vector fails the checksum.
  const cards = mode === "seedshift-legacy" ? 2 : 1;
  assert.equal(await page.locator("#mnemocode-encode-result article").count(), cards);
  assert.equal(await page.locator("#mnemocode-encode-result .share-qr-action").count(), cards);
  assert.equal(
    await page.locator("#mnemocode-encode-result .mnemocode-palette").count(),
    format === "colors" || format === "colors-unicode" ? 1 : 0,
  );
  assert.equal(
    await page
      .locator("#mnemocode-encode-result button")
      .filter({ hasText: "Save record" })
      .isDisabled(),
    true,
  );
  return value;
}

async function decodeRecord(page, record, mode, expectCandidates = false) {
  await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
  await page.locator("#mnemocode-decode-mode").selectOption(mode);
  if (mode === "direct") {
    await page.locator("#mnemocode-decode-dates").evaluate((input) => {
      input.value = "";
    });
  } else {
    await page.locator("#mnemocode-decode-dates").fill("23-09-2026");
  }
  await page.locator("#mnemocode-input").fill(record);
  await page.locator("#decode-mnemocode").click();
  const output = page.locator("#mnemocode-decode-result textarea");
  await output.waitFor();
  if (expectCandidates) {
    assert.match(await output.inputValue(), new RegExp(mnemonic, "u"));
    assert.match(
      await page.locator("#mnemocode-decode-result .warning-callout").innerText(),
      /128/u,
    );
  } else {
    assert.equal(await output.inputValue(), mnemonic);
  }
}
