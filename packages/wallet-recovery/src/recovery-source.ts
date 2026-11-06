import { englishMnemonicToEntropy } from "@ckd/core/bip39.js";

const SOURCE_KINDS = ["main", "bip85"] as const;
const SOURCE_TARGETS = [
  "matcher",
  "seedqr",
  "mnemocode",
  "mhfe",
  "slip39",
  "codex32",
  "sskr",
  "gordian-envelope",
] as const;

/** Workflows that accept a linked phrase; feature modules use this same admitted shape. */
export type RecoverySourceTarget = (typeof SOURCE_TARGETS)[number];
type SourceKind = (typeof SOURCE_KINDS)[number];

interface RecoverySourceValue {
  readonly mnemonic: string;
  readonly passphrase: string;
}

/** A phrase-free capability; a changed or retired source returns null from a temporary read. */
export interface RecoverySourceReference {
  readonly label: string;
  read(): RecoverySourceValue | null;
}

/** Borrowed source providers; selecting a child never obtains the original capability. */
export interface RecoverySourceProviders {
  originalReference(): RecoverySourceReference;
  childReference(): RecoverySourceReference | null;
}

/** Stable input-free route refusals, translated by the receiving front end. */
export type RecoverySourceRouteErrorCode =
  | "recovery.source.kind"
  | "recovery.source.target"
  | "recovery.source.child-missing"
  | "recovery.source.original-phrase";

/** An unsupported route or an unavailable/unusable selected phrase. */
export class RecoverySourceRouteError extends Error {
  readonly code: RecoverySourceRouteErrorCode;
  constructor(code: RecoverySourceRouteErrorCode) {
    super(code);
    this.name = "RecoverySourceRouteError";
    this.code = code;
  }
}

/** Admits both native choices before obtaining a source, then lends only its capability. */
export class RecoverySourceRoute {
  readonly #source: SourceKind;
  readonly #target: RecoverySourceTarget;

  /** Unknown choices are refused without coercion, defaults or entered text in the failure. */
  constructor(source: unknown, target: unknown) {
    const sourceKind = SOURCE_KINDS.find((candidate) => candidate === source);
    if (sourceKind === undefined) throw new RecoverySourceRouteError("recovery.source.kind");
    const destination = SOURCE_TARGETS.find((candidate) => candidate === target);
    if (destination === undefined) throw new RecoverySourceRouteError("recovery.source.target");
    this.#source = sourceKind;
    this.#target = destination;
  }

  /** The admitted workflow; its installed feature still owns whether it is available in a build. */
  get target(): RecoverySourceTarget {
    return this.#target;
  }

  /** Validate an original English BIP39 phrase; the child provider already owns BIP85 validity. */
  resolve(providers: RecoverySourceProviders): RecoverySourceReference {
    if (this.#source === "bip85") {
      const reference = providers.childReference();
      if (reference === null) throw new RecoverySourceRouteError("recovery.source.child-missing");
      return reference;
    }
    const reference = providers.originalReference();
    let entropy: Uint8Array | undefined;
    try {
      const source = reference.read();
      if (source === null) throw new RecoverySourceRouteError("recovery.source.original-phrase");
      entropy = englishMnemonicToEntropy(source.mnemonic);
      return reference;
    } catch {
      throw new RecoverySourceRouteError("recovery.source.original-phrase");
    } finally {
      entropy?.fill(0);
    }
  }
}
