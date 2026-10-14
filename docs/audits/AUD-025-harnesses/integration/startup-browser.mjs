// Bounded Deriver startup/gate evidence only: no full self-test button, cards or Argon2.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILD_PROFILES, getToolBuild } from "../../../../tooling/build-profiles.mjs";
import { loadPlaywright } from "../../../../tooling/playwright-loader.mjs";
import { chosenGoldenPhrase, read, root, sha256 } from "./source-fixtures.mjs";

const { chromium, firefox } = await loadPlaywright();
const golden = await chosenGoldenPhrase();
const damaged = golden.replace(/ zoo$/, " abandon");
assert.notEqual(damaged, golden);
const evidence = resolve(root, "docs/audits/AUD-025-evidence");
mkdirSync(evidence, { recursive: true });
const vendor = JSON.parse(read("packages/recovery-mhfe-wasm/generated/modules.json"));
const vendorWasm = read("packages/recovery-mhfe-wasm/generated/runtime/mhfe.wasm");
const vendorRuntime = read("packages/recovery-mhfe-wasm/generated/runtime/runtime.js");
assert.equal(sha256(vendorWasm), vendor.runtime.files["mhfe.wasm"]);
assert.equal(sha256(vendorRuntime), vendor.runtime.files["runtime.js"]);

