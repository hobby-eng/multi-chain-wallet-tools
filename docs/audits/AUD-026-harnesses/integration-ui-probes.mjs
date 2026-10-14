// AUD-026 integration reviewer: short Playwright probes of the built Deriver (dist/, both editions)
// over file:// with normal browser security, in the pinned Chromium and Firefox. CHECK-UI-001..003
// for the new controls (Generate & Derive's chosen-word panel and MHFE wallet check, MHFE New
// wallet's chosen-word fields, word hints and draw outlook) at widths 1280, 800 and 390, and one
// CHECK-API-002 probe: a derivation setting changed while the MHFE wallet check draws a phrase.
//
// Usage: node docs/audits/AUD-026-harnesses/integration-ui-probes.mjs [layout|draw] [engines]
//   layout  the viewport/visibility probes (default); draw  the draw-and-change probe
//   engines a comma list, default "chromium,firefox"
// Writes JSON and screenshots under docs/audits/AUD-026-evidence/integration/; exits 1 when a
// check fails. Public test data only: Trezor's "TREZOR" passphrase and BIP39 words; no network.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild } from "../../../tooling/build-profiles.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = resolve(root, "docs/audits/AUD-026-evidence/integration");
mkdirSync(out, { recursive: true });
const [mode = "layout", engineList = "chromium,firefox"] = process.argv.slice(2);
const { chromium, firefox } = await loadPlaywright();
const WIDTHS = [1280, 800, 390];
const report = { mode, runs: [], failures: [] };

const artifact = (profile) =>
  resolve(root, "dist", getToolBuild(profile, "key-derivation").artifactRelativePath);

async function open(browser, profile, width, init) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  if (init !== undefined) await context.addInitScript(init);
  const requests = [];
  context.on("request", (request) => {
    if (!/^(file|blob|data):/u.test(request.url())) requests.push(request.url());
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(pathToFileURL(artifact(profile)).href);
  await page.locator("#crypto-self-test-status.passed").waitFor({ timeout: 120000 });
  return { context, page, errors, requests };
}

/** Horizontal overflow of the page and of the given elements, in CSS pixels. */
async function overflow(page, selectors) {
  return page.evaluate((list) => {
    const width = document.documentElement.clientWidth;
    const result = { page: document.documentElement.scrollWidth - width, elements: {} };
    for (const selector of list) {
      for (const [index, element] of [...document.querySelectorAll(selector)].entries()) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (box.right > width + 0.5 || box.left < -0.5)
          result.elements[`${selector}#${index}`] = {
            left: Math.round(box.left),
            right: Math.round(box.right),
            width,
          };
      }
    }
    return result;
  }, selectors);
}

/** Boxes of one chosen-word row: select, input and Clear must not overlap or leave the row. */
async function rowLayout(page, rowSelector) {
  return page.locator(rowSelector).evaluate((row) => {
    // A hidden hint has no box: only the children shown are measured.
    const boxes = [...row.children]
      .map((child) => child.getBoundingClientRect())
      .filter((box) => box.width > 0 || box.height > 0);
    const overlaps = [];
    for (let a = 0; a < boxes.length; a += 1)
      for (let b = a + 1; b < boxes.length; b += 1) {
        const x = Math.min(boxes[a].right, boxes[b].right) - Math.max(boxes[a].left, boxes[b].left);
        const y = Math.min(boxes[a].bottom, boxes[b].bottom) - Math.max(boxes[a].top, boxes[b].top);
        if (x > 1 && y > 1) overlaps.push([a, b]);
      }
    const rowBox = row.getBoundingClientRect();
    return {
      widths: boxes.map((box) => Math.round(box.width)),
      heights: boxes.map((box) => Math.round(box.height)),
      overlaps,
      outside: boxes.some((box) => box.right > rowBox.right + 1 || box.left < rowBox.left - 1),
    };
  });
}

/**
 * Every shown warning note: its width and the width its text actually takes. A text squeezed into
 * a narrow column of a wide box reads one word per line.
 */
