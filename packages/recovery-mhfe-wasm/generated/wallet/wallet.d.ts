import type {
  MhfePackageParts,
  MhfeSecret,
  MhfeWordHint,
} from "../runtime/runtime.js";
import { MhfeModuleClass } from "../runtime/runtime.js";
export {
  MhfeError,
  type MhfeErrorCode,
  type MhfeSelfCheckProgress,
  type MhfeSelfCheckReport,
} from "../runtime/runtime.js";

/** runtime/worker.js and runtime/mhfe.wasm. */
export type MhfeWalletSources = MhfePackageParts;

/** The module's fixed values, from parameters(). */
export interface MhfeWalletParameters {
  version: string;
  coins: { id: string; name: string; addressForms: string }[];
  walletCheckBits: number;
}

/**
 * Every method returns a promise and reports every error by rejecting it.
 */
export class MhfeWallet extends MhfeModuleClass<MhfeWalletParameters> {
  constructor(sources: MhfeWalletSources);
  /** A 24-word phrase and a passphrase that is not empty; otherwise refused. */
  walletCheck(options: { phrase: string; passphrase: MhfeSecret }): Promise<boolean>;
  fingerprint(options: { phrase: string; passphrase?: MhfeSecret }): Promise<string>;
  /** The hint below a line of BIP39 words being typed, by the command-line tool's rule. */
  wordHints(options: { typed: MhfeSecret }): Promise<MhfeWordHint>;
  /** `coin` is an id of parameters().coins; without it, every coin whose form the address has. */
  describeAddress(options: {
    address: string;
    coin?: string;
    path?: string;
    /** 0, the default, for the usual search; else the decoy search's first-account gap. */
    scanGap?: number;
  }): Promise<{
    /** The ids of the coins searched: without `coin`, every coin of the address's form. */
    coins: string[];
    /** The address type, such as "native SegWit (BIP84)", when the coin has several. */
    type: string | null;
    /** The path pattern searched, or the one path given. */
    search: string;
    /** How many addresses it derives at most; above 2^53 a JavaScript number is rounded. */
    addresses: number;
    onlyPath: boolean;
  }>;
}
