import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, openSync, readSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getToolBuild } from "../build-profiles.mjs";
import { BrowserFixtures } from "./fixtures.mjs";
const { mnemonic } = BrowserFixtures;

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const output =
  process.env.BROWSER_OUTPUT_DIR ??
  resolve(root, "test-results/browser-regressions", new Date().toISOString().replaceAll(":", "-"));

const artifactDirectory = process.env.BROWSER_ARTIFACT_DIR ?? resolve(root, "dist");

const artifact = (profile, tool) =>
  resolve(artifactDirectory, getToolBuild(profile, tool).artifactRelativePath);

const waitText = (page, selector, pattern) =>
  page.waitForFunction(
    ({ selector, source }) =>
      new RegExp(source).test(document.querySelector(selector)?.textContent ?? ""),
    { selector, source: pattern.source },
    { timeout: 120000 },
  );

const fullSelfTestPasses = async (page, selector) => {
  await waitText(page, selector, /^(Every check passed|✗ Failed)/u);
  assert.match(await page.locator(selector).innerText(), /^Every check passed/u);
};

const values = (page, field) =>
  page
    .locator(`#address-list [data-copy-field="${field}"]`)
    .evaluateAll((buttons) =>
      buttons.map(
        (button) =>
          button.parentElement.querySelector(".value")?.textContent ??
          button.closest(".row")?.querySelector(".value")?.textContent,
      ),
    );

async function storageSnapshot(scope, run) {
  const snapshot = await scope.locator("body").evaluate(async () => {
    const result = {};
    for (const name of ["localStorage", "sessionStorage"]) {
      try {
        result[name] = Object.fromEntries(Object.entries(window[name]));
      } catch (error) {
        result[name] = error.name;
      }
    }
    try {
      result.caches = await caches.keys();
    } catch (error) {
      result.caches = error.name;
    }
    try {
      result.cookie = document.cookie;
    } catch (error) {
      result.cookie = error.name;
    }
    return result;
  });
  // Chromium emits an additional undefined pageerror for databases() denied in
  // an opaque sandbox, even when its SecurityError is caught. Keep only that
  // specific, deliberately triggered event separate from application errors.
  if (run) run.probingOpaqueIndexedDB = snapshot.localStorage === "SecurityError";
  snapshot.indexedDB = await scope.locator("body").evaluate(async () => {
    try {
      return (await indexedDB.databases()).map(({ name, version }) => ({ name, version }));
    } catch (error) {
      return error.name;
    }
  });
  await scope.locator("body").evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  if (run) run.probingOpaqueIndexedDB = false;
  return snapshot;
}

// Fixed 64 KiB I/O buffer; artifact identity does not need the whole HTML in memory.
const ARTIFACT_HASH_CHUNK_BYTES = 64 * 1024;

function artifactHash(path) {
  const bytes = Buffer.alloc(ARTIFACT_HASH_CHUNK_BYTES);
  const hash = createHash("sha256");
  const file = openSync(path, "r");
  try {
    while (true) {
      const count = readSync(file, bytes, 0, bytes.length, null);
      if (count === 0) break;
      hash.update(bytes.subarray(0, count));
    }
    return hash.digest("hex");
  } finally {
    closeSync(file);
  }
}

async function open(context, profile, tool, run) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => {
    const expectedProbeError = run.probingOpaqueIndexedDB && String(error) === "undefined";
    (expectedProbeError ? (run.indexedDBProbeErrors ??= []) : run.pageErrors).push(String(error));
  });
  page.on("console", (entry) => run.console.push({ type: entry.type(), text: entry.text() }));
  const path = artifact(profile, tool);
  run.artifacts[relative(root, path)] = artifactHash(path);
  await page.goto(pathToFileURL(path).href);
  if (tool === "key-derivation") await page.locator("#crypto-self-test-status.passed").waitFor();
  if (tool === "activity-viewer")
    await page.locator("#viewer-crypto-self-test-status.passed").waitFor();
  if (tool === "discovery-scanner")
    await page
      .frameLocator("#recovery-secret-vault")
      .locator("#recovery-self-test.passed")
      .waitFor();
  if (tool === "psbt-inspector") await page.locator("#psbt-self-test-status.passed").waitFor();
  return page;
}

async function openWithLinkedPhrase(context, profile, run, target) {
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#main-recovery-source-menu summary").click();
  await page.locator(`#main-recovery-source-menu [data-recovery-target="${target}"]`).click();
  return { page, before };
}

async function openSeedShiftEncoding(context, profile, run) {
  const opened = await openWithLinkedPhrase(context, profile, run, "mnemocode");
  const { page } = opened;
  await page.locator('[data-operation-tab][aria-controls="mnemocode-create-panel"]').click();
  await page.locator("#mnemocode-encode-mode").selectOption("seedshift");
  await page.locator("#mnemocode-encode-dates").fill("23-09-2026");
  return opened;
}

async function waitPanelReady(page, panelId) {
  await page.waitForFunction((id) => !document.getElementById(id).inert, panelId);
}

async function openBackupPanel(context, profile, run, panelId) {
  const page = await open(context, profile, "key-derivation", run);
  const before = await storageSnapshot(page);
  await page.locator("#recovery-backup-mode").click();
  await page.locator(`[data-recovery-tab][aria-controls="${panelId}"]`).click();
  await waitPanelReady(page, panelId);
  return { page, before };
}

/** Cohesive host cases; helpers stay private to this module. */
export class BrowserHarness {
  /** Shared output boundary for the native browser cases. */
  static output = output;
  /** Shared open boundary for the native browser cases. */
  static open = open;
  /** Shared fullSelfTestPasses boundary for the native browser cases. */
  static fullSelfTestPasses = fullSelfTestPasses;
  /** Shared artifact boundary for the native browser cases. */
  static artifact = artifact;
  /** Shared root boundary for the native browser cases. */
  static root = root;
  /** Shared openSeedShiftEncoding boundary for the native browser cases. */
  static openSeedShiftEncoding = openSeedShiftEncoding;
  /** Shared waitText boundary for the native browser cases. */
  static waitText = waitText;
  /** Shared openBackupPanel boundary for the native browser cases. */
  static openBackupPanel = openBackupPanel;
  /** Shared storageSnapshot boundary for the native browser cases. */
  static storageSnapshot = storageSnapshot;
  /** Shared waitPanelReady boundary for the native browser cases. */
  static waitPanelReady = waitPanelReady;
  /** Shared openWithLinkedPhrase boundary for the native browser cases. */
  static openWithLinkedPhrase = openWithLinkedPhrase;
  /** Shared values boundary for the native browser cases. */
  static values = values;
}