async function warningNotes(page, rootSelector) {
  return page.evaluate((root) => {
    const notes = [];
    const selector = root
      .split(",")
      .map((part) => `${part.trim()} .warning`)
      .join(", ");
    for (const element of document.querySelectorAll(selector)) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || element.textContent.trim() === "") continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const style = getComputedStyle(element);
      notes.push({
        id: element.id || element.className,
        display: style.display,
        columns: style.gridTemplateColumns,
        boxWidth: Math.round(box.width),
        textWidth: Math.round(text.width),
        lines: Math.round(text.height / parseFloat(style.lineHeight || "18")),
        words: element.textContent.trim().split(/\s+/u).length,
      });
    }
    return notes;
  }, rootSelector);
}

/** Notes whose text uses less than half of their box while they hold more than one line. */
const squeezed = (notes) =>
  notes.filter((note) => note.lines > 1 && note.textWidth < note.boxWidth / 2);

async function check(run, name, condition, detail) {
  run.checks.push({ name, passed: condition, ...(detail === undefined ? {} : { detail }) });
  if (!condition) report.failures.push(`${run.browser}/${run.profile}/${run.width}: ${name}`);
}

/** One page per edition, resized to each width in turn, to keep memory low. */
async function layoutProbes(browser, browserName, profile) {
  const opened = await open(browser, profile, WIDTHS[0]);
  try {
    for (const width of WIDTHS) {
      await opened.page.setViewportSize({ width, height: 900 });
      await layoutProbe(opened, browserName, profile, width);
    }
  } finally {
    await opened.context.close();
  }
}

