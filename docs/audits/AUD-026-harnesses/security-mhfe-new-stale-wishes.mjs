// AUD-026 security reviewer (CHECK-SEC-005, late results): the MHFE New wallet tab of the built
// Deriver (dist/, multi-chain edition, Chromium, file://). A phrase is drawn with the MHFE wallet
// check and the chosen word "abandon" at position 1; while it is drawn, the person changes the
// answer to "Every word at random". Generate & Derive drops a phrase made for edited wishes
// (AUD-024-API002); this probe checks whether the New wallet tab shows the phrase of the old wishes.
//
// Determinism and cost: as in tooling/verify-browser-regressions.mjs (checkedMnemonic), the MHFE
// workers get a public counter source (76562, whose phrase passes the check with "TREZOR"), and the
// draw waits DRAW_DELAY_MS in its worker so that the edit lands while it runs. The container
// password is edited during the draw too, so that the tab's own review guard stops before
// encryption: no Argon2 runs. Public test data only; no network. Exit 1 when the old-wish phrase
// is shown after the wishes changed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlaywright } from "../../../tooling/playwright-loader.mjs";
import { BUILD_PROFILES, getToolBuild } from "../../../tooling/build-profiles.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const DRAW_DELAY_MS = 6000;
const artifact = resolve(
  root,
  "dist",
  getToolBuild(BUILD_PROFILES["multi-chain"], "key-derivation").artifactRelativePath,
);
const report = {
  artifact,
  artifactSha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
  steps: [],
};
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const requests = [];
  context.on("request", (request) => {
    if (!/^(file|blob|data):/u.test(request.url())) requests.push(request.url());
  });
  await context.addInitScript(
    ({ delay }) => {
      const NativeBlob = window.Blob;
      const NativeWorker = window.Worker;
      const sources = new WeakMap();
      const urls = new Map();
      const createUrl = URL.createObjectURL.bind(URL);
      window.Blob = class extends NativeBlob {
        constructor(parts, options) {
          super(parts, options);
          if (parts?.every((part) => typeof part === "string")) sources.set(this, parts.join(""));
        }
      };
      URL.createObjectURL = (blob) => {
        const url = createUrl(blob);
        if (sources.has(blob)) urls.set(url, sources.get(blob));
        return url;
      };
      window.mhfeRandom = null;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          let fixtureUrl;
          const random = window.mhfeRandom;
          if (options?.name === "mhfe" && random !== null && urls.has(url)) {
            const prefix = `{
              const fixture = new Uint8Array(32);
              new DataView(fixture.buffer).setBigUint64(24, BigInt(${random}), false);
              let calls = 0;
              Object.defineProperty(crypto, "getRandomValues", { value: (bytes) => {
                calls += 1;
                if (calls === 3) { const end = Date.now() + ${delay}; while (Date.now() < end); }
                for (let i = 0; i < bytes.length; i += 1)
                  bytes[i] = calls <= 2 ? 1 + ((i + calls) % 254) : fixture[i % 32];
                return bytes;
              }});
            }\n`;
            fixtureUrl = createUrl(
              new NativeBlob([prefix, urls.get(url)], { type: "text/javascript" }),
            );
          }
          super(fixtureUrl ?? url, options);
        }
      };
    },
    { delay: DRAW_DELAY_MS },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(pathToFileURL(artifact).href);
  await page.locator("#crypto-self-test-status.passed").waitFor({ timeout: 120000 });
  await page.locator("#recovery-backup-mode").click();
  await page.locator('[data-recovery-tab][aria-controls="mhfe-panel"]').click();
  await page.waitForFunction(() => !document.getElementById("mhfe-panel").inert);
  await page.locator('#mhfe-panel [data-operation-tab][aria-controls="mhfe-new-panel"]').click();
  await page.locator("#mhfe-new-words-chosen").check();
  await page.locator("#toggle-mhfe-new-chosen-words").click();
  await page.locator("#mhfe-new-chosen-word-1-position").selectOption("1");
  await page.locator("#mhfe-new-chosen-word-1").fill("abandon");
  await page.locator("#mhfe-new-passphrase").fill("TREZOR");
  await page.locator("#mhfe-new-passphrase-confirm").fill("TREZOR");
  await page.locator("#mhfe-new-check-wallet").check();
  await page.locator("#mhfe-new-password-kind-own").check();
  const password = "public audit probe password correct horse battery";
  await page.locator("#mhfe-new-password").fill(password);
  await page.locator("#mhfe-new-password-confirm").fill(password);
  await page.evaluate(() => {
    window.mhfeRandom = 76562;
  });
  report.steps.push("wishes before Generate: chosen word 'abandon' at position 1, wallet check");
  await page.locator("#mhfe-new").click();
  // The draw has started once its status line speaks of draws or its Cancel shows.
  await page.locator("#mhfe-new-stop").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => /draw/iu.test(document.querySelector("#mhfe-new-status")?.textContent ?? ""),
    undefined,
    { timeout: 30000 },
  );
  report.statusDuringDraw = await page.locator("#mhfe-new-status").textContent();
  // The person changes their mind while the phrase is drawn, and edits the password.
  await page.locator("#mhfe-new-words-random").check();
  await page.locator("#mhfe-new-password").fill(`${password} x`);
  report.steps.push("during the draw: answer changed to 'Every word at random'; password edited");
  report.wishesAfterEdit = await page.evaluate(() => ({
    random: document.querySelector("#mhfe-new-words-random").checked,
    chosen: document.querySelector("#mhfe-new-words-chosen").checked,
    wishesHidden: document.querySelector("#mhfe-new-wishes").hidden,
  }));
  // Wait for the draw to end: a phrase is shown, or the status says it failed or stopped.
  await page.waitForFunction(
    () =>
      (document.querySelector("#mhfe-new-phrase")?.children.length ?? 0) > 0 ||
      document.querySelector("#mhfe-new-stop")?.hidden === true,
    undefined,
    { timeout: 60000 },
  );
  await page.waitForTimeout(500);
  if (await page.locator("#mhfe-new-stop").isVisible()) {
    // Safety: never let an encryption run.
    await page.locator("#mhfe-new-stop").click();
    report.steps.push("Cancel pressed after the draw (safety)");
  }
  const shown = await page.evaluate(() => {
    const result = document.querySelector("#mhfe-new-phrase");
    const fields = [...(result?.querySelectorAll("textarea, input, output, .share-secret") ?? [])];
    const values = fields.map((field) => ("value" in field ? field.value : field.textContent));
    return {
      heading: result?.querySelector("h3")?.textContent ?? null,
      phrase: values.find((value) => /^(?:[a-z]+ ){23}[a-z]+$/u.test(value?.trim() ?? "")) ?? null,
      text: result?.innerText.slice(0, 400) ?? null,
    };
  });
  report.shown = { heading: shown.heading, firstWord: shown.phrase?.split(" ")[0] ?? null };
  report.phraseIsPublicCounterVector = shown.phrase !== null;
  report.statusAfter = await page.locator("#mhfe-new-status").textContent();
  report.resultText = (await page.locator("#mhfe-new-result").innerText()).slice(0, 300);
  report.requests = requests;
  report.pageErrors = errors;
  failed = shown.heading !== null && report.wishesAfterEdit.random === true;
  report.conclusion = failed
    ? "The phrase drawn for the old wishes (chosen word at position 1) is shown after the person chose 'Every word at random'."
    : "No phrase of the old wishes was shown.";
  await context.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
