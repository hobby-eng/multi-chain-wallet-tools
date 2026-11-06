import { DerivationConsent, DerivationRequest } from "@ckd/coins/derivation-request.js";
import type { CoinAdapter } from "@ckd/coins/registry-base.js";
import type { DerivationControlValues, DerivationFeatureTab } from "./inputs.js";

interface LargeRequestPolicyOptions {
  readonly adapter: () => CoinAdapter;
  readonly activeFeatureTab: () => DerivationFeatureTab;
  readonly showConfirmation: () => void;
  readonly showStatus: (message: string) => void;
}

/** Displays the library's range-admission outcome without keeping a second confirmation rule. */
export class LargeRequestPolicy {
  readonly #options: LargeRequestPolicyOptions;
  readonly #consent = new DerivationConsent();

  constructor(options: LargeRequestPolicyOptions) {
    this.#options = options;
  }

  #request(input: DerivationControlValues): DerivationRequest {
    return new DerivationRequest(this.#options.adapter(), input, this.#options.activeFeatureTab());
  }

  /** Branches that the library selected for this workspace and range. */
  plannedBranches(input: DerivationControlValues) {
    return this.#request(input).branches;
  }

  /** Revoke any pending second-start confirmation. */
  clear(): void {
    this.#consent.clear();
  }

  /** Present a skipped range or confirmation question; true only when the library admits work. */
  authorize(input: DerivationControlValues, automatic: boolean): boolean {
    const request = this.#request(input);
    const outcome = this.#consent.consider(request, automatic);
    if (outcome === "ready") return true;
    const total = request.total.toLocaleString();
    if (outcome === "skipped") {
      this.#options.showStatus(
        `Automatic generation was skipped because this selection would derive ${total} results. Click Derive manually, then confirm the large request.`,
      );
      return false;
    }
    const branchCount = request.branches.length;
    const [lowMiB, highMiB] = request.memoryMiB;
    const memory = `roughly ${lowMiB.toLocaleString()}–${highMiB.toLocaleString()} MiB of result memory`;
    this.#options.showConfirmation();
    this.#options.showStatus(
      `Large request confirmation: ${total} results across ${branchCount} address branch${branchCount === 1 ? "" : "es"} in ${request.batches.toLocaleString()} visible batches; ${memory}. ` +
        "Keep the tab open and click “Confirm large request” to proceed. You can cancel at any time.",
    );
    return false;
  }
}
