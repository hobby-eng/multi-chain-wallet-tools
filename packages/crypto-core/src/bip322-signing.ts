import { Transaction } from "@scure/btc-signer";
import { bip322Library } from "./bip322-verifier.js";
import { hexToBytes, secp256k1, wipe } from "./crypto.js";
import type { MessageSignature } from "./message-signature.js";
import type { NetworkName } from "./types.js";
import { SigningMessage, SigningMessageError } from "./signing-message.js";

const PRIVATE_KEY_BYTES = secp256k1.Point.Fn.BYTES;
const X_ONLY_PUBLIC_KEY_BYTES = secp256k1.Point.Fp.BYTES;

// Standard P2PKH, P2SH, P2WPKH and P2TR output-script widths.
const MODES = {
  "bitcoin-bip322-legacy": { mode: "legacy-p2pkh", scriptBytes: 25, full: true },
  "bitcoin-bip322-nested": { mode: "nested-segwit", scriptBytes: 23, full: true },
  "bitcoin-bip322-native": { mode: "native-segwit", scriptBytes: 22, full: false },
  "bitcoin-bip322-taproot": { mode: "taproot", scriptBytes: 34, full: false },
} as const;
type ModeFacts = (typeof MODES)[keyof typeof MODES];

/** The four Bitcoin signing formats supported by the derivation worker. */
export type Bip322SigningFormat = keyof typeof MODES;
/** The address modes supported by the BIP-322 signer. */
export type Bip322SigningMode = ModeFacts["mode"];

const REFUSALS = {
  INVALID_KEY: "Message signing requires a valid 32-byte private key.",
  INVALID_REQUEST: "The message-signing request is malformed.",
  INVALID_NETWORK: "Select a supported message-signing network.",
  INVALID_MODE: "Select a supported BIP-322 address mode.",
  INVALID_FORMAT: "Select a supported message-signing format.",
  INVALID_SCRIPT: "The selected address has an invalid signing script.",
  MISSING_REDEEM_SCRIPT: "Nested SegWit message signing requires the P2WPKH redeem script.",
  MISSING_INTERNAL_KEY: "Taproot message signing requires the internal x-only public key.",
  SIGNING_FAILED: "The selected private key could not sign the BIP-322 transaction.",
  VERIFICATION_FAILED:
    "The generated BIP-322 signature did not verify against the selected address.",
  KEY_RELEASED: "The message-signing key is no longer available.",
  SIGNING_ACTIVE: "This message-signing key is already in use.",
  BACKEND_FAILED: "The BIP-322 signing operation failed.",
} as const;

/** Stable, input-free refusals from message-signing admission and verification. */
export class MessageSigningError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "MessageSigningError";
    this.code = code;
  }
}

/** Public script material needed to sign one derived address. */
export interface Bip322SigningRequest {
  readonly address: string;
  readonly message: string;
  readonly network: NetworkName;
  readonly mode: Bip322SigningMode;
  readonly scriptPubKeyHex: string;
  readonly redeemScriptHex?: string | undefined;
  readonly internalPublicKeyHex?: string | undefined;
}

function publicHex(value: unknown, byteLength: number): Uint8Array {
  if (typeof value !== "string" || value.length !== byteLength * 2 || !/^[0-9a-f]+$/iu.test(value))
    throw new MessageSigningError("INVALID_SCRIPT");
  return hexToBytes(value);
}

function base64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Owns one signing key, wiping its bytes after success, failure or explicit disposal. */
export class Bip322Signing {
  readonly #key: Uint8Array;
  #available = true;
  #active = false;

