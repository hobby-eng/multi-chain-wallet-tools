import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Bitcoin Core's public TESTMODE_VALID Miniscript key (official-vectors.json entries 83/96).
const KEY = "03d30199d74fb5a22d47b6e054e2f378cedacffcb89904a61d75d0dbd407143e65";
const UNKNOWN = "Not summarized; review the symbolic policy";
const AGGREGATES = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/psbt-inspector/tests/independent-audit/remediation-vectors.json",
      import.meta.url,
    ),
    "utf8",
  ),
).musig.filter(({ descriptor }) => descriptor.startsWith("rawtr(musig("));
assert.equal(AGGREGATES.length, 3, "The retained BIP328/BIP390 output controls must all run");

/** Checks actual descriptor compilation and the distinction between unknown and empty obligations. */
export class DescriptorPathKnowledgeCase {
  #page;
  constructor(page) {
    this.#page = page;
  }

  async #read(text) {
    await this.#page.locator("#script-input").fill(text);
    await this.#page.locator("#decode-script").click();
    await this.#page.locator("#script-results").waitFor({ state: "visible" });
    assert.equal(await this.#page.locator("#script-error").isVisible(), false);
    return this.#page
      .locator(".descriptor-path-card")
      .first()
      .locator("dt")
      .evaluateAll((terms) =>
        Object.fromEntries(
          terms.map((term) => [term.textContent, term.nextElementSibling?.textContent]),
        ),
      );
  }

  /** Runs in both editions; witness and Taproot controls remain specific to Multi-Chain. */
  async run(profile) {
    const wrapper = profile === "multi-chain" ? "wsh" : "sh";
    const threshold = await this.#read(`${wrapper}(thresh(1,c:pk_k(${KEY}),altv:after(100)))`);
    assert.equal(threshold.Availability, UNKNOWN);
    assert.match(threshold.Requirement, /satisfy exactly 1 of/u);
    assert.match(threshold.Requirement, /dissatisfaction witnesses/u);
    for (const fact of ["Keys", "Preimage", "Locks"]) assert.equal(threshold[fact], UNKNOWN);
    const opaque = await this.#read("raw(51)");
    assert.equal(opaque.Availability, UNKNOWN);
    assert.equal(opaque.Locks, UNKNOWN);
    const impossible = await this.#read(`${wrapper}(0)`);
    assert.equal(impossible.Availability, "No satisfying path");
    const known = await this.#read(`${wrapper}(and_v(v:pk(${KEY}),older(144)))`);
    assert.equal(known.Availability, "After relative 144 = 144 blocks");
    assert.equal(known.Preimage, "Not required");
    assert.equal(known.Locks, "relative 144 = 144 blocks");
    if (profile === "multi-chain") {
      for (const text of [`wpkh(${KEY})`, `rawtr(${KEY.slice(2)})`]) {
        const keyed = await this.#read(text);
        assert.match(keyed.Requirement, /one signature/u);
        assert.notEqual(keyed.Keys, "No direct signing key summarized");
      }
      const taproot = await this.#read(`tr(${KEY.slice(2)},older(144))`);
      assert.equal(taproot.Availability, UNKNOWN);
      assert.equal(taproot.Keys, UNKNOWN);
      await this.#read(`tr(${KEY.slice(2)},0)`);
      const policy = await this.#page.locator("#script-policy").textContent();
      assert.match(policy, /Taproot key path/u);
      assert.match(policy, /Tapscript path 1: an impossible branch; No satisfying path/u);
      assert.doesNotMatch(policy, /impossible branch; available immediately/u);
      const originalIndex = await this.#page.locator("#script-wildcard-index").inputValue();
      try {
        for (const vector of AGGREGATES) {
          await this.#page.locator("#script-wildcard-index").fill(String(vector.index));
          const aggregate = await this.#read(vector.descriptor);
          assert.match(aggregate.Requirement, /aggregate Schnorr signature/u);
          assert.notEqual(aggregate.Keys, "No direct signing key summarized");
          assert.ok(
            (await this.#page.locator("#script-results").innerText()).includes(vector.script),
          );
        }
      } finally {
        await this.#page.locator("#script-wildcard-index").fill(originalIndex);
      }
    }
  }
}