// Eight short navigations, sequential: healthy and damaged-KAT pages for two editions in each
// browser. Existing built artifacts are required; nothing is rebuilt or synced by this harness.
const deadline = performance.now() + 45_000;
const remaining = (bound) => {
  const left = deadline - performance.now();
  assert.ok(left > 0, "the startup probe exceeded its forty-five-second whole-run bound");
  return Math.min(left, bound);
};
const results = [];
for (const [browserName, browserType] of [
  ["chromium", chromium],
  ["firefox", firefox],
]) {
  const browser = await browserType.launch({ timeout: remaining(8_000) });
  try {
    for (const profile of Object.values(BUILD_PROFILES)) {
      const artifactPath = resolve(
        root,
        "dist",
        getToolBuild(profile, "key-derivation").artifactRelativePath,
      );
      const artifact = readFileSync(artifactPath, "utf8");
      const context = await browser.newContext();
      try {
        const errors = [];
        const requests = [];
        await context.route(/^https?:/i, (route) => {
          requests.push(route.request().url());
          return route.abort();
        });
        await context.addInitScript(() => {
          const NativeWorker = Worker;
          window.auditDispatches = [];
          window.Worker = class extends NativeWorker {
            postMessage(request, ...rest) {
              // Only public operation names are recorded, never input values or message bodies.
              window.auditDispatches.push({
                type: request?.type ?? null,
                module: request?.module ?? null,
                operation: request?.operation ?? null,
              });
              return super.postMessage(request, ...rest);
            }
          };
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.setDefaultTimeout(8_000);

        // A real HTML parser finds the one script containing the expected KAT. Only that public
        // expected phrase changes; the actual generator and every production control stay intact.
        const mutant = await page.evaluate(
          ({ artifact, golden, damaged }) => {
            const document = new DOMParser().parseFromString(artifact, "text/html");
            const scripts = [...document.scripts].filter((script) =>
              script.textContent.includes(golden),
            );
            if (scripts.length !== 1)
              throw new Error("The exact chosen-word KAT must occur in one script.");
            const script = scripts[0];
            if (script.textContent.split(golden).length !== 2)
              throw new Error("The expected KAT must occur exactly once in that script.");
            const original = script.textContent;
            const changed = original.replace(golden, damaged);
            script.textContent = changed;
            return {
              html: `<!doctype html>${document.documentElement.outerHTML}`,
              original,
              changed,
            };
          },
          { artifact, golden, damaged },
        );
        const hash = (text) => createHash("sha256").update(text).digest("base64");
        const oldPolicyHash = `'sha256-${hash(mutant.original)}'`;
        const newPolicyHash = `'sha256-${hash(mutant.changed)}'`;
        assert.ok(
          mutant.html.includes(oldPolicyHash),
          "the original script has its offline CSP hash",
        );
        // Rehash the test fixture so its controlled KAT failure reaches the normal application,
        // rather than proving only that an altered script is blocked by Content-Security-Policy.
        const mutantHtml = mutant.html.replaceAll(oldPolicyHash, newPolicyHash);
        const mutantPath = resolve(evidence, `integration-startup-${profile.id}-damaged-kat.html`);
        writeFileSync(mutantPath, mutantHtml);

        await page.goto(pathToFileURL(artifactPath).href, { timeout: remaining(8_000) });
        await page
          .locator("#crypto-self-test-status.passed")
          .waitFor({ timeout: remaining(8_000) });
        const healthy = await page.locator("#crypto-self-test-details").innerText();
        assert.match(healthy, /BIP39 chosen-word bit placement and readback \(five lengths\)/);
        assert.match(
          healthy,
          /BIP39 chosen-word checksum, predicates and refusals \(five lengths\)/,
        );
        for (const count of [12, 15, 18, 21, 24])
          assert.equal(await page.locator(`#generate-${count}`).isDisabled(), false);
        const healthyDispatches = await page.evaluate(() => window.auditDispatches);
        assert.ok(
          healthyDispatches.some(({ type }) => type === "self-test"),
          "real startup worker ran",
        );

        await page.goto(pathToFileURL(mutantPath).href, { timeout: remaining(8_000) });
        await page
          .locator("#crypto-self-test-status.failed")
          .waitFor({ timeout: remaining(8_000) });
        const failure = await page.locator("#crypto-self-test-details").innerText();
        assert.equal(failure, "Cryptographic self-test failed: BIP39 phrase with chosen words.");
        const closed = [
          "#generate-12",
          "#generate-15",
          "#generate-18",
          "#generate-21",
          "#generate-24",
          "#derive-button",
          "#derive-bip85",
          "#full-self-test",
          "#wallet-check-enabled",
        ];
        if (profile.id === "multi-chain") closed.push("#derive-silent-payment");
        for (const selector of closed)
          assert.equal(await page.locator(selector).isDisabled(), true, `${selector} stays closed`);
        // A forged click bypasses disabled-button dispatch, and must still reach the handler's
        // cryptoReady guard without producing or publishing any phrase or derivation request.
        await page.evaluate(() => {
          document.querySelector("#generate-24").dispatchEvent(new Event("click"));
        });
        assert.equal(await page.locator("#mnemonic").inputValue(), "");
        assert.match(
          await page.locator("#error").innerText(),
          /self-test has not completed successfully/,
        );
        const failedDispatches = await page.evaluate(() => window.auditDispatches);
        assert.ok(
          failedDispatches.every(
            ({ type, operation }) => type !== "derive" && operation !== "drawPhrase",
          ),
          "no derivation or draw dispatch after component failure",
        );
        assert.deepEqual(errors, [], "no uncaught browser errors");
        assert.deepEqual(requests, [], "no HTTP requests");
        const row = {
          browser: browserName,
          engineVersion: browser.version(),
          profile: profile.id,
          passed: true,
          artifactPath,
          artifactSha256: sha256(artifact),
          controlledFixtureSha256: sha256(mutantHtml),
          healthy,
          failure,
          closedControls: closed,
          healthyDispatches,
          failedDispatches,
        };
        results.push(row);
        console.log(JSON.stringify(row));
        await page.close();
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
assert.equal(results.length, 4, "two profiles in both browsers completed");
console.log(
  JSON.stringify({
    cases: results.length,
    coreSelfTestSourceSha256: sha256(read("packages/crypto-core/src/bip39-chosen-words.ts")),
    verificationSourceSha256: sha256(read("packages/verification/src/bip39-self-test.ts")),
    vendorVersion: vendor.version,
    vendorBuildId: vendor.buildId,
    vendorWasmSha256: sha256(vendorWasm),
    vendorRuntimeSha256: sha256(vendorRuntime),
    limitations:
      "Startup and a controlled KAT failure only; no full self-test, cards, Argon2, MHFE draw or statistical proof.",
  }),
);