  constructor(privateKeyHex: string) {
    if (
      typeof privateKeyHex !== "string" ||
      privateKeyHex.length !== PRIVATE_KEY_BYTES * 2 ||
      !/^[0-9a-f]+$/iu.test(privateKeyHex)
    )
      throw new MessageSigningError("INVALID_KEY");
    this.#key = hexToBytes(privateKeyHex);
    if (!secp256k1.utils.isValidSecretKey(this.#key)) {
      this.wipe();
      throw new MessageSigningError("INVALID_KEY");
    }
  }

  /** Reads the worker format without defaulting an unknown value to another address mode. */
  static mode(format: unknown): Bip322SigningMode {
    const found = Object.entries(MODES).find(([name]) => name === format)?.[1];
    if (found === undefined) throw new MessageSigningError("INVALID_FORMAT");
    return found.mode;
  }

  /** Signs one request; the key is single-use and cleared before public verification. */
  async sign(request: Bip322SigningRequest): Promise<MessageSignature> {
    this.#requireKey();
    if (this.#active) throw new MessageSigningError("SIGNING_ACTIVE");
    this.#active = true;
    try {
      if (request === null || typeof request !== "object")
        throw new MessageSigningError("INVALID_REQUEST");
      const { address, message, network, mode } = request;
      if (typeof address !== "string" || address.length === 0)
        throw new MessageSigningError("INVALID_REQUEST");
      SigningMessage.require(message);
      if (network !== "mainnet" && network !== "testnet")
        throw new MessageSigningError("INVALID_NETWORK");
      const facts = Object.values(MODES).find((entry) => entry.mode === mode);
      if (facts === undefined) throw new MessageSigningError("INVALID_MODE");
      const script = publicHex(request.scriptPubKeyHex, facts.scriptBytes);
      const supplemental = this.#supplemental(request);
      const api = await bip322Library();
      this.#requireKey();
      // Version 2 and zero locktime/sequence preserve the existing full-message construction.
      const packet = facts.full
        ? api.bip322.buildToSignPacketFull(message, script, 2, 0, 0)
        : api.bip322.buildToSignPacketSimple(message, script);
      this.#requireKey();
      const rawPacket = Uint8Array.from(atob(packet), (character) => character.charCodeAt(0));
      const transaction = Transaction.fromPSBT(rawPacket);
      transaction.updateInput(0, supplemental);
      if (!transaction.signIdx(this.#key, 0)) throw new MessageSigningError("SIGNING_FAILED");
      this.wipe();
      transaction.finalizeIdx(0);
      const signature = facts.full
        ? `ful${base64(transaction.extract())}`
        : `smp${base64(api.bip322.serializeTxWitness(transaction.getInput(0).finalScriptWitness ?? []))}`;
      if (!api.bip322.verifyMessage(message, address, signature, network).valid)
        throw new MessageSigningError("VERIFICATION_FAILED");
      return { signature, format: facts.full ? "BIP-322 full" : "BIP-322 simple", verified: true };
    } catch (cause) {
      if (cause instanceof MessageSigningError || cause instanceof SigningMessageError) throw cause;
      // An external adapter can throw arbitrary text, including text pasted in a wrong field.
      throw new MessageSigningError("BACKEND_FAILED");
    } finally {
      this.#active = false;
      this.wipe();
    }
  }

  #supplemental(request: Bip322SigningRequest) {
    if (request.mode === "nested-segwit") {
      if (request.redeemScriptHex === undefined)
        throw new MessageSigningError("MISSING_REDEEM_SCRIPT");
      return {
        redeemScript: publicHex(
          request.redeemScriptHex,
          MODES["bitcoin-bip322-native"].scriptBytes,
        ),
      };
    }
    if (request.mode === "taproot") {
      if (request.internalPublicKeyHex === undefined)
        throw new MessageSigningError("MISSING_INTERNAL_KEY");
      return {
        tapInternalKey: publicHex(request.internalPublicKeyHex, X_ONLY_PUBLIC_KEY_BYTES),
      };
    }
    return {};
  }

  #requireKey(): void {
    if (!this.#available) throw new MessageSigningError("KEY_RELEASED");
  }

  /** Best-effort clearing of mutable key bytes; JavaScript memory erasure is not guaranteed. */
  wipe(): void {
    wipe(this.#key);
    this.#available = false;
  }

  /** Releases the key when used in an explicit resource scope. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
