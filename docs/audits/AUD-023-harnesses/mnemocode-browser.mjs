// AUD-023 (mnemocode reviewer): Chromium probes of the MnemoCode panels of the built Deriver
// (dist/, read-only). Public test phrases only; every HTTP(S) request is aborted and counted.
//
//   late-card-qr      a card export that completes after the source phrase changed puts the QR
//                     images of the old phrase back (expected: none after the change)
//   late-card-qr-shares  the same for share cards when a new split replaces the shares meanwhile
//   clear-linked      observation: what Generate & Derive's Clear leaves in the panel when its
//                     phrase was linked there (no expectation)
//   handover-replace  a share handed from Decode to Restore replaces the shares already typed there
//   decode-dates      what Decode says for a date with ? (MnemoCode's decode searches it)
//   word-shown        how many candidates a one-word search shows by default
//   count-bounds      the page's refusals of address counts, and what it accepts
//   dash-edition      the wallet choices of the Dash Community edition
//   layout            the panels with the new fields at 1280 and 390 pixels: no horizontal overflow
//
// Usage: node docs/audits/AUD-023-harnesses/mnemocode-browser.mjs [probe,...]
// Writes mnemocode-browser-report.json and mnemocode-layout-*.png to the evidence folder; exits 1
// when a probe's expectation fails (each failure is listed in the report).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild } from "../../../tooling/build-profiles.mjs";

const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(root, "docs/audits/AUD-023-evidence");
// The page's words when an export finishes after its inputs changed (recovery-mnemocode-cards.ts).
const STALE_EXPORT =
  "The phrase or the shares changed while the cards were drawn, so nothing was saved. Press Save cards again.";
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const wanted = (process.argv[2] ?? "").split(",").filter(Boolean);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const report = { browser: browser.version(), artifacts: {}, probes: [] };
let failed = 0;

async function open(profileId) {
  const context = await browser.newContext({ acceptDownloads: true });
  const requests = [];
  await context.route(/^https?:\/\//u, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const file = resolve(
    root,
    "dist",
    getToolBuild(BUILD_PROFILES[profileId], "key-derivation").artifactRelativePath,
  );
  report.artifacts[file] = createHash("sha256").update(readFileSync(file)).digest("hex");
  await page.goto(pathToFileURL(file).href);
  await page.locator("#crypto-self-test-status.passed").waitFor();
  await page.locator("#recovery-backup-mode").click();
  await page.locator('[data-recovery-tab][aria-controls="mnemocode-panel"]').click();
  return { context, page, requests, errors };
}
const tab = (page, name) =>
  page.locator(`[data-operation-tab][aria-controls="mnemocode-${name}-panel"]`).click();

async function probe(name, run) {
  if (wanted.length > 0 && !wanted.includes(name)) return;
  const entry = { name, facts: {}, failures: [] };
  report.probes.push(entry);
  const expect = (condition, message) => {
    if (!condition) entry.failures.push(message);
  };
  try {
    await run(entry.facts, expect);
  } catch (error) {
    entry.failures.push(`error: ${String(error.stack ?? error)}`);
  }
  failed += entry.failures.length;
  console.log(
    `${name}: ${entry.failures.length === 0 ? "as expected" : entry.failures.join(" | ")}`,
  );
}

async function splitShares(page, form = "words") {
  await tab(page, "create");
  await page.locator("#mnemocode-source").fill(PHRASE);
  const section = page.locator("#mnemocode-split-section");
  if ((await section.getAttribute("open")) === null) await section.locator("> summary").click();
  await page.locator("#mnemocode-split-form").selectOption(form);
  await page.locator("#mnemocode-split").click();
  await page.locator("#mnemocode-split-result .share-secret").first().waitFor();
  return page.locator("#mnemocode-split-result .share-secret").allTextContents();
}