async function layoutProbe({ page, errors, requests }, browserName, profile, width) {
  const run = { browser: browserName, profile: profile.id, width, checks: [] };
  report.runs.push(run);
  try {
    await page.locator("#derive-generate-mode").click();
    // Generate & Derive: both generation modes, with words typed while concealed.
    await page.locator("#chosen-words-enabled").check();
    await page.locator("#wallet-check-enabled").check();
    await page.locator("#wallet-check-options").waitFor();
    await page.waitForFunction(
      () => !document.querySelector("#wallet-check-options").inert,
      undefined,
      { timeout: 60000 },
    );
    await page.locator("#chosen-word-1").fill("zoo");
    await page.locator("#chosen-words-never").fill("abandon");
    await page.waitForFunction(() => {
      const outlook = document.querySelector("#wallet-check-outlook");
      return !outlook.hidden && /random bits/u.test(outlook.textContent);
    });
    const gdNotes = await warningNotes(page, "#wallet-check-generation, #chosen-words-panel");
    await check(run, "G&D warning notes use their width", squeezed(gdNotes).length === 0, gdNotes);
    const types = await page.evaluate(() => ({
      word: document.querySelector("#chosen-word-1").type,
      never: document.querySelector("#chosen-words-never").type,
      repeat: document.querySelector("#wallet-check-passphrase-repeat").type,
    }));
    await check(
      run,
      "G&D chosen word and never-use concealed before Show phrase",
      types.word === "password" && types.never === "password",
      types,
    );
    await check(
      run,
      "G&D wallet-check confirmation is a password field",
      types.repeat === "password",
    );
    const gdOverflow = await overflow(page, [
      "#wallet-check-generation",
      "#wallet-check-options *",
      "#chosen-words-panel",
      "#chosen-words-panel *",
      ".generate-actions button",
    ]);
    await check(
      run,
      "G&D no horizontal overflow",
      gdOverflow.page <= 0 && Object.keys(gdOverflow.elements).length === 0,
      gdOverflow,
    );
    const gdRow = await rowLayout(page, "#chosen-word-1-row");
    await check(
      run,
      "G&D chosen-word row: no overlap, inside the row, input at least 100 px",
      gdRow.overlaps.length === 0 && !gdRow.outside && gdRow.widths[1] >= 100,
      gdRow,
    );
    await page.locator("#wallet-check-generation").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(out, `ui-${browserName}-${profile.id}-${width}-gd.png`),
      fullPage: false,
    });
    await page.locator("#chosen-words-panel").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(out, `ui-${browserName}-${profile.id}-${width}-gd-chosen.png`),
      fullPage: false,
    });
    // Show phrase reveals the chosen words with the phrase; Hide conceals them again.
    await page.locator("#toggle-sensitive-values").click();
    const shown = await page.locator("#chosen-word-1").getAttribute("type");
    await page.locator("#toggle-sensitive-values").click();
    const hidden = await page.locator("#chosen-word-1").getAttribute("type");
    await check(
      run,
      "G&D Show phrase reveals and Hide conceals the chosen word",
      shown === "text" && hidden === "password",
      { shown, hidden },
    );
    // Clear all empties the words and the mode.
    await page.locator("#clear-all").click();
    const cleared = await page.evaluate(() => ({
      word: document.querySelector("#chosen-word-1").value,
      never: document.querySelector("#chosen-words-never").value,
      checked: document.querySelector("#wallet-check-enabled").checked,
    }));
    await check(
      run,
      "G&D Clear all empties chosen words and unticks the wallet check",
      cleared.word === "" && cleared.never === "" && !cleared.checked,
      cleared,
    );

    // MHFE New wallet: chosen-word fields, hints and outlook.
    await page.locator("#recovery-backup-mode").click();
    await page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]').click();
    await page.waitForFunction(() => !document.getElementById("mhfe-panel").inert, undefined, {
      timeout: 60000,
    });
    await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-new-panel"]').click();
    await page.locator("#mhfe-new-words-chosen").check();
    await page.locator("#mhfe-new-chosen-word-1").waitFor();
    const mhfeType = await page.locator("#mhfe-new-chosen-word-1").getAttribute("type");
    await check(run, "MHFE chosen word concealed by default", mhfeType === "password");
    await page.locator("#mhfe-new-chosen-word-1").fill("ab");
    await page.waitForTimeout(500);
    const concealedHint = await page.locator("#mhfe-new-wishes .word-hint").first().isVisible();
    await check(run, "MHFE no word hint while the word is concealed", !concealedHint);
    await page.locator("#toggle-mhfe-new-chosen-words").click();
    await page.locator("#mhfe-new-chosen-word-1").fill("ab");
    await page.waitForFunction(() => {
      const hint = document.querySelector("#mhfe-new-wishes .word-hint");
      return hint !== null && !hint.hidden && hint.textContent.length > 0;
    });
    const hintText = await page.locator("#mhfe-new-wishes .word-hint").first().innerText();
    await check(run, "MHFE word hint shown after Show", /abandon/u.test(hintText), hintText);
    const hintRow = await rowLayout(page, "#mhfe-new-chosen-word-1-row");
    await check(
      run,
      "MHFE row with a hint shown: no overlap, inside the row",
      hintRow.overlaps.length === 0 && !hintRow.outside,
      hintRow,
    );
    await page.locator("#mhfe-new-wishes").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(out, `ui-${browserName}-${profile.id}-${width}-mhfe-hint.png`),
      fullPage: false,
    });
    // A word no BIP39 word begins like: the hint is a warning.
    await page.locator("#mhfe-new-chosen-word-1").fill("qx");
    await page.waitForFunction(() =>
      /No BIP39 word/u.test(document.querySelector("#mhfe-new-wishes .word-hint").textContent),
    );
    const hintNotes = await warningNotes(page, "#mhfe-new-wishes");
    await check(
      run,
      "MHFE warning hint uses its width",
      squeezed(hintNotes).length === 0,
      hintNotes,
    );
    await page.locator("#mhfe-new-chosen-word-1").fill("zoo");
    await page.locator("#mhfe-new-passphrase").fill("TREZOR");
    await page.locator("#mhfe-new-check-wallet").check();
    await page.waitForFunction(() =>
      /Not recommended/u.test(document.querySelector("#mhfe-new-outlook").textContent),
    );
    const mhfeNotes = await warningNotes(page, "#mhfe-new-panel");
    await check(
      run,
      "MHFE New wallet warning notes use their width",
      squeezed(mhfeNotes).length === 0,
      mhfeNotes,
    );
    const mhfeOverflow = await overflow(page, ["#mhfe-new-panel", "#mhfe-new-panel *"]);
    await check(
      run,
      "MHFE New wallet no horizontal overflow",
      mhfeOverflow.page <= 0 && Object.keys(mhfeOverflow.elements).length === 0,
      mhfeOverflow,
    );
    const mhfeRow = await rowLayout(page, "#mhfe-new-chosen-word-1-row");
    await check(
      run,
      "MHFE chosen-word row: no overlap, inside the row, input at least 100 px",
      mhfeRow.overlaps.length === 0 && !mhfeRow.outside && mhfeRow.widths[1] >= 100,
      mhfeRow,
    );
    await page.locator("#mhfe-new-wishes").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(out, `ui-${browserName}-${profile.id}-${width}-mhfe-new.png`),
      fullPage: false,
    });
    // A hint while typing, then Hide: the hint goes with the shown text.
    await page.locator("#mhfe-new-chosen-word-1").fill("zo");
    await page.waitForFunction(() => !document.querySelector("#mhfe-new-wishes .word-hint").hidden);
    await page.locator("#toggle-mhfe-new-chosen-words").click();
    await page.waitForTimeout(300);
    const hintAfterHide = await page.locator("#mhfe-new-wishes .word-hint").first().isVisible();
    await check(run, "MHFE Hide removes a shown word hint", !hintAfterHide);
    // A refused Encrypt (nothing typed): the tab's status line is a warning.
    await page
      .locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-create-panel"]')
      .click();
    await page.locator("#mhfe-encrypt").click();
    await page.waitForFunction(() =>
      document.querySelector("#mhfe-encrypt-status").classList.contains("warning"),
    );
    const statusNotes = await warningNotes(page, "#mhfe-create-panel");
    await check(
      run,
      "MHFE status warning uses its width",
      squeezed(statusNotes).length === 0,
      statusNotes,
    );
    await page.locator("#mhfe-encrypt-status").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(out, `ui-${browserName}-${profile.id}-${width}-mhfe-status.png`),
      fullPage: false,
    });
    await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-new-panel"]').click();
    // Back to Generate & Derive: one visible panel, the phrase field there.
    await page.locator("#derive-generate-mode").click();
    const back = await page.locator("#mnemonic").isVisible();
    await check(run, "Return path from Recovery & backup to Generate & Derive", back);
    await check(run, "no page errors", errors.length === 0, [...errors]);
    await check(run, "no HTTP requests", requests.length === 0, [...requests]);
  } catch (error) {
    await check(run, "probe completed", false, String(error));
  }
}

