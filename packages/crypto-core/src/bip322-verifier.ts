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

/** A backend failure says nothing about signature validity and retains no input or raw cause. */
export class Bip322VerificationError extends Error {
  readonly code = "VERIFICATION_UNAVAILABLE";

  constructor() {
    super("The BIP-322 verification operation failed.");
    this.name = "Bip322VerificationError";
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
      // btcutil-js 0.4.2 exposes script codes and a full transaction's message commitment only
      // in Error text. Both mismatch adapters have real-backend negative controls.
      if (
        cause instanceof Error &&
        (SCRIPT_MISMATCH.test(cause.message) || FULL_MESSAGE_MISMATCH.test(cause.message))
      )
        return { valid: false };
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
