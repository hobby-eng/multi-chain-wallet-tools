// Browser input translation only: MnemoCode owns decoding, confirmation and last-word selection.
import {
  mnemoCodeDatesFor,
  readMnemoCodeCodes,
  type MnemoCodeFormat,
  type MnemoCodeMode,
  type MnemoCodePhraseWords,
} from "./mnemocode.js";
import { ReEncoding } from "../../recovery-mnemocode/source/core/re-encoding.js";
import type { WalletMatch } from "../../recovery-mnemocode/source/core/wallet-check.js";
import type { WalletEvidenceRequest } from "./mnemocode-wallet.js";

export interface ReEncodingInput {
  readonly input: string;
  readonly mode: MnemoCodeMode;
  readonly format: MnemoCodeFormat | "auto";
  readonly dates: string;
  readonly words?: MnemoCodePhraseWords;
  readonly lastWord?: string;
}

/** The existing MnemoCode search worker also compares one re-encoding candidate with a wallet. */
export interface ReEncodingWalletRequest {
  readonly type: "reencoding-wallet";
  readonly mnemonic: string;
  readonly wallet: WalletEvidenceRequest;
}

/** Owns the upstream confirmation session; output is available only through its confirmedPhrase. */
export class MnemoCodeReEncoding {
  readonly #core: ReEncoding;

  private constructor(core: ReEncoding) {
    this.#core = core;
  }

  static of(input: ReEncodingInput): MnemoCodeReEncoding {
    const backup = readMnemoCodeCodes(input.input, input.mode, input.format, input.words);
    return new MnemoCodeReEncoding(
      ReEncoding.of(backup, mnemoCodeDatesFor(backup.mode, input.dates), input.lastWord),
    );
  }

  get phrase(): string {
    return this.#core.phrase;
  }

  get confirmation(): ReEncoding["confirmation"] {
    return this.#core.confirmation;
  }

  confirmByPerson(): void {
    this.#core.confirmByPerson();
  }

  confirmByWallet(
    wallet: WalletEvidenceRequest,
    compare: (request: ReEncodingWalletRequest) => Promise<WalletMatch>,
  ): Promise<WalletMatch> {
    return this.#core.confirmByWallet((mnemonic) =>
      compare({ type: "reencoding-wallet", mnemonic, wallet }),
    );
  }

  confirmedPhrase(): string {
    return this.#core.confirmedPhrase();
  }
}
