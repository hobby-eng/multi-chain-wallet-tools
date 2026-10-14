// Encrypts a candidate list with age (docs/CANDIDATES.md, "Encryption"), one module for every host:
// MnemoCode, the Wallet Deriver and the Discovery Scanner compile it unchanged. A list goes either
// to the Scanner's one-time X25519 key (age1…) or, as a separate file, under a passphrase through
// scrypt; never both and never to more than one key, since a file is only as strong as its weakest
// stanza and age-encryption itself would accept a mix. ListProtection, at the end, is the entry:
// the three ways to protect a list behind one interface, chosen once. It also holds the rule for
// the passphrase of a list (parseListPassphrase), so that every host accepts the same ones.
//
// From the host it needs crypto.getRandomValues and, for X25519 only, WebCrypto (crypto.subtle),
// which a browser offers only on a secure page; without it the X25519 operations refuse at once
// with one line, while the passphrase operations work, since age takes scrypt and its ciphers from
// @noble. It reads and writes no file and asks nothing; its only package import is age-encryption,
// and its shared admission policy is host-neutral too.

import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import { Redacted } from "./redacted.js";
import { withoutByteOrderMark } from "./white-space.js";
import { describeError } from "./refusal.js";
import { listInWords } from "./places.js";
import {
  CandidateFileAdmission,
  SCRYPT_LOG_N,
  type ListFileLock,
} from "./candidate-file-admission.js";
import { CandidateFileRefusedError } from "./candidate-file-refusal.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.candidate-encryption", {
  "no-webcrypto": () => NO_WEBCRYPTO,
  "key-one-age-key-62-characters-starts-age1": () =>
    "The key must be one age key of 62 characters that starts with age1, as the Scanner shows it.",
  "use-at-least-characters-passphrase-all-protects-seed": (value0: string) =>
    `Use at least ${value0} characters for the passphrase: it is all that protects these seed phrases.`,
  "passphrase-candidates-empty": () => "The passphrase for the candidates is empty.",
  "not-protection-choice": { kind: "type", text: () => NOT_A_PROTECTION_CHOICE },
});

// Keep the existing import paths valid for hosts that already use this module.
export { CandidateFileRefusedError, type CandidateFileProblem } from "./candidate-file-refusal.js";
export { SCRYPT_LOG_N, type ListFileLock } from "./candidate-file-admission.js";

/** An X25519 recipient: "age1", then 58 Bech32 characters (age-encryption.org/v1). */
const X25519_RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/u;
/** Shorter list passphrases are refused: the passphrase is all that protects the seed phrases. */
export const MIN_LIST_PASSPHRASE_LENGTH = 12;
const NO_WEBCRYPTO =
  "An age key (X25519) needs WebCrypto (crypto.subtle), which is missing here: a browser offers it only on a secure page, opened as a file, from localhost or over https.";
/** Bound age's temporary reads: its nonce reader concatenates the input chunks it receives. */
const ENCRYPTED_READ_CHUNK_BYTES = 64 * 1024;

/**
 * Refuses X25519 where WebCrypto is missing, as on a page served over plain http from another
 * computer. age-encryption falls back to @noble only when `crypto` is missing altogether or
 * rejects X25519 as not supported; without crypto.subtle it would fail deep inside with a bare
 * TypeError ("Cannot read properties of undefined") that tells a person nothing.
 */
function requireWebCryptoX25519(): void {
  if (typeof globalThis.crypto?.subtle?.importKey !== "function")
    throw ERRORS.create("no-webcrypto", []);
}

/** A one-time key: the identity that opens the file, and the recipient a writer encrypts to. */
export interface SessionIdentity {
  /** AGE-SECRET-KEY-1…: keep it only for the session, never write it down. */
  readonly identity: string;
  /** age1…, 62 characters, to copy into the program that writes the list. */
  readonly recipient: string;
}

/** Makes a one-time X25519 key; X25519 explicitly, whatever age-encryption's default becomes. */
export async function createSessionIdentity(): Promise<SessionIdentity> {
  requireWebCryptoX25519();
  const identity = await generateX25519Identity();
  return { identity, recipient: await identityToRecipient(identity) };
}

/**
 * The recipient as typed, pasted or read from a file: one age1… key, in any case. Its Bech32
 * checksum is checked here too, so that a typing error shows before any search.
 */
export function parseRecipient(text: string): string {
  const recipient = text.trim().toLowerCase();
  const refused = ERRORS.create("key-one-age-key-62-characters-starts-age1", []);
  if (!X25519_RECIPIENT.test(recipient)) throw refused;
  try {
    // Decodes the Bech32 text and checks its checksum and length, without encrypting anything.
    new Encrypter().addRecipient(recipient);
  } catch {
    throw refused;
  }
  return recipient;
}

/** Encrypts a list to the Scanner's one-time key. */
export async function encryptCandidates(plain: Uint8Array, recipient: string): Promise<Uint8Array> {
  CandidateFileAdmission.assertSize(plain.byteLength, "plaintext");
  requireWebCryptoX25519();
  const encrypter = new Encrypter();
  encrypter.addRecipient(parseRecipient(recipient));
  return encrypter.encrypt(plain);
}