await probe("late-card-qr", async (facts, expect) => {
  const { context, page, requests, errors } = await open("multi-chain");
  await tab(page, "create");
  await page.locator("#mnemocode-source").fill(PHRASE);
  await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#mnemocode-cards-section > summary").click();
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await page.locator("#mnemocode-card-qr").check();
  // A PNG sheet: the page draws the PDF on a canvas, which takes long enough to type meanwhile.
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  // Time stamps in the page: each input of the source field, and when the status says Saved.
  await page.evaluate(() => {
    const marks = (window.__aud023 = { inputs: [], saved: undefined, rendering: undefined });
    document.querySelector("#mnemocode-source").addEventListener("input", () => {
      marks.inputs.push(performance.now());
    });
    const status = document.querySelector("#mnemocode-cards-status");
    new MutationObserver(() => {
      if (status.textContent.startsWith("Rendering")) marks.rendering ??= performance.now();
      if (status.textContent.startsWith("Saved")) marks.saved ??= performance.now();
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
  // A normal export first, for the payload of the old phrase's QR code.
  const first = page.waitForEvent("download");
  await page.locator("#export-mnemocode-cards").click();
  await first;
  await page
    .locator("#mnemocode-cards-status")
    .filter({ hasText: /^Saved/u })
    .waitFor();
  facts.qrButtonsAfterNormalExport = await page
    .locator("#mnemocode-cards-qr-images button.qr-trigger")
    .count();
  // The payload node exists once the QR popover was opened.
  await page.locator("#mnemocode-cards-qr-images button.qr-trigger").first().click();
  const oldPayload = await page
    .locator("#mnemocode-cards-qr-images .payment-qr-payload")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));
  await page.keyboard.press("Escape");
  // Typing in the source removes them, as the page promises.
  await page.locator("#mnemocode-source").fill(PHRASE);
  facts.qrButtonsAfterEdit = await page
    .locator("#mnemocode-cards-qr-images button.qr-trigger")
    .count();
  expect(facts.qrButtonsAfterEdit === 0, "an edit did not remove the QR images");
  // The race: Save cards, then another phrase while the cards are drawn.
  await page.evaluate(() => {
    window.__aud023.inputs = [];
    window.__aud023.saved = undefined;
    window.__aud023.rendering = undefined;
  });
  // Since the AUD-023 remediation (AUD-023-SEC002) a late export saves nothing and says so, so the
  // probe waits for either outcome instead of a download alone.
  const download = page.waitForEvent("download").then(
    () => "saved",
    () => "none",
  );
  // In the page, so that the order is exact: the click; the page reads its inputs after one
  // animation frame and a zero timeout (nextFrame); two zero timeouts later, while the cards are
  // drawn (pdf-lib yields to timers while it saves), the person types another phrase.
  facts.statusAtEdit = await page.evaluate(
    (other) =>
      new Promise((done) => {
        document.querySelector("#export-mnemocode-cards").click();
        requestAnimationFrame(() =>
          setTimeout(
            () =>
              setTimeout(() => {
                const source = document.querySelector("#mnemocode-source");
                source.value = other;
                source.dispatchEvent(new Event("input", { bubbles: true }));
                done(document.querySelector("#mnemocode-cards-status").textContent);
              }, 0),
            0,
          ),
        );
      }),
    OTHER,
  );
  facts.lateExport = await Promise.race([
    download,
    page
      .locator("#mnemocode-cards-status")
      .filter({ hasText: STALE_EXPORT })
      .waitFor()
      .then(() => "nothing saved"),
  ]);
  if (facts.lateExport === "saved")
    await page
      .locator("#mnemocode-cards-status")
      .filter({ hasText: /^Saved/u })
      .waitFor();
  const marks = await page.evaluate(() => window.__aud023);
  facts.editBeforeSaved = marks.inputs.length > 0 && marks.inputs[0] < marks.saved;
  facts.millisecondsFromEditToSaved = Math.round(marks.saved - marks.inputs[0]);
  facts.sourceNow =
    (await page.locator("#mnemocode-source").inputValue()) === OTHER ? "OTHER" : "?";
  facts.qrButtonsAfterLateCompletion = await page
    .locator("#mnemocode-cards-qr-images button.qr-trigger")
    .count();
  facts.qrImagesHidden = await page.locator("#mnemocode-cards-qr-images").isHidden();
  // Open the QR to read its payload; compare with the old phrase's.
  if (facts.qrButtonsAfterLateCompletion > 0) {
    await page.locator("#mnemocode-cards-qr-images button.qr-trigger").first().click();
    const latePayload = await page
      .locator("#mnemocode-cards-qr-images .payment-qr-payload")
      .first()
      .textContent();
    facts.latePayloadIsOldPhrase = oldPayload.length > 0 && latePayload === oldPayload[0];
    facts.latePayloadPrefix = latePayload?.slice(0, 8);
  }
  facts.requests = requests.length;
  facts.pageErrors = errors;
  expect(
    !(facts.editBeforeSaved && facts.qrButtonsAfterLateCompletion > 0),
    "QR images of the old phrase were put back after the source changed (late completion)",
  );
  expect(
    facts.lateExport !== "nothing saved" || facts.qrButtonsAfterLateCompletion === 0,
    "a late export that saved nothing still shows QR images",
  );
  await context.close();
});

await probe("late-card-qr-shares", async (facts, expect) => {
  const { context, page, requests, errors } = await open("multi-chain");
  const oldShares = await splitShares(page, "colors");
  const cards = page.locator("#mnemocode-cards-section");
  if ((await cards.getAttribute("open")) === null) await cards.locator("> summary").click();
  await page.locator("#mnemocode-card-source-shares").check();
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await page.locator("#mnemocode-card-qr").check();
  await page.locator("#mnemocode-card-file-format").selectOption("png");
  const download = page.waitForEvent("download").then(
    () => "saved",
    () => "none",
  );
  // Save cards; while they are drawn, the person splits again (new shares replace the old ones).
  facts.statusAtSplit = await page.evaluate(
    () =>
      new Promise((done) => {
        document.querySelector("#export-mnemocode-cards").click();
        requestAnimationFrame(() =>
          setTimeout(
            () =>
              setTimeout(() => {
                document.querySelector("#mnemocode-split").click();
                done(document.querySelector("#mnemocode-cards-status").textContent);
              }, 0),
            0,
          ),
        );
      }),
  );
  // The section hides while the new split runs, so its status is read without needing it shown.
  // Since the remediation a late export saves nothing and says so (STALE_EXPORT).
  await page.waitForFunction(
    (stale) => {
      const status = document.querySelector("#mnemocode-cards-status").textContent;
      return status.startsWith("Saved") || status === stale;
    },
    STALE_EXPORT,
  );
  facts.lateExport = (await page.locator("#mnemocode-cards-status").textContent()).startsWith(
    "Saved",
  )
    ? await download
    : "nothing saved";
  await page.locator("#mnemocode-split-result .share-secret").first().waitFor();
  const newShares = await page.locator("#mnemocode-split-result .share-secret").allTextContents();
  facts.newSplitDiffers = JSON.stringify(newShares) !== JSON.stringify(oldShares);
  facts.qrButtonsAfterLateCompletion = await page
    .locator("#mnemocode-cards-qr-images button.qr-trigger")
    .count();
  facts.qrLabels = await page
    .locator("#mnemocode-cards-qr-images button.qr-trigger")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  // The new split closed the section while it ran; it is opened again to read the codes.
  if ((await cards.getAttribute("open")) === null) await cards.locator("> summary").click();
  facts.qrImagesHidden = await page.locator("#mnemocode-cards-qr-images").isHidden();
  const payloads = [];
  for (let index = 0; index < facts.qrButtonsAfterLateCompletion; index += 1) {
    await page.locator("#mnemocode-cards-qr-images button.qr-trigger").nth(index).click();
    payloads.push(
      await page.locator("#mnemocode-cards-qr-images .payment-qr-payload").nth(index).textContent(),
    );
    await page.keyboard.press("Escape");
  }
  const normalize = (text) => (text ?? "").trim().split(/\s+/u).join(" ");
  facts.payloadsAreOldShares = payloads.map((payload) =>
    oldShares.some((share) => normalize(share) === normalize(payload)),
  );
  facts.payloadsAreNewShares = payloads.map((payload) =>
    newShares.some((share) => normalize(share) === normalize(payload)),
  );
  facts.cardsStatus = await page.locator("#mnemocode-cards-status").innerText();
  facts.requests = requests.length;
  facts.pageErrors = errors;
  expect(
    !facts.payloadsAreOldShares.some(Boolean),
    "QR images of the shares of the replaced split were put back after the new split",
  );
  await context.close();
});

await probe("clear-linked", async (facts) => {
  // Observation only: what Generate & Derive's Clear leaves in the MnemoCode panel when its phrase
  // was linked there.
  const { context, page } = await open("multi-chain");
  await page.locator("#derive-generate-mode").click();
  await page.locator("#mnemonic").fill(PHRASE);
  await page.locator("#main-recovery-source-menu summary").click();
  await page.locator('#main-recovery-source-menu [data-recovery-target="mnemocode"]').click();
  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator("#mnemocode-encode-mode").selectOption("direct");
  await page.locator("#mnemocode-encode-format").selectOption("colors");
  await page.locator("#encode-mnemocode").click();
  await page.locator("#mnemocode-encode-result article .share-secret").first().waitFor();
  await page.locator("#mnemocode-cards-section > summary").click();
  await page.locator("#mnemocode-card-page-size").selectOption("a6");
  await page.locator("#mnemocode-card-qr").check();
  const download = page.waitForEvent("download");
  await page.locator("#export-mnemocode-cards").click();
  await download;
  await page
    .locator("#mnemocode-cards-status")
    .filter({ hasText: /^Saved/u })
    .waitFor();
  await page.locator("#derive-generate-mode").click();
  await page.locator("#clear-all").click();
  await page.locator("#recovery-backup-mode").click();
  facts.mainMnemonicAfterClear = await page.locator("#mnemonic").inputValue();
  facts.encodeRecordsAfterClear = await page.locator("#mnemocode-encode-result article").count();
  facts.cardQrButtonsAfterClear = await page
    .locator("#mnemocode-cards-qr-images button.qr-trigger")
    .count();
  facts.linkedCardAfterClear = await page
    .locator("#mnemocode-panel .linked-recovery-source")
    .count();
  await context.close();
});

await probe("handover-replace", async (facts, expect) => {
  const { context, page } = await open("multi-chain");
  const shares = await splitShares(page);
  await tab(page, "restore");
  await page.locator("#mnemocode-restore-shares").fill(`${shares[1]}\n${shares[2]}`);
  await tab(page, "decode");
  await page.locator("#mnemocode-input").fill(shares[0]);
  await page.locator("#decode-mnemocode").click();
  await page
    .locator("#mnemocode-restore-status")
    .filter({ hasText: /first share here/u })
    .waitFor();
  const restore = await page.locator("#mnemocode-restore-shares").inputValue();
  facts.restoreLines = restore.split("\n").filter(Boolean).length;
  facts.restoreHoldsTypedShares = restore.includes(shares[1]) && restore.includes(shares[2]);
  facts.decodeNote = await page.locator("#mnemocode-decode-result").innerText();
  expect(
    facts.restoreHoldsTypedShares,
    "the shares typed in Restore were replaced by the handed-over share",
  );
  await context.close();
});

await probe("decode-dates", async (facts) => {
  const { context, page } = await open("multi-chain");
  await tab(page, "create");
  await page.locator("#mnemocode-source").fill(PHRASE);
  await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-encode-format").selectOption("english");
  await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
  await page.locator("#encode-mnemocode").click();
  const record = await page
    .locator("#mnemocode-encode-result article .share-secret")
    .first()
    .textContent();
  await tab(page, "decode");
  await page.locator("#mnemocode-decode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-input").fill(record ?? "");
  await page.locator("#mnemocode-decode-dates").fill("2?-09-2026");
  await page.locator("#decode-mnemocode").click();
  facts.decodeMessage = await page.locator("#mnemocode-decode-result").innerText();
  facts.decodeDatesPlaceholder = await page
    .locator("#mnemocode-decode-dates")
    .getAttribute("placeholder");
  await context.close();
});

await probe("word-shown", async (facts, expect) => {
  const { context, page } = await open("multi-chain");
  await tab(page, "forgotten");
  await page.locator("#mnemocode-forgotten-phrase").fill(PHRASE.replace(/about$/u, "?"));
  await page.locator("#mnemocode-forgotten-wallet-none").check();
  facts.maxResultsDefault = await page.locator("#mnemocode-forgotten-max-results").inputValue();
  await page.locator("#mnemocode-forgotten-search").click();
  await page
    .locator("#mnemocode-forgotten-status")
    .filter({ hasText: /Search complete/u })
    .waitFor();
  facts.rows = await page.locator("#mnemocode-forgotten-result tbody tr").count();
  facts.summary = await page
    .locator("#mnemocode-forgotten-result")
    .evaluate((node) => [...node.querySelectorAll("p")].map((p) => p.textContent).join(" | "));
  expect(facts.rows === 128, `a one-word search shows ${facts.rows} of 128 candidates by default`);
  await context.close();
});

await probe("count-bounds", async (facts) => {
  const { context, page } = await open("multi-chain");
  await tab(page, "forgotten");
  await page.locator("#mnemocode-forgotten-phrase").fill(PHRASE.replace(/about$/u, "?"));
  await page.locator("#mnemocode-forgotten-wallet-coin-choice").check();
  await page.locator("#mnemocode-forgotten-wallet-coin").selectOption("dash");
  await page
    .locator("#mnemocode-forgotten-wallet-coin-address")
    .fill("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5");
  facts.results = {};
  for (const typed of ["0", "-1", "1.5", "1001", "", "0x10", "1e3"]) {
    await page.locator("#mnemocode-forgotten-wallet-addresses").fill(typed);
    // A number input reports "" for text it cannot read; record what the page read.
    const value = await page.locator("#mnemocode-forgotten-wallet-addresses").inputValue();
    await page.locator("#mnemocode-forgotten-search").click();
    await page.locator("#mnemocode-forgotten-status").filter({ hasText: /\S/u }).waitFor();
    await page.waitForFunction(
      () =>
        !/^Starting|^Searching/u.test(
          document.querySelector("#mnemocode-forgotten-status").textContent,
        ),
      undefined,
      { timeout: 60_000 },
    );
    facts.results[JSON.stringify(typed)] = {
      value,
      status: await page.locator("#mnemocode-forgotten-status").innerText(),
    };
  }
  await context.close();
});

await probe("dash-edition", async (facts, expect) => {
  const { context, page } = await open("dash-community");
  for (const prefix of ["mnemocode-forgotten", "mnemocode-restore", "mnemocode-forgotten-shares"]) {
    const choices = await page
      .locator(`input[name="${prefix}-wallet"]`)
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    facts[prefix] = choices;
    expect(
      JSON.stringify(choices) === JSON.stringify(["fingerprint", "coin", "none"]),
      `${prefix} offers ${choices.join(",")}`,
    );
  }
  await tab(page, "forgotten");
  await page.locator("#mnemocode-forgotten-wallet-coin-choice").check();
  facts.coinLabel = await page.locator("#mnemocode-forgotten-wallet-coin-label").innerText();
  facts.coinNote = await page.locator("#mnemocode-forgotten-wallet-coin-note").innerText();
  facts.coinOptions = await page
    .locator("#mnemocode-forgotten-wallet-coin option")
    .evaluateAll((options) => options.map((option) => option.value));
  expect(JSON.stringify(facts.coinOptions) === '["dash"]', "the Dash edition offers another coin");
  await context.close();
});

await probe("layout", async (facts, expect) => {
  facts.layouts = [];
  for (const profileId of ["multi-chain", "dash-community"]) {
    const { context, page } = await open(profileId);
    for (const [width, height] of [
      [1280, 900],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      const views = [
        [
          "forgotten-coin",
          async () => {
            await tab(page, "forgotten");
            await page.locator("#mnemocode-forgotten-kind-word").check();
            await page.locator("#mnemocode-forgotten-wallet-coin-choice").check();
            return "#mnemocode-forgotten-wallet-coin-field";
          },
        ],
        [
          "forgotten-key",
          async () => {
            await tab(page, "forgotten");
            if ((await page.locator("#mnemocode-forgotten-wallet-key-choice").count()) === 0)
              return undefined;
            await page.locator("#mnemocode-forgotten-wallet-key-choice").check();
            await page
              .locator("#mnemocode-forgotten-wallet-key-kind")
              .selectOption("compressed-public-key");
            return "#mnemocode-forgotten-wallet-location-field";
          },
        ],
        [
          "forgotten-max-results",
          async () => {
            await tab(page, "forgotten");
            // Shown only for a date search since the remediation (AUD-023-FUN001).
            await page.locator("#mnemocode-forgotten-kind-date").check();
            return "#mnemocode-forgotten-max-results";
          },
        ],
        [
          "decode-input-kind",
          async () => {
            await tab(page, "decode");
            await page.evaluate(() => {
              document.querySelector("#mnemocode-decode-input-kind").hidden = false;
            });
            return "#mnemocode-decode-input-kind";
          },
        ],
        [
          "restore-wallet",
          async () => {
            await tab(page, "restore");
            await page.locator("#mnemocode-restore-wallet-coin-choice").check();
            return "#mnemocode-restore-wallet-coin-field";
          },
        ],
        [
          "cards-shares",
          async () => {
            await splitShares(page, "colors");
            const cards = page.locator("#mnemocode-cards-section");
            if ((await cards.getAttribute("open")) === null)
              await cards.locator("> summary").click();
            await page.locator("#mnemocode-card-source-shares").check();
            return "#mnemocode-card-share-qr-row";
          },
        ],
      ];
      for (const [view, prepare] of views) {
        let target;
        try {
          target = await prepare();
          if (target === undefined) continue;
          await page.locator(target).scrollIntoViewIfNeeded({ timeout: 5_000 });
        } catch (error) {
          expect(false, `${profileId} ${view} ${width}: ${String(error).split("\n")[0]}`);
          continue;
        }
        const measured = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          // Every visible control of the MnemoCode panel must fit inside the viewport's width.
          const outside = [
            ...document.querySelectorAll(
              "#mnemocode-panel input, #mnemocode-panel select, #mnemocode-panel button, #mnemocode-panel textarea, #mnemocode-panel label",
            ),
          ]
            .filter((node) => node.getClientRects().length > 0)
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return rect.left < -1 || rect.right > innerWidth + 1;
            })
            .map(
              (node) => node.id || node.getAttribute("for") || node.textContent.trim().slice(0, 30),
            );
          return {
            contentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
            target: {
              left: Math.round(box.left),
              right: Math.round(box.right),
              visible: box.width > 0,
            },
            outside,
          };
        }, target);
        const screenshot = `mnemocode-layout-${profileId}-${view}-${width}.png`;
        await page.screenshot({ path: resolve(evidence, screenshot) });
        facts.layouts.push({ profileId, view, width, ...measured, screenshot });
        expect(measured.contentWidth <= width + 1, `${profileId} ${view} ${width}: page overflows`);
        expect(
          measured.outside.length === 0,
          `${profileId} ${view} ${width}: outside ${measured.outside.join(",")}`,
        );
        expect(measured.target.visible, `${profileId} ${view} ${width}: ${target} not visible`);
      }
    }
    await context.close();
  }
});

await browser.close();
writeFileSync(
  resolve(evidence, "mnemocode-browser-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(`probes: ${report.probes.length}, failed expectations: ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
