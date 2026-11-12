import type { CoinDerivationInput } from "@ckd/coins/registry.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import type { DerivationResult } from "@ckd/core/types.js";
import type { MessageSignature } from "@ckd/core/message-signature.js";
import type { MessageSigningRequest } from "@ckd/coins/message-signing.js";
import type { SilentPaymentResult } from "./silent-payment.js";
import type { Bip85RequestOptions, Bip85Result } from "@ckd/core/bip85-parameters.js";
import type { MultisigWalletOptions } from "@ckd/coins/multisig-wallet.js";

export interface Bip38EncryptionResult {
  encryptedKey: string;
  address: string;
}

export interface AddressSearchMatch {
  index: number;
  path: string;
  address: string;
}

export interface AddressSearchRequest {
  id: string;
  address: string;
  fieldKeys?: readonly string[];
}
export interface AddressSearchResult extends AddressSearchMatch {
  id: string;
}

export type MessageSigningFormat =
  "bitcoin-compact" | "dash-compact" | import("@ckd/core/bip322-signing.js").Bip322SigningFormat;

export type WorkerRequest =
  | { id: number; type: "derive"; adapterId: string; input: CoinDerivationInput }
  | {
      id: number;
      type: "search";
      adapterId: string;
      input: Omit<CoinDerivationInput, "start" | "count">;
      expectedAddress: string;
      start: number;
      count: number;
    }
  | {
      id: number;
      type: "search-many";
      adapterId: string;
      input: Omit<CoinDerivationInput, "start" | "count">;
      requests: readonly AddressSearchRequest[];
      start: number;
      count: number;
    }
  | {
      id: number;
      type: "sign-message";
      adapterId: string;
      input: CoinDerivationInput;
      address: string;
      message: string;
      format: MessageSigningFormat;
    }
  /** Verifies a pasted signature for a row's address: public material only, no seed. */
  | { id: number; type: "verify-message"; request: MessageSigningRequest; signature: string }
  | {
      id: number;
      type: "silent-payment";
      seed: Uint8Array;
      network: "mainnet" | "testnet";
      account: number;
      labelIndexes?: readonly number[];
    }
  | { id: number; type: "bip85"; seed: Uint8Array; options: Bip85RequestOptions }
  | { id: number; type: "multisig"; seeds: Uint8Array[]; options: MultisigWalletOptions }
  | {
      id: number;
      type: "bip38-encrypt";
      adapterId: string;
      input: CoinDerivationInput;
      address: string;
      passphrase: string;
    }
  /** `full` adds the slower known answers of the optional features (the full self-test). */
  | { id: number; type: "self-test"; full?: boolean };

type WorkerSuccess =
  | { id: number; ok: true; type: "derive"; result: DerivationResult }
  | { id: number; ok: true; type: "search"; result: AddressSearchMatch | null }
  | { id: number; ok: true; type: "search-many"; result: AddressSearchResult[] }
  | { id: number; ok: true; type: "sign-message"; result: MessageSignature }
  | { id: number; ok: true; type: "verify-message"; result: boolean }
  | { id: number; ok: true; type: "silent-payment"; result: SilentPaymentResult }
  | { id: number; ok: true; type: "bip85"; result: Bip85Result }
  | { id: number; ok: true; type: "multisig"; result: DerivationResult }
  | { id: number; ok: true; type: "bip38-encrypt"; result: Bip38EncryptionResult }
  | { id: number; ok: true; type: "self-test"; result: CryptoSelfTestReport };

interface WorkerFailure {
  id: number;
  ok: false;
  error: string;
  errorCode?: string;
}

interface WorkerReady {
  type: "ready";
}

type WorkerResponse = WorkerSuccess | WorkerFailure;
export type WorkerMessage = WorkerReady | WorkerResponse;
