import { assertIndex } from "@ckd/core/bip32-limits.js";
import { KIBIBYTE } from "@ckd/core/byte-units.js";
import type { NetworkName } from "@ckd/core/types.js";

const CODES = [
  "silent-payment.network",
  "silent-payment.account",
  "silent-payment.labels",
  "silent-payment.label-count",
  "silent-payment.label-text",
  "silent-payment.scalar",
] as const;
/** Stable refusal identity, without supplied text or key material. */
export type SilentPaymentErrorCode = (typeof CODES)[number];
/** A refused Silent Payments parameter or unusable derived scalar. */
export class SilentPaymentError extends Error {
  readonly code: SilentPaymentErrorCode;
  constructor(code: SilentPaymentErrorCode) {
    super(code);
    this.name = "SilentPaymentError";
    this.code = code;
  }
  /** Recognizes the same code after a worker reconstructs the native Error. */
  static codeOf(cause: unknown): SilentPaymentErrorCode | undefined {
    if (!(cause instanceof Error) || !("code" in cause)) return undefined;
    return CODES.find((code) => code === cause.code);
  }
}
const MAX_LABELS = 200;
// BIP352 labels are uint32; zero belongs to the mandatory change address.
const MAX_LABEL_INDEX = 2 ** 32 - 1;
// Raw text is bounded before split/trim, independently of the number of unique labels.
const MAX_LABEL_TEXT_UNITS = 64 * KIBIBYTE;

/** Public parameter snapshot shared by the page and the derivation worker, before any seed copy. */
export class SilentPaymentParameters {
  readonly #network: NetworkName;
  readonly #account: number;
  readonly #labels: readonly number[];
  constructor(network: unknown, account: unknown, labels: unknown = []) {
    if (network !== "mainnet" && network !== "testnet")
      throw new SilentPaymentError("silent-payment.network");
    if (typeof account !== "number") throw new SilentPaymentError("silent-payment.account");
    try {
      assertIndex(account, "Silent Payment account");
    } catch {
      throw new SilentPaymentError("silent-payment.account");
    }
    if (!Array.isArray(labels)) throw new SilentPaymentError("silent-payment.labels");
    if (labels.length > MAX_LABELS) throw new SilentPaymentError("silent-payment.label-count");
    const supplied: readonly unknown[] = labels;
    const checked: number[] = [];
    for (const label of supplied) {
      if (
        typeof label !== "number" ||
        !Number.isSafeInteger(label) ||
        label < 1 ||
        label > MAX_LABEL_INDEX
      )
        throw new SilentPaymentError("silent-payment.labels");
      checked.push(label);
    }
    this.#network = network;
    this.#account = account;
    this.#labels = Object.freeze([...new Set(checked)].sort((left, right) => left - right));
  }
  /** Parse native fields with no fallback network or empty-to-zero coercion. */
  static fromFields(network: string, account: string, labels: string): SilentPaymentParameters {
    if (labels.length > MAX_LABEL_TEXT_UNITS)
      throw new SilentPaymentError("silent-payment.label-text");
    const rawLabels = labels.trim() === "" ? [] : labels.split(",");
    if (rawLabels.length > MAX_LABELS) throw new SilentPaymentError("silent-payment.label-count");
    const values = rawLabels
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number);
    return new SilentPaymentParameters(
      network,
      account.trim() === "" ? Number.NaN : Number(account),
      values,
    );
  }
  /** Selected network; only mainnet and testnet are supported. */
  get network(): NetworkName {
    return this.#network;
  }
  /** Ordinary BIP32 account index, before hardening, in the inclusive BIP32 range. */
  get account(): number {
    return this.#account;
  }
  /** Ascending, unique nonzero uint32 labels, independent of the input array. */
  get labels(): readonly number[] {
    return this.#labels;
  }
  /** Admission and native field limits; text length is in UTF-16 code units. */
  static parameters() {
    return Object.freeze({
      maxLabels: MAX_LABELS,
      maxLabelIndex: MAX_LABEL_INDEX,
      maxLabelTextUnits: MAX_LABEL_TEXT_UNITS,
    });
  }
}