/**
 * The MHFE wallet check draws a phrase with real randomness (about 65,536 draws); the result count
 * of the derivation, a setting of the derivation rather than of the phrase, is changed meanwhile.
 */
async function drawProbe(browser, browserName, profile) {
  const run = { browser: browserName, profile: profile.id, width: 1280, checks: [] };
  report.runs.push(run);
  const { context, page, errors, requests } = await open(browser, profile, 1280);
  try {
    await page.locator("#wallet-check-enabled").check();
    await page.waitForFunction(
      () => !document.querySelector("#wallet-check-options").inert,
      undefined,
      { timeout: 60000 },
    );
    await page.locator("#passphrase").fill("TREZOR");
    await page.locator("#wallet-check-passphrase-repeat").fill("TREZOR");
    await page.locator("#generate-24").click();
    await page.locator("#wallet-check-cancel").waitFor({ state: "visible" });
    await page.waitForFunction(
      () => /tried/u.test(document.querySelector("#status").textContent),
      undefined,
      { timeout: 30000 },
    );
    const before = await page.locator("#status").innerText();
    const started = Date.now();
    await page.locator("#count").fill("7");
    await page.waitForTimeout(1500);
    const afterChange = {
      status: await page.locator("#status").innerText(),
      cancelVisible: await page.locator("#wallet-check-cancel").isVisible(),
    };
    await page.waitForTimeout(1500);
    const statusLater = await page.locator("#status").innerText();
    await page.locator("#wallet-check-cancel").waitFor({ state: "hidden", timeout: 300000 });
    const ended = Date.now();
    await page.waitForTimeout(1000);
    const finalState = await page.evaluate(() => ({
      phraseWords: document.querySelector("#mnemonic").value.trim().split(/\s+/u).filter(Boolean)
        .length,
      status: document.querySelector("#status").hidden
        ? ""
        : document.querySelector("#status").textContent,
      error: document.querySelector("#error").hidden
        ? ""
        : document.querySelector("#error").textContent,
    }));
    run.observed = {
      before,
      afterChange,
      statusLater,
      drawEndedAfterChangeMs: ended - started,
      finalState,
    };
    // Expected: the draw ends at once with a word about it, or the drawn phrase is shown; never a
    // draw that runs on and is then dropped without a word.
    const droppedSilently =
      finalState.phraseWords === 0 && finalState.error === "" && /tried/u.test(finalState.status);
    await check(
      run,
      "a draw is not run to its end and then dropped without a word",
      !droppedSilently,
      run.observed,
    );
    await check(run, "no page errors", errors.length === 0, errors);
    await check(run, "no HTTP requests", requests.length === 0, requests);
  } catch (error) {
    await check(run, "probe completed", false, String(error));
  } finally {
    await context.close();
  }
}

