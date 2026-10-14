import type { MhfePackageParts, MhfeSecret, MhfeWordHint } from "../runtime/runtime.js";
import { MhfeModuleClass } from "../runtime/runtime.js";
export {
  MhfeCancelledError,
  MhfeError,
  type MhfeErrorCode,
  type MhfeSelfCheckProgress,
  type MhfeSelfCheckReport,
} from "../runtime/runtime.js";

/** runtime/worker.js and runtime/mhfe.wasm. */
export type MhfeWalletSources = MhfePackageParts;

export interface MhfeNewPhrase {
  phrase: string;
  words: 24;
  /** Whether it was drawn to pass the wallet check with the passphrase. */
  walletCheck: boolean;
  /** The master key fingerprint with the passphrase given, which may be empty. */
  fingerprintWithPassphrase: string;
  /** How many workers drew it. */
  workers: number;
}

/** The module's fixed values, from parameters(). */
export interface MhfeWalletParameters {
  version: string;
  coins: { id: string; name: string; addressForms: string }[];
  walletCheckBits: number;
  drawReportInterval: number;
  /** The most words drawPhrase() takes in `chosen`: 1, for every length (not recommended). */
  maxChosenWords: number;
  /** The most words drawPhrase() takes in `neverUse`: 1. */
  maxNeverUseWords: number;
  /** Below these, 240, a new phrase is not recommended, though allowed. */
  recommendedRandomBits: number;
}

/** A word a new phrase must hold: at a position from 1 to 24, or anywhere. */
export interface MhfeChosenWord {
  word: string;
  position: number | "anywhere";
}

/** What a new phrase keeps of its randomness with the wishes given, before it is drawn. */
export interface MhfeDrawOdds {
  /** The random bits it keeps, about. */
  randomBits: number;
  /**
   * "full": 256 bits; "ample": at least 240, still far more than enough; else not recommended. A
   * word never to use, which costs about 0.016 bits, is left out of the rating.
   */
  randomness: "full" | "ample" | "notRecommended";
  /** The draws it is expected to take, the wallet check's included. */
  expectedDraws: number;
  /**
   * True with a chosen word: someone who learns or guesses it can rule out almost every wrong MHFE
   * password with it and tell the wallet from a decoy. A page warns.
   */
  recognisable: boolean;
  /**
   * True with a chosen word at a fixed position, which costs more than a word anywhere: where the
   * randomness is not recommended, a page may say that "anywhere" keeps more.
   */
  fixedPosition: boolean;
}

/** Every method returns a promise and reports every error by rejecting it; cancel() is synchronous. */
export class MhfeWallet extends MhfeModuleClass<MhfeWalletParameters> {
  constructor(sources: MhfeWalletSources);
  /** A 24-word phrase and a passphrase that is not empty; otherwise refused. */
  walletCheck(options: { phrase: string; passphrase: MhfeSecret }): Promise<boolean>;
  fingerprint(options: { phrase: string; passphrase?: MhfeSecret }): Promise<string>;
  /** The hint below a line of BIP39 words being typed, by the command-line tool's rule. */
  wordHints(options: { typed: MhfeSecret }): Promise<MhfeWordHint>;
  /** `coin` is required: an id of parameters().coins. */
  describeAddress(options: {
    address: string;
    coin: string;
    path?: string;
    /** 0, the default, for the usual search; else the decoy search's first-account gap. */
    scanGap?: number;
  }): Promise<{
    /** The address type, such as "native SegWit (BIP84)", when the coin has several. */
    type: string | null;
    /** The path pattern searched, or the one path given. */
    search: string;
    /** How many addresses it derives at most; above 2^53 a JavaScript number is rounded. */
    addresses: number;
    onlyPath: boolean;
  }>;
  /** What `chosen` and `neverUse` cost a new phrase, with or without the wallet check. */
  describeDraw(options?: {
    chosen?: MhfeChosenWord[];
    neverUse?: string[];
    walletCheck?: boolean;
  }): Promise<MhfeDrawOdds>;
  /**
   * With a passphrase, typed twice, `walletCheck` must be given: never preselected. A checked
   * phrase takes about 65,536 draws, spread over `workers` workers, 1 to 256. The phrase holds
   * every chosen word and none of `neverUse`, refused as describeDraw() says.
   */
  drawPhrase(options?: {
    passphrase?: MhfeSecret;
    passphraseRepeat?: MhfeSecret;
    walletCheck?: boolean;
    workers?: number;
    chosen?: MhfeChosenWord[];
    neverUse?: string[];
    onProgress?: (progress: { stage: "draw"; draws: number }) => void | Promise<void>;
  }): Promise<MhfeNewPhrase>;
  cancel(): void;
}
