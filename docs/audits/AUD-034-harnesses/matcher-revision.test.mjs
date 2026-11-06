// Real Matcher installer/client, a public BIP39 phrase, and a passive native Worker boundary.
import { afterEach, expect, it, vi } from "vitest";
import { recoveryFeature } from "../../../apps/key-derivation/src/ui/recovery-wallet-matcher.ts";
import { RecoveryTestPage, settlePromises } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";
import * as registry from "../../../packages/coin-protocols/src/coins/registry.ts";
import { createCoinRegistry } from "../../../packages/coin-protocols/src/coins/registry-base.ts";
import { detectMultiChainMatcherTargets } from "../../../packages/wallet-recovery/src/matcher-targets-multichain.ts";
import { mnemonicToSeed } from "../../../packages/crypto-core/src/bip39.ts";

class PassiveWorker extends EventTarget {
  static instances = [];
  requests = [];
  stopped = false;
  constructor() {
    super();
    PassiveWorker.instances.push(this);
    queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", { data: { type: "ready" } })));
  }
  postMessage(request) { this.requests.push(request); }
  terminate() { this.stopped = true; }
  reply() {
    const request = this.requests[0];
    if (!request) throw new Error("No public synthetic worker request");
    this.dispatchEvent(new MessageEvent("message", { data: { id: request.id, ok: true, type: "search-many", result: [] } }));
  }
}

afterEach(() => { for (const worker of PassiveWorker.instances) worker.terminate(); PassiveWorker.instances.length = 0; vi.unstubAllGlobals(); });

it("does not publish a Matcher result after its source input changed", async () => {
  const page = new RecoveryTestPage();
  for (const id of ["toggle-matcher-secrets", "matcher-coin", "matcher-force-all", "matcher-search-change", "matcher-seeds", "matcher-passphrases", "matcher-addresses", "matcher-seed-lines", "matcher-passphrase-lines", "matcher-address-lines", "run-wallet-matcher", "cancel-wallet-matcher", "wallet-matcher-status", "wallet-matcher-results", "matcher-network", "matcher-account-start", "matcher-account-end", "matcher-index-start", "matcher-index-count"]) page.add(id, id.includes("seeds") || id.includes("addresses") || id.includes("passphrases") ? "textarea" : "input");
  page.require("matcher-coin").value = "bitcoin";
  page.require("matcher-network").value = "mainnet";
  page.require("matcher-seeds").value = `${"abandon ".repeat(11)}about`;
  page.require("matcher-addresses").value = "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA";
  for (const id of ["matcher-account-start", "matcher-account-end", "matcher-index-start"]) page.require(id).value = "0";
  page.require("matcher-index-count").value = "1";
  vi.stubGlobal("Worker", PassiveWorker);
  vi.stubGlobal("__DERIVATION_WORKER_SOURCE__", "public passive worker fixture");
  recoveryFeature.install({
    registry: createCoinRegistry([registry.getCoinAdapter("bitcoin-legacy")]),
    detectTargets: detectMultiChainMatcherTargets,
    mnemonicToSeed, linkedValue: () => null,
    writeClipboard: async () => {},
  });
  page.require("run-wallet-matcher").dispatchEvent(new Event("click"));
  await settlePromises();
  const worker = PassiveWorker.instances[0];
  if (!worker || worker.requests.length !== 1) throw new Error("Matcher did not reach its real search client");
  page.require("matcher-seeds").value = "newer edited source";
  page.require("matcher-seeds").dispatchEvent(new Event("input", { bubbles: true }));
  worker.reply();
  await settlePromises();
  expect(page.require("wallet-matcher-results").textContent).toBe("");
});