/**
 * The passphrase of a list as docs/CANDIDATES.md defines it: the text as entered, without white
 * space at its ends; from a file also without a byte order mark. A short one is refused.
 */
export function parseListPassphrase(text: string): string {
  const passphrase = withoutByteOrderMark(text).trim();
  // Characters as a person counts them: code points, not UTF-16 units.
  if (Array.from(passphrase).length < MIN_LIST_PASSPHRASE_LENGTH)
    throw ERRORS.create("use-at-least-characters-passphrase-all-protects-seed", [
      `${MIN_LIST_PASSPHRASE_LENGTH}`,
    ]);
  return passphrase;
}

/**
 * Encrypts a list under a passphrase, at the fixed scrypt work factor. The passphrase is used as
 * given: a host reads it with parseListPassphrase first.
 */
export async function encryptCandidatesWithPassphrase(
  plain: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  CandidateFileAdmission.assertSize(plain.byteLength, "plaintext");
  if (passphrase === "") throw ERRORS.create("passphrase-candidates-empty", []);
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  encrypter.setScryptWorkFactor(SCRYPT_LOG_N);
  return encrypter.encrypt(plain);
}

/**
 * How a host chooses to protect a list: to the Scanner's key, under a passphrase, or not at all.
 */
export type ListProtectionChoice =
  | { readonly kind: "key"; readonly recipient: string }
  | { readonly kind: "passphrase"; readonly passphrase: string }
  | { readonly kind: "none" };

/** The shared admission policy, retained under the original public function name. */
export function listFileLock(file: Uint8Array): ListFileLock {
  return CandidateFileAdmission.lock(file);
}

/**
 * Decrypts a candidate file with the session identity or with a passphrase, after checking that
 * its header has exactly one stanza, of the kind that key opens (listFileLock). The whole file is
 * authenticated before it is returned.
 */
export async function decryptCandidates(
  file: Uint8Array,
  key: { readonly identity: string } | { readonly passphrase: string },
): Promise<Uint8Array> {
  const given: ListFileLock = "identity" in key ? "key" : "passphrase";
  CandidateFileAdmission.assertLock(file, given);
  if (given === "key") requireWebCryptoX25519();
  const decrypter = new Decrypter();
  if ("identity" in key) {
    try {
      decrypter.addIdentity(key.identity);
    } catch {
      // The decoder includes a malformed private identity in its error. Neither that diagnostic
      // nor its cause may reach a host's UI, inspection or logging.
      throw new CandidateFileRefusedError("key", "This Scanner key is not a valid age identity.");
    }
  } else decrypter.addPassphrase(key.passphrase);
  // Given bytes, age reads its output through a fetch Response, and a browser replaces any error
  // inside it with its own ("Failed to fetch", "The operation was aborted"): given a stream, it
  // returns the stream unread, and its own error, such as "invalid tag", reaches every host.
  let stream: ReadableStream<Uint8Array>;
  try {
    // The header: a key that opens no stanza fails here, and so does a stanza changed on its way,
    // which age cannot tell apart from a wrong key.
    stream = await decrypter.decrypt(streamOf(file));
  } catch (error) {
    const what = given === "key" ? "This Scanner key" : "This passphrase";
    throw new CandidateFileRefusedError(
      "key",
      `${what} does not open the candidate file, or its header is damaged (${describeError(error)}).`,
      error,
    );
  }
  try {
    return await CandidateFileAdmission.readPlaintext(stream);
  } catch (error) {
    if (error instanceof CandidateFileRefusedError) throw error;
    // The contents: every chunk carries its own tag, so a changed or cut file fails here.
    throw new CandidateFileRefusedError(
      "damaged",
      `The candidate file is damaged (${describeError(error)}).`,
      error,
    );
  }
}

/**
 * Borrowed ciphertext views: age never needs a temporary copy of the entire file to read a nonce.
 */
function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      const end = Math.min(bytes.byteLength, offset + ENCRYPTED_READ_CHUNK_BYTES);
      if (end > offset) controller.enqueue(bytes.subarray(offset, end));
      offset = end;
      if (offset === bytes.byteLength) controller.close();
    },
  });
}

/**
 * How a candidate list file is protected: to the Scanner's key, under a passphrase, or, only on
 * the person's explicit request, not at all. Each is its own type behind this interface, so that a
 * host chooses once and then saves a list the same way whichever it is.
 */
export interface ListProtection {
  /** Whether the file is encrypted; one that is not holds seed phrases in the open. */
  readonly encrypted: boolean;
  /** How the saved file is protected, as the line that reports a save says it. */
  readonly description: string;
  /** The file to write for an encoded list (encodeCandidateList). */
  protect(list: Uint8Array): Promise<Uint8Array>;
}

/** A list encrypted to the Discovery Scanner's one-time X25519 key (age1…). */
export class ScannerKeyProtection implements ListProtection {
  readonly #recipient: string;

