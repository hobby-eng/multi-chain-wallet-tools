import type { ResultExportContext } from "./result-export-controller.js";
import type { ClipboardAction } from "@ckd/ui/clipboard-action.js";
import type { ResultBranch } from "./result-branches.js";
import type { DerivationResult } from "@ckd/core/types.js";
import type { DerivationWorkerClient } from "../workers/derive-client.js";

interface ChildMessageSigning {
  activeSource(): "main" | "bip85" | null;
  close(): void;
  offers(
    resultId: string,
    addressKey: string,
  ): readonly import("../workers/protocol.js").MessageSigningFormat[];
  open(
    result: DerivationResult,
    branch: ResultBranch,
    source: "bip85",
    index: number,
    address: string,
    addressKey: string,
  ): void;
}

/** Native edges shared by the parent BIP85 panel and its optional child wallet. */
export interface Bip85ChildWalletOptions {
  document: Document;
  coinFamilies: typeof import("@ckd/coins/registry.js").COIN_FAMILIES;
  getAdapterFamilyId: typeof import("@ckd/coins/registry.js").getAdapterFamilyId;
  getCoinAdapter: typeof import("@ckd/coins/registry.js").getCoinAdapter;
  getDefaultCoinAdapter: typeof import("@ckd/coins/registry.js").getDefaultCoinAdapter;
  mnemonic(): string | null;
  cryptoReady(): boolean;
  secretsRevealed(): boolean;
  setSecretsRevealed(revealed: boolean): void;
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  messageSigning?: ChildMessageSigning;
  /** Present when the build includes Silent Payments; the child reuses the original wallet's feature module. */
  installSilentPaymentFeature?: typeof import("./silent-payment-feature.js").installSilentPaymentFeature;
  /** The shared owner admits disclosure before evaluating a lazy private-field source. */
  copyText: ClipboardAction["copy"];
  copyBulkFrom(
    button: HTMLButtonElement,
    action: unknown,
    context: ResultExportContext,
  ): Promise<void>;
  downloadRowsFrom(
    button: HTMLButtonElement,
    action: unknown,
    context: ResultExportContext,
    onFinished: () => void,
  ): Promise<void>;
  downloadText(text: string, fileName: string, mimeType: string): void;
  /** Revoke pending exports borrowed from this child result before it is released. */
  invalidateExports?(): void;
  showError(message: string): void;
  showStatus(message: string): void;
}
