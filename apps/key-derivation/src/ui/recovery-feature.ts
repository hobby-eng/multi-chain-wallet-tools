// The contract between Recover & Back Up and its feature modules. The workspace knows no feature by
// name: the build selects modules by feature flag (build-key-derivation-html.mjs), and each module
// describes itself here, so that adding one never changes the workspace.
import type { RecoverySourceTarget } from "./recovery-source-link.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The text of a linked phrase card for every backup that keeps only the phrase. */
export const PHRASE_ONLY_NOTE =
  "Only mnemonic entropy is backed up; the separate BIP39 passphrase is not included.";

/**
 * Where a feature takes a recovery phrase, so that the workspace can link the phrase of Generate &
 * Derive into it, offer it while the field is empty, and hide and clear the manual fields meanwhile.
 */
export interface RecoveryPhraseSlot {
  readonly target: RecoverySourceTarget;
  /** The feature's panel, without "#". */
  readonly panelId: string;
  /** The field where a phrase is typed by hand. */
  readonly phraseField: string;
  /** A passphrase field that belongs to the phrase. */
  readonly passphraseField?: string;
  /** A block that holds all manual fields and is hidden as a whole while a phrase is linked. */
  readonly manualBlock?: string;
  /** What the linked phrase card says about the BIP39 passphrase. */
  readonly linkedNote: string;
}

/** One module of Recover & Back Up. */
export interface RecoveryFeature {
  /** Absent for a module that adds to another one, such as MnemoCode card export. */
  readonly phraseSlot?: RecoveryPhraseSlot;
  install(context: RecoveryFeatureContext): void;
}