/**
 * Workers that MHFE starts while a person types: each describeDraw() and wordHints() call runs in
 * a worker of its own. Counts the workers created and the most alive at once while 40 characters
 * are typed, 25 ms apart, into the passphrase of MHFE's New wallet tab and into Generate & Derive's
 * chosen word with the wallet check on.
 */
async function workerProbe(browser, browserName, profile) {
  const run = { browser: browserName, profile: profile.id, width: 1280, checks: [] };
  report.runs.push(run);
  const countWorkers = () => {
    const NativeWorker = window.Worker;
    const stats = { created: 0, alive: 0, peak: 0 };
    window.auditWorkers = stats;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        stats.created += 1;
        stats.alive += 1;
        stats.peak = Math.max(stats.peak, stats.alive);
      }
      terminate() {
        stats.alive -= 1;
        super.terminate();
      }
    };
  };
  const { context, page, errors, requests } = await open(browser, profile, 1280, countWorkers);
  try {
    const reset = () =>
      page.evaluate(() => {
        Object.assign(window.auditWorkers, { created: 0, peak: window.auditWorkers.alive });
      });
    const read = () => page.evaluate(() => ({ ...window.auditWorkers }));
    const typed = "x".repeat(40);
    // Generate & Derive: the wallet check on, typing a chosen word.
    await page.locator("#chosen-words-enabled").check();
    await page.locator("#wallet-check-enabled").check();
    await page.waitForFunction(
      () => !document.querySelector("#wallet-check-options").inert,
      undefined,
      { timeout: 60000 },
    );
    await page.waitForTimeout(1000);
    await reset();
    await page.locator("#toggle-sensitive-values").click();
    await page.locator("#chosen-word-1").pressSequentially(typed, { delay: 25 });
    await page.waitForTimeout(2000);
    const gd = await read();
    // MHFE New wallet: typing the BIP39 passphrase.
    await page.locator("#recovery-backup-mode").click();
    await page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]').click();
    await page.waitForFunction(() => !document.getElementById("mhfe-panel").inert, undefined, {
      timeout: 60000,
    });
    await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-new-panel"]').click();
    await page.waitForTimeout(1000);
    await reset();
    await page.locator("#mhfe-new-passphrase").pressSequentially(typed, { delay: 25 });
    await page.waitForTimeout(2000);
    const mhfe = await read();
    run.observed = { characters: typed.length, generateAndDerive: gd, mhfeNewWallet: mhfe };
    await check(
      run,
      "typing does not start a worker per keystroke (G&D chosen word)",
      gd.created < typed.length / 2,
      gd,
    );
    await check(
      run,
      "typing does not start a worker per keystroke (MHFE passphrase)",
      mhfe.created < typed.length / 2,
      mhfe,
    );
    await check(run, "no page errors", errors.length === 0, errors);
    await check(run, "no HTTP requests", requests.length === 0, requests);
  } catch (error) {
    await check(run, "probe completed", false, String(error));
  } finally {
    await context.close();
  }
}

for (const browserName of engineList.split(",")) {
  const browser = await { chromium, firefox }[browserName].launch({ headless: true });
  report[`${browserName}Version`] = browser.version();
  try {
    if (mode === "draw") await drawProbe(browser, browserName, BUILD_PROFILES["multi-chain"]);
    else if (mode === "workers")
      await workerProbe(browser, browserName, BUILD_PROFILES["multi-chain"]);
    else
      for (const profile of Object.values(BUILD_PROFILES))
        await layoutProbes(browser, browserName, profile);
  } finally {
    await browser.close();
  }
}
writeFileSync(resolve(out, `ui-${mode}-report.json`), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      failures: report.failures,
      versions: Object.fromEntries(
        Object.entries(report).filter(([key]) => key.endsWith("Version")),
      ),
    },
    null,
    2,
  ),
);
assert.equal(report.failures.length, 0, `${report.failures.length} check(s) failed`);