  /** Takes the key as typed, pasted or read from a file, and refuses one that is not an age key. */
  constructor(key: string) {
    this.#recipient = parseRecipient(key);
  }

  // Getters, not readonly fields, which a caller could overwrite at run time: what the object says
  // of the file must stay what protect does.
  get encrypted(): boolean {
    return true;
  }

  get description(): string {
    return "encrypted to the Scanner's key";
  }

  /** The key, age1… in lower case: a public key, which may be shown. */
  get recipient(): string {
    return this.#recipient;
  }

  protect(list: Uint8Array): Promise<Uint8Array> {
    return encryptCandidates(list, this.#recipient);
  }
}

/**
 * A list encrypted under a passphrase through scrypt. A class pays off here: the passphrase is
 * read by the rule of parseListPassphrase, so that a short one cannot be used, and it is kept only
 * here, never shown through toString, toJSON or Node's inspect.
 */
export class PassphraseProtection extends Redacted implements ListProtection {
  readonly #passphrase: string;

  /** Takes the passphrase as typed or read from a file (parseListPassphrase). */
  constructor(text: string) {
    super("PassphraseProtection");
    this.#passphrase = parseListPassphrase(text);
  }

  // Getters, as in ScannerKeyProtection: they cannot be overwritten.
  get encrypted(): boolean {
    return true;
  }

  get description(): string {
    return "encrypted with the passphrase";
  }

  protect(list: Uint8Array): Promise<Uint8Array> {
    return encryptCandidatesWithPassphrase(list, this.#passphrase);
  }
}

/** A list written without encryption, only on the person's explicit request. */
export class NoProtection implements ListProtection {
  // Getters, as in ScannerKeyProtection: a list in the open must never be reported as encrypted.
  get encrypted(): boolean {
    return false;
  }

  get description(): string {
    return "NOT encrypted";
  }

  /** The list itself, the same bytes. */
  protect(list: Uint8Array): Promise<Uint8Array> {
    CandidateFileAdmission.assertSize(list.byteLength, "plaintext");
    return Promise.resolve(list);
  }
}

/** The fields of each kind of ListProtectionChoice besides its kind, each a string. */
const CHOICE_FIELDS = Object.freeze({
  key: ["recipient"],
  passphrase: ["passphrase"],
  none: [],
} as const) satisfies Readonly<Record<ListProtectionChoice["kind"], readonly string[]>>;

/** Each kind of choice as a host writes it, such as `{ kind: "key", recipient }`. */
const CHOICE_SHAPES = Object.entries(CHOICE_FIELDS).map(
  ([kind, fields]) => `{ kind: "${kind}"${fields.map((field) => `, ${field}`).join("")} }`,
);

/** Why a choice is refused that is not one of ListProtectionChoice; it repeats nothing given. */
const NOT_A_PROTECTION_CHOICE =
  `The protection of a candidate list must be ${listInWords(CHOICE_SHAPES, "or")}, ` +
  "each field a text and no other field.";

/**
 * `choice` as ListProtectionChoice, or a TypeError: a JavaScript or parsed host may pass a kind
 * that is misspelt, missing or inherited, or fields of another kind, and none of these may fall
 * through to a list in the open (AUD-014-SEC001). Only an own kind of CHOICE_FIELDS is taken, with
 * exactly its own fields, each a string. The choice is copied once and the copy is checked and
 * returned: a host's object may answer differently when it is read again (AUD-015).
 */
function checkedChoice(given: unknown): ListProtectionChoice {
  if (typeof given !== "object" || given === null) throw ERRORS.create("not-protection-choice", []);
  const choice: object = { ...given };
  const fields = choice as Readonly<Record<string, unknown>>;
  const kind = Object.hasOwn(choice, "kind") ? fields["kind"] : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CHOICE_FIELDS, kind))
    throw ERRORS.create("not-protection-choice", []);
  const wanted: readonly string[] = CHOICE_FIELDS[kind as ListProtectionChoice["kind"]];
  // Own enumerable names, as many as the kind has and each one of them: no field is missing, and
  // none of another kind, such as a passphrase beside "none", comes along unread.
  const names = Object.keys(choice);
  if (
    names.length !== wanted.length + 1 ||
    !names.every((name) => name === "kind" || wanted.includes(name)) ||
    !wanted.every((name) => typeof fields[name] === "string")
  )
    throw ERRORS.create("not-protection-choice", []);
  return choice as ListProtectionChoice;
}

/**
 * The protection that a host's `choice` names (ListProtectionChoice); a list in the open only for
 * an explicit `{ kind: "none" }`, and anything else that is not one of the three is refused.
 */
export function protectionFor(choice: ListProtectionChoice): ListProtection {
  const checked = checkedChoice(choice);
  switch (checked.kind) {
    case "key":
      return new ScannerKeyProtection(checked.recipient);
    case "passphrase":
      return new PassphraseProtection(checked.passphrase);
    case "none":
      return new NoProtection();
  }
}
