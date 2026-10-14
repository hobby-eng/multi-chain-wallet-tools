// The wallet recognition of an edition with Bitcoin: every kind of evidence that MnemoCode reads,
// the master fingerprint, a Bitcoin address, an extended or compressed public key, a WIF, or an
// address of another coin the build offers (mnemocode-offered-coins.ts: all of MnemoCode's in the
// full build), each checked by MnemoCode's own module (core/wallet-evidence.ts). See
// mnemocode-wallet.ts. MnemoCode's wallet evidence still names every coin family itself, so a
// selective build with Bitcoin carries their code, though it offers and checks only its own.
import type { WalletCheck } from "../../recovery-mnemocode/source/core/wallet-check.js";
import {
  WalletEvidenceCheck,
  assertWalletEvidence,
  bitcoinProfiles,
  type Pbkdf2HmacSha512,
} from "../../recovery-mnemocode/source/core/wallet-evidence.js";
import { WALLET_EVIDENCE_SELF_TEST } from "../../recovery-mnemocode/source/core/wallet-evidence-self-test.js";
import { OFFERED_COIN_CHECKS, OFFERED_COINS } from "./mnemocode-offered-coins.js";
import type {
  CoinDescription,
  SelfTestFeature,
  WalletEvidence,
  WalletEvidenceRequest,
  WalletRecognition,
} from "./mnemocode-wallet.js";

export class MnemoCodeWalletRecognition implements WalletRecognition {
  /** The address types that "Every type" tries, as MnemoCode's command line tries them. */
  static readonly PROFILES: readonly string[] = bitcoinProfiles;
  /** The coins of "Address of another coin": every offered coin but Bitcoin, which has its own entry. */
  static readonly COINS: readonly CoinDescription[] = OFFERED_COINS.filter(
    (coin) => coin.id !== "bitcoin",
  );
  /** The known answers of what this recognition compares, for the self-tests. */
  static readonly SELF_TESTS: readonly SelfTestFeature[] = [
    WALLET_EVIDENCE_SELF_TEST,
    ...OFFERED_COIN_CHECKS,
  ];

  /** Refuses evidence that MnemoCode cannot compare, or a coin this build does not offer. */
  static assertEvidence(evidence: WalletEvidence): void {
    if (
      evidence.kind === "coin-address" &&
      !MnemoCodeWalletRecognition.COINS.some((coin) => coin.id === evidence.coin)
    )
      throw new Error(`This build does not compare addresses of ${evidence.coin}.`);
    assertWalletEvidence(evidence, OFFERED_COINS);
  }

  readonly #check: WalletEvidenceCheck;

  constructor(pbkdf2: Pbkdf2HmacSha512) {
    this.#check = new WalletEvidenceCheck(pbkdf2, OFFERED_COINS);
  }

  checkFor(request: WalletEvidenceRequest): WalletCheck {
    MnemoCodeWalletRecognition.assertEvidence(request.evidence);
    return (mnemonic) => this.#check.matchAsync(mnemonic, request.evidence, request.passphrase);
  }
}
