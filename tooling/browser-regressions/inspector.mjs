import assert from "node:assert/strict";
import { DescriptorPathKnowledgeCase } from "../browser-cases/descriptor-path-knowledge.mjs";
import { InspectorNetworkLifecycleCase } from "../browser-cases/inspector-network-lifecycle.mjs";
import { Bip38LifecycleCase } from "../browser-cases/bip38-lifecycle.mjs";
import { BrowserHarness } from "./host.mjs";
const { open, waitText } = BrowserHarness;
import { BrowserFixtures } from "./fixtures.mjs";
const { parent } = BrowserFixtures;

async function descriptorFollowup(context, profile, run) {
  const page = await open(context, profile, "psbt-inspector", run);
  await page.locator('[data-mode="script"]').click();
  await new InspectorNetworkLifecycleCase(page).run();
  await new DescriptorPathKnowledgeCase(page).run(profile.id);
  const g = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  const u =
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
  const valid =
    profile.id === "multi-chain"
      ? `tr(musig(${parent.publicExtendedKey},${parent.deriveChild(1).publicExtendedKey})/<0;1>/*)`
      : `sh(pkh(${u}))`;
  await page.locator("#script-input").fill(valid);
  await page.locator("#decode-script").click();
  await page.locator("#script-results").waitFor({ state: "visible" });
  assert.equal(await page.locator("#script-error").isVisible(), false);
  assert.match(await page.locator("#script-results").innerText(), /Compiled descriptor data/);
  const invalid = profile.id === "multi-chain" ? `tr(${g},pk(musig([bad]${g},${g})))` : "combo(00)";
  await page.locator("#script-input").fill(invalid);
  await page.locator("#decode-script").click();
  await page.locator("#script-error").waitFor({ state: "visible" });
  assert.equal(await page.locator("#script-results").isVisible(), false);
  run.checks.push(
    "Valid descriptor compiles; malformed replacement hides all previous compiled results",
  );
}

async function verifierRevision(context, profile, run) {
  const page = await open(context, profile, "psbt-inspector", run);
  await page.locator('[data-mode="verify"]').click();
  await page.locator("#verify-chain").selectOption("dash");
  await page.locator("#verify-address").fill("XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE");
  await page.locator("#verify-message").fill("Dash verifier fixture");
  await page
    .locator("#verify-signature")
    .fill(
      "IIeeVV8PxEmSnk2FqMTPAHtJdezmn2tXQhHq8q8fhFu6IXrYcwT6yi7hS42BcpoinL8nRwFFJPqPLXF3prJLWmc=",
    );
  await page.locator("#verify-message-button").click();
  await waitText(page, "#verify-validity", /^VALID/);
  await page.evaluate(() => {
    document.querySelector("#verify-message-button").click();
    const field = document.querySelector("#verify-message");
    field.value = "Changed claim";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#verify-results").isVisible(), false);
  await page.evaluate(() => {
    document.querySelector("#verify-message-button").click();
    document.querySelector("#clear-verifier").click();
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#verify-results").isVisible(), false);
  assert.equal(await page.locator("#verify-error").isVisible(), false);
  if (profile.id === "multi-chain") {
    await page.locator('[data-mode="builder"]').click();
    await page.locator("#policy-mode").selectOption("custom-miniscript");
    await page.locator("#custom-miniscript-context").selectOption("tapscript");
    for (const key of [
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
      "ff".repeat(32),
    ]) {
      await page.locator("#custom-miniscript").fill(`multi_a(1,${key})`);
      await page.locator("#build-policy").click();
      assert.equal(await page.locator("#policy-results").isVisible(), false);
      assert.equal(await page.locator("#builder-error").isVisible(), true);
    }
  }
  run.checks.push(
    "Verification results invalidated on edit/Clear; unsafe custom Tapscript keys rejected before showing an output",
  );
}

/** Cohesive inspector cases; helpers stay private to this module. */
export class InspectorBrowserCases {
  /** Actual BIP38 crypto and page lifetime checks, in both editions and browser engines. */
  static bip38Lifecycle = async (context, profile, run) => {
    const page = await open(context, profile, "psbt-inspector", run);
    await new Bip38LifecycleCase(page).run();
    run.checks.push(
      "BIP38 exact key/network outputs, concealment, field cleanup and stale queue refusal",
    );
  };
  /** Shared descriptorFollowup boundary for the native browser cases. */
  static descriptorFollowup = descriptorFollowup;
  /** Shared verifierRevision boundary for the native browser cases. */
  static verifierRevision = verifierRevision;
}
