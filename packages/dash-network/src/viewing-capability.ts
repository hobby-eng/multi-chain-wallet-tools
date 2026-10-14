import {
  normalizeViewingKey,
  type NormalizedViewingKey,
  type ViewingKeyInputMode,
} from "./viewing-key.js";
import type { ViewerNetwork } from "./types.js";

interface ViewingCapabilityValidation {
  normalize?: typeof normalizeViewingKey;
  canonical?: (key: NormalizedViewingKey) => void;
}

/** Owns local viewing material from network admission until its scan or preflight ends. */
export class OrchardViewingCapability {
  readonly #key: NormalizedViewingKey;

  private constructor(key: NormalizedViewingKey) {
    this.#key = key;
  }

  static open(
    value: string,
    mode: ViewingKeyInputMode,
    network: ViewerNetwork,
    validation: ViewingCapabilityValidation = {},
  ): OrchardViewingCapability {
    const key = (validation.normalize ?? normalizeViewingKey)(value, mode);
    const capability = new OrchardViewingCapability(key);
    try {
      if (key.bundleNetwork !== undefined && key.bundleNetwork !== network) {
        throw new Error(
          `This viewing bundle is for ${key.bundleNetwork}; select that network before scanning.`,
        );
      }
      validation.canonical?.(key);
      return capability;
    } catch (cause) {
      capability.dispose();
      throw cause;
    }
  }

  get normalized(): NormalizedViewingKey {
    return this.#key;
  }

  get kind(): NormalizedViewingKey["kind"] {
    return this.#key.kind;
  }

  dispose(): void {
    this.#key.hex = "";
  }
}
