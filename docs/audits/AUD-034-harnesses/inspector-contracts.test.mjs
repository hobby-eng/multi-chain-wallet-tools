// Independent public API/caller challenge with published public keys; no KDF, signing or network.
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PolicyLock } from "../../../apps/psbt-inspector/src/policy-lock.ts";
import { buildRangedWallet } from "../../../apps/psbt-inspector/src/multisig-wallet.ts";
import { decodeDescriptor } from "../../../apps/psbt-inspector/src/descriptor.ts";
import { installScriptDecoderFeature } from "../../../apps/psbt-inspector/src/script-decoder-feature.ts";
import { RecoveryTestPage } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";

const vectors = JSON.parse(readFileSync(new URL("../../../apps/psbt-inspector/tests/independent-audit/official-vectors.json", import.meta.url), "utf8"));
const XPUB = vectors.bip32[0].paths[0].xpub;
const REQUEST = { chain: "bitcoin", network: "mainnet", required: 1, keyOrder: "bip67", wrapper: "p2wsh", accountXpubs: [XPUB], branches: [0], startIndex: 0, endIndex: 0 };
afterEach(() => vi.unstubAllGlobals());

it("refuses an unknown public lock-kind discriminant", () => {
  expect(() => new PolicyLock("relative-days", 1)).toThrow();
});

it("refuses a ranged-wallet key origin above the non-hardened child bound", () => {
  expect(() => buildRangedWallet({ ...REQUEST, accountXpubs: [`[deadbeef/2147483648h]${XPUB}`] })).toThrow();
});

it("refuses a ranged-wallet branch outside receive/change", () => {
  expect(() => buildRangedWallet({ ...REQUEST, branches: [2] })).toThrow();
});

it("keeps an immediately satisfiable threshold path distinct from all descendant locks", () => {
  // Bitcoin Core TESTMODE_VALID fixture from the pinned test inventory, with a literal public key.
  const policy = "wsh(thresh(1,c:pk_k(03d30199d74fb5a22d47b6e054e2f378cedacffcb89904a61d75d0dbd407143e65),altv:after(1000000000),altv:after(100)))";
  const decoded = decodeDescriptor(policy, { chain: "bitcoin", network: "mainnet" });
  expect(decoded.pathCards.some((card) => card.availability === "Immediate"), JSON.stringify(decoded.pathCards)).toBe(true);
});

it("synchronizes or refuses Bitcoin Regtest when the Script decoder changes to Dash", () => {
  const page = new RecoveryTestPage();
  page.getElementById = (id) => page.querySelector(`#${id}`);
  for (const id of ["script-chain", "script-network", "script-role", "script-branch", "script-wildcard-index", "script-input", "decode-script", "clear-script", "script-error", "script-results", "script-policy", "script-asm", "script-classification", "script-wrappers", "script-operations"]) page.add(id, "input");
  page.require("script-chain").value = "bitcoin";
  page.require("script-network").value = "regtest";
  page.require("script-role").value = "script-pubkey";
  page.require("script-input").value = "76a914751e76e8199196d454941c45d1b3a323f1433bd688ac";
  installScriptDecoderFeature({ script: true, descriptor: true });
  page.require("script-chain").value = "dash";
  page.require("script-chain").dispatchEvent(new Event("change"));
  page.require("decode-script").dispatchEvent(new Event("click"));
  const rejected = !page.require("script-error").hidden;
  expect(rejected || page.require("script-network").value !== "regtest", page.require("script-classification").textContent).toBe(true);
});
