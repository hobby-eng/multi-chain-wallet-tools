import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserHarness } from "./host.mjs";
const { open, fullSelfTestPasses, artifact, root, storageSnapshot } = BrowserHarness;
import { BrowserFixtures } from "./fixtures.mjs";
const { mnemonic } = BrowserFixtures;

async function selfTests(context, profile, run) {
  const deriver = await open(context, profile, "key-derivation", run);
  await deriver.locator("#full-self-test").click();
  await fullSelfTestPasses(deriver, "#full-self-test-status");
  const fullResult = await deriver.locator("#full-self-test-result").innerText();
  assert.match(fullResult, /BIP38/u);
  // TON's phrase key, 100,000 PBKDF2 rounds, is checked in the full self-test only.
  if (profile.id === "multi-chain") assert.match(fullResult, /TON phrase key/u);
  else assert.doesNotMatch(fullResult, /TON/u);
  const startupChecks = await deriver.locator("#crypto-self-test-details").innerText();
  assert.match(startupChecks, /BIP85/u);
  // Each signing coin has a startup known answer; Dash Community has Dash's only.
  for (const name of [
    "Litecoin compact",
    "Dogecoin compact",
    "Bitcoin Cash compact",
    "Zcash compact",
    "Ethereum personal_sign",
    "Ethereum Classic personal_sign",
    "Tron signMessageV2",
    "Solana signMessage and off-chain",
    "Stellar SEP-53",
    "NEAR NEP-413",
    "TON Connect signData",
    "Cosmos ADR-036",
    "Injective ADR-036 and EIP-191",
    "Hedera HIP-820",
    "Cardano CIP-30 signData",
  ]) {
    const check = new RegExp(`${name} message signature`, "u");
    if (profile.id === "multi-chain") assert.match(startupChecks, check);
    else assert.doesNotMatch(startupChecks, check);
  }
  // The decoy texts of a SeedQR hidden in a decoy QR have startup known answers in both editions.
  assert.match(startupChecks, /Decoy QR texts: vCard and Wi-Fi escaping/u);
  // MnemoCode's run in the full self-test carries the hidden SeedQR's check of both editions.
  assert.match(fullResult, /MnemoCode: Hidden SeedQR/u);

  const inspector = await open(context, profile, "psbt-inspector", run);
  assert.match(
    await inspector.locator("#psbt-self-test-details").innerText(),
    /known-answer checks passed/u,
  );
  await inspector.locator("#psbt-full-self-test").click();
  await fullSelfTestPasses(inspector, "#psbt-full-self-test-status");

  const scanner = await open(context, profile, "discovery-scanner", run);
  const scannerChecks = await scanner
    .frameLocator("#recovery-secret-vault")
    .locator("#recovery-crypto-self-test-details")
    .innerText();
  assert.match(scannerChecks, /Candidate list import/u);
  // Watch-only discovery screens its inputs with the guard, so its known answers run too.
  assert.match(scannerChecks, /Public-input guard refuses/u);

  const viewer = await open(context, profile, "activity-viewer", run);
  assert.match(
    await viewer.locator("#viewer-crypto-self-test-details").innerText(),
    /Public-input guard/u,
  );
  if (profile.id === "multi-chain")
    assert.match(
      await viewer.locator("#viewer-external-self-test").innerText(),
      /^Address checks passed: Public-input guard refuses/u,
    );
  run.checks.push(
    "Self-tests: Deriver and Inspector full self-tests; Scanner candidate lists and Viewer public-input guard and address checks at start",
  );
}

async function selfTestFailure(context, profile, run) {
  await context.addInitScript(() => {
    globalThis.crypto.getRandomValues = (array) => array.fill(7);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => run.pageErrors.push(String(error)));
  const path = artifact(profile, "key-derivation");
  run.artifacts[relative(root, path)] = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
  await page.goto(pathToFileURL(path).href);
  await page.locator("#crypto-self-test-status.failed").waitFor();
  const closed = ["#derive-button", "#derive-bip85", "#full-self-test"];
  if (profile.id === "multi-chain") closed.push("#derive-silent-payment");
  for (const selector of closed)
    assert.equal(await page.locator(selector).isDisabled(), true, `${selector} stays closed`);
  // A complete phrase starts no BIP85 derivation by itself either.
  await page.locator("#mnemonic").fill(mnemonic);
  await page.locator("#include-bip85").check();
  await page.locator("#bip85-tab").click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator("#bip85-output").inputValue(), "");
  assert.equal(await page.locator("#bip85-result").isHidden(), true);
  run.checks.push(
    "A failed startup self-test keeps Generate, BIP85, Silent Payments and the full self-test closed",
  );
}

async function boundaries(context, profile, tool, run) {
  const page = await open(context, profile, tool, run);
  const scopes = [page];
  if (tool === "discovery-scanner") {
    assert.equal(
      await page.locator("#recovery-secret-vault").getAttribute("sandbox"),
      "allow-scripts",
    );
    scopes.push(page.frameLocator("#recovery-secret-vault"));
  }
  for (const [index, scope] of scopes.entries()) {
    const networked = index === 0 && ["discovery-scanner", "activity-viewer"].includes(tool);
    const csp = await scope
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    assert.match(csp, networked ? /connect-src https:/ : /connect-src 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    const before = await storageSnapshot(scope, run);
    const result = await scope.locator("body").evaluate(async () => {
      const violations = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        violations.push(event.effectiveDirective),
      );
      const script = document.createElement("script");
      script.textContent = "window.__browserRegressionInlineExecuted = true";
      document.head.append(script);
      script.remove();
      let fetchAllowed = false;
      try {
        await fetch("https://browser-regression.invalid/probe");
        fetchAllowed = true;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
      let parentBlocked = null;
      if (window !== window.parent) {
        try {
          void window.parent.document.body;
          parentBlocked = false;
        } catch {
          parentBlocked = true;
        }
      }
      return {
        inlineExecuted: window.__browserRegressionInlineExecuted === true,
        fetchAllowed,
        violations,
        parentBlocked,
      };
    });
    assert.equal(result.inlineExecuted, false, "Unhashed injected script executed");
    assert.equal(result.fetchAllowed, networked, "Unexpected CSP network boundary");
    assert.ok(result.violations.some((value) => value.startsWith("script-src")));
    if (!networked) assert.ok(result.violations.includes("connect-src"));
    if (index === 1) assert.equal(result.parentBlocked, true);
    assert.deepEqual(await storageSnapshot(scope, run), before);
    run.checks.push({
      scope: index === 0 ? "top-level" : "opaque-vault",
      csp,
      storage: before,
      probes: result,
    });
  }
  await page.reload();
  assert.deepEqual(await context.cookies(), []);
  assert.equal(run.requests.filter((request) => !request.url.endsWith("/probe")).length, 0);
}

/** Cohesive boundaries cases; helpers stay private to this module. */
export class BrowserBoundaryCases {
  /** Shared boundaries boundary for the native browser cases. */
  static boundaries = boundaries;
  /** Shared selfTests boundary for the native browser cases. */
  static selfTests = selfTests;
  /** Shared selfTestFailure boundary for the native browser cases. */
  static selfTestFailure = selfTestFailure;
}
