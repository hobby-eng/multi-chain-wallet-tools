// The wallet check that a search takes from its host: whether one checksum-valid phrase is the
// wallet that the person named, by a fingerprint, an address or a key. The date search, the word
// search and the restore of masked shares take it in this shape; the command line passes its
// Bitcoin evidence check (bitcoin-evidence.ts), a page its own derivation, which may answer later.
// With the text rule of a BIP32 master fingerprint, its comparison and the master key's path,
// which every search and wallet check takes without any package.

import { trimWhiteSpace } from "./white-space.js";

/** What the host's wallet check says of one phrase. */
export interface WalletMatch {
  readonly matched: boolean;
  /** Where the wallet matched, such as m or m/84'/0'/0'/0/0. */
  readonly path?: string | undefined;
  /** What the person should know of a match, such as that a fingerprint is only a filter. */
  readonly warning?: string | undefined;
}

/**
 * Compares a checksum-valid phrase with the wallet; it may answer at once or later, as a page's
 * WebCrypto derivation does.
 */
export type WalletCheck<M extends WalletMatch = WalletMatch> = (
  mnemonic: string,
) => M | PromiseLike<M>;

/** The refusal of an answer of a host's wallet check that is no WalletMatch. */
export const MALFORMED_WALLET_ANSWER =
  "The wallet check must answer with an object whose matched field is true or false.";

/**
 * The fields of a WalletMatch that a search reads, each read once from the host's `answer`, own or
 * inherited, as a class's getter is; undefined when the answer is no object.
 */
function readOnce(answer: unknown): Readonly<Record<keyof WalletMatch, unknown>> | undefined {
  if (typeof answer !== "object" || answer === null) return undefined;
  const { matched, path, warning } = answer as Readonly<Record<keyof WalletMatch, unknown>>;
  return { matched, path, warning };
}

/** Checked fields are fixed data; the host's extra accessors/methods keep their original receiver. */
function ownedAnswer(given: object, read: Readonly<Record<keyof WalletMatch, unknown>>): object {
  const fields = new Map<PropertyKey, PropertyDescriptor>();
  for (const key of Reflect.ownKeys(read))
    fields.set(key, { value: Reflect.get(read, key), enumerable: true });

  const prototype: object | null = Object.getPrototypeOf(given);
  const seen = new Set<object>();
  for (
    let owner: object | null = given;
    owner !== null && owner !== Object.prototype && !seen.has(owner);
    owner = Object.getPrototypeOf(owner) as object | null
  ) {
    seen.add(owner);
    for (const key of Reflect.ownKeys(owner)) {
      // A prototype's constructor identifies the class; it is not a result method to bind.
      if (fields.has(key) || (key === "constructor" && owner !== given)) continue;
      const field = Object.getOwnPropertyDescriptor(owner, key);
      if (field === undefined) continue;
      if ("value" in field) {
        if (typeof field.value === "function" && key !== "constructor")
          field.value = field.value.bind(given);
      } else {
        // Reading other getters here could throw or perform work the caller never requested.
        // Bound accessors remain lazy and can read the original class's private fields.
        if (field.get !== undefined) field.get = field.get.bind(given);
        if (field.set !== undefined) field.set = field.set.bind(given);
      }
      fields.set(key, field);
    }
  }
  return Object.create(prototype, Object.fromEntries(fields)) as object;
}

/**
 * What the host's `check` says of `mnemonic`, held to the WalletMatch contract. A JavaScript host
 * may answer anything, and a search that read undefined or { matched: "false" } as a match would
 * report a recovery that no wallet confirmed (AUD-014-API001): such an answer is refused, and only
 * matched === true counts. Every search asks the host's check through it; whether the search may
 * still publish what it found is asked when it does (search-turns.ts, assertStillRunning).
 */
export async function askWallet<M extends WalletMatch>(
  check: WalletCheck<M>,
  mnemonic: string,
): Promise<M> {
  const given: unknown = await check(mnemonic);
  // The fields a search reads are read once and kept as checked (AUD-015). Extra data remains
  // owned data, while getters/methods keep the host's receiver and private brand (AUD-016-API001).
  const read = readOnce(given);
  if (typeof read?.matched !== "boolean") throw new TypeError(MALFORMED_WALLET_ANSWER);
  return ownedAnswer(given as object, read) as M;
}

/**
 * The master fingerprint of a phrase with an empty BIP39 passphrase, as a host derives it; it may
 * answer later. The searches and the self-tests that compare fingerprints take it.
 */
export type PhraseFingerprint = (mnemonic: string) => string | PromiseLike<string>;

/** The path of the master key, where a master fingerprint or a master xpub matches. */
export const MASTER_KEY_PATH = "m";

/** Whether `path`, where a wallet matched, is the master key's, which names no place of its own. */
export function isMasterKeyPath(path: string | undefined): boolean {
  return path === MASTER_KEY_PATH;
}

/** The hexadecimal digits of a BIP32 master fingerprint: four bytes. */
export const FINGERPRINT_HEX_DIGITS = 8;
/** A BIP32 master fingerprint as text, in lower case. */
const FINGERPRINT_PATTERN = new RegExp(`^[0-9a-f]{${FINGERPRINT_HEX_DIGITS}}$`, "u");

/** Whether `value` is a master fingerprint as written after parsing: eight lowercase hex digits. */
export function isFingerprintText(value: string): boolean {
  return FINGERPRINT_PATTERN.test(value);
}

/** What the person should know of a fingerprint that matched. */
export const FINGERPRINT_WARNING =
  "A master fingerprint is only 32 bits and is a filter, not proof of recovery.";

/**
 * A master fingerprint as typed, in lower case; refused unless it is eight hexadecimal characters.
 * A host checks an answer with it at once: no secret is needed.
 */
export function parseMasterFingerprint(value: string): string {
  const fingerprint = trimWhiteSpace(value).toLowerCase();
  if (!isFingerprintText(fingerprint))
    throw new Error("A master fingerprint must be eight hexadecimal characters.");
  return fingerprint;
}

/**
 * The comparison of a derived fingerprint with the expected one, both parsed: a match at the
 * master key, with FINGERPRINT_WARNING, since 32 bits are only a filter. Every comparison of
 * fingerprints answers through it; wallet evidence adds its own fields.
 */
export function fingerprintMatch(derived: string, expected: string): WalletMatch {
  return Object.freeze({
    matched: derived === expected,
    path: MASTER_KEY_PATH,
    warning: FINGERPRINT_WARNING,
  });
}

/**
 * A wallet check by master fingerprint: the host's fingerprint of each phrase compared with
 * `expected`, already parsed (fingerprintMatch). The search of marked codes and the self-tests of
 * the searches check by it.
 */
export function fingerprintWalletCheck(
  fingerprintOf: PhraseFingerprint,
  expected: string,
): WalletCheck {
  return async (mnemonic) => fingerprintMatch(await fingerprintOf(mnemonic), expected);
}
