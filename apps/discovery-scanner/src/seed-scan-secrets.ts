import { assertValidMnemonic, mnemonicToSeed } from "@ckd/core/bip39.js";
import { disposeSecretBytes } from "@ckd/secret-boundary/secret-guard.js";
import { ScanSecrets } from "./scan-secrets.js";
import type { RecoveryNetworkGateway } from "./network-gateway.js";
import type { RecoveryScanContext, RecoverySeedInput } from "./types.js";

/** Seed derivation stays outside the graph of public-only scan adapters. */
export class SeedScanSecrets {
  readonly #secrets: ScanSecrets;
  readonly #seeds: Uint8Array[] = [];

  constructor(context: Pick<RecoveryScanContext, "sessionSecretGuard">) {
    this.#secrets = new ScanSecrets(context);
  }

  static forSeed(
    input: Pick<RecoverySeedInput, "mnemonic" | "passphrase">,
    context: Pick<RecoveryScanContext, "sessionSecretGuard" | "networkApi" | "networkLimiter">,
  ): { secrets: SeedScanSecrets; seed: Uint8Array; gateway: RecoveryNetworkGateway } {
    const secrets = new SeedScanSecrets(context);
    try {
      return { secrets, seed: secrets.seed(input), gateway: secrets.gateway(context) };
    } catch (cause) {
      secrets.close();
      throw cause;
    }
  }

  get guard() {
    return this.#secrets.guard;
  }

  seed(input: Pick<RecoverySeedInput, "mnemonic" | "passphrase">): Uint8Array {
    const mnemonic = assertValidMnemonic(input.mnemonic);
    const seed = mnemonicToSeed(mnemonic, input.passphrase);
    this.#seeds.push(seed);
    this.#secrets.registerString("BIP39 mnemonic", mnemonic);
    this.#secrets.registerString("BIP39 passphrase", input.passphrase);
    this.#secrets.registerBytes("BIP39 seed", seed);
    return seed;
  }

  gateway(context: Pick<RecoveryScanContext, "networkApi" | "networkLimiter">) {
    return this.#secrets.gateway(context);
  }

  close(): void {
    disposeSecretBytes(...this.#seeds.splice(0));
    this.#secrets.close();
  }
}
