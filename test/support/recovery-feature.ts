import * as registry from "@ckd/coins/registry.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { detectMultiChainMatcherTargets } from "@ckd/recovery/matcher-targets-multichain.js";
import { CompleteIdPage } from "./complete-id-page.js";
import { RecoveryJobGate } from "../../apps/key-derivation/src/ui/recovery-job-gate.js";
import { LinkedSources } from "../../apps/key-derivation/src/ui/recovery-linked-sources.js";
import type { RecoveryFeatureContext } from "../../apps/key-derivation/src/ui/recovery-workspace-shared.js";

/** Actual recovery services on native DOM/clipboard/file ports; no feature or crypto module is replaced. */
export class RecoveryFeatureFixture {
  readonly #page = new CompleteIdPage();
  readonly #jobs = new RecoveryJobGate();
  readonly #sources = new LinkedSources([]);
  readonly #context: RecoveryFeatureContext = {
    registry,
    detectTargets: detectMultiChainMatcherTargets,
    jobs: this.#jobs,
    mnemonicToSeed: (phrase, passphrase) => {
      this.#jobs.assertReady();
      return mnemonicToSeed(phrase, passphrase);
    },
    linkedValue: (target) => {
      this.#jobs.assertReady();
      return this.#sources.linkedValue(target);
    },
    linkedSourceRevealed: (target) => this.#sources.isRevealed(target),
    readMnemonic: (_target, selector) => {
      this.#jobs.assertReady();
      const field = this.#page.querySelector(selector);
      if (field === null) throw new Error("The synthetic native field is missing.");
      return field.value;
    },
    writeClipboard: async () => undefined,
    downloadText: () => undefined,
    useMnemonicInDeriver: (phrase) => {
      this.#page.require("mnemonic").value = phrase;
    },
  };

  /** Passive native tree with connectivity and ID controls, without a browser engine. */
  get page(): CompleteIdPage {
    return this.#page;
  }
  /** The real shared readiness gate; a fixture starts closed. */
  get jobs(): RecoveryJobGate {
    return this.#jobs;
  }
  /** The same guarded native services the workspace lends each installed feature. */
  get context(): RecoveryFeatureContext {
    return this.#context;
  }
}
