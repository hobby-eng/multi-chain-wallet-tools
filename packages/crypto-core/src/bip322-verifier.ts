import { init, type TimeConstraints } from "btcutil-js";
import wasm from "btcutil-js-wasm";
import { SigningMessage } from "./signing-message.js";

type Bip322Network = "mainnet" | "testnet" | "regtest";
interface Bip322Verification {
  readonly valid: boolean;
  readonly timeConstraints?: TimeConstraints;
}
const SCRIPT_MISMATCH = /^verify message: invalid signature: err_code=Err[A-Za-z0-9]+, err_desc=/u;
const FULL_MESSAGE_MISMATCH =
  /^verify message: invalid to_sign transaction: to_sign first input prev hash [0-9a-f]{64} does not match to_spend txid [0-9a-f]{64}$/u;
// Text that is no BIP-322 signature at all: not Base64, too short, or no witness, full
// transaction or proof-of-funds packet. A compact BIP137 signature fails here as a witness.
const UNREADABLE_SIGNATURE =
  /^verify message: (?:error decoding signature as base64: |error parsing signature as (?:witness|full variant|pof variant): |signature too short$)/u;
// A simple signature, a bare witness, for an address that only a full signature can prove.
const SIMPLE_FOR_ADDRESS =
  /^verify message: only native SegWit outputs \(P2WPKH, P2WSH, P2TR\) are supported for the simple variant$/u;

const REFUSALS = {
  VERIFICATION_UNAVAILABLE: "The BIP-322 verification operation failed.",
  UNREADABLE_SIGNATURE: "The signature is not a BIP-322 signature.",
  SIMPLE_FOR_ADDRESS:
    "A BIP-322 simple signature proves only native SegWit addresses; this address needs a full one.",
} as const;

/**
 * A refusal that says nothing about the signature's validity and retains no input or raw cause:
 * a backend failure, or text that is no BIP-322 signature.
 */
export class Bip322VerificationError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS = "VERIFICATION_UNAVAILABLE") {
    super(REFUSALS[code]);
    this.name = "Bip322VerificationError";
    this.code = code;
  }
}
/** Owns the shared backend and distinguishes a script refusal from an operational failure. */
export class Bip322Verifier {
  #initialization: ReturnType<typeof init> | null = null;

  /** Initializes the pinned local backend once, without network access. */
  library(): ReturnType<typeof init> {
    this.#initialization ??= init(Uint8Array.from(wasm).buffer);
    return this.#initialization;
  }

  /** Returns a signature mismatch; backend and malformed-input failures still reject. */
  async verify(
    message: string,
    address: string,
    signature: string,
    network: Bip322Network,
  ): Promise<Bip322Verification> {
    SigningMessage.require(message, true);
    let api: Awaited<ReturnType<typeof init>>;
    try {
      api = await this.library();
    } catch {
      throw new Bip322VerificationError();
    }
    try {
      return api.bip322.verifyMessage(message, address.trim(), signature.trim(), network);
    } catch (cause) {
      // btcutil-js 0.4.2 exposes script codes, a full transaction's message commitment and its
      // parse failures only in Error text. Each adapter has real-backend controls.
      if (
        cause instanceof Error &&
        (SCRIPT_MISMATCH.test(cause.message) || FULL_MESSAGE_MISMATCH.test(cause.message))
      )
        return { valid: false };
      if (cause instanceof Error && UNREADABLE_SIGNATURE.test(cause.message))
        throw new Bip322VerificationError("UNREADABLE_SIGNATURE");
      if (cause instanceof Error && SIMPLE_FOR_ADDRESS.test(cause.message))
        throw new Bip322VerificationError("SIMPLE_FOR_ADDRESS");
      throw new Bip322VerificationError();
    }
  }
}

const verifier = new Bip322Verifier();
/** The BIP-322 library, its WebAssembly started once for every caller that signs or verifies. */
export function bip322Library(): ReturnType<typeof init> {
  return verifier.library();
}
/** Verifies a BIP-322 message, returning script mismatches and propagating other failures. */
export async function verifyBip322Message(
  message: string,
  address: string,
  signature: string,
  network: Bip322Network,
): Promise<Bip322Verification> {
  return verifier.verify(message, address, signature, network);
}
