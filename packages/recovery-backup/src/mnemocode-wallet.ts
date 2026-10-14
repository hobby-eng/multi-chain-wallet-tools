// How a MnemoCode search or restore recognises the wallet among its candidates, as the Deriver
// binds it. The rules are MnemoCode's (core/wallet-evidence.ts, core/coin-address-evidence.ts). An
// edition with Bitcoin compares every kind of evidence, an address of an offered coin included
// (mnemocode-wallet-bitcoin.ts); one without Bitcoin compares the master fingerprint and an address
// of an offered coin (mnemocode-wallet-coins.ts), so that no other coin's code reaches it. The
// offered coins are all of MnemoCode's in the full build and the build's own otherwise
// (mnemocode-offered-coins.ts). Callers import the first; the build puts the other in its place by
// the coins selected (tooling/key-derivation-composition.mjs). Types only.
import type { CoinDescription } from "../../recovery-mnemocode/source/core/coins/coin.js";
import type { Pbkdf2HmacSha512 } from "../../recovery-mnemocode/source/core/master-fingerprint.js";
import type { SelfTestFeature } from "../../recovery-mnemocode/source/core/self-test-check.js";
import type { WalletEvidence } from "../../recovery-mnemocode/source/core/wallet-evidence.js";
import type { WalletCheck } from "../../recovery-mnemocode/source/core/wallet-check.js";

export type { CoinDescription, Pbkdf2HmacSha512, SelfTestFeature, WalletEvidence };

/** What a candidate is compared with, and the wallet's BIP39 passphrase. */
export interface WalletEvidenceRequest {
  readonly evidence: WalletEvidence;
  readonly passphrase: string;
}

/** The comparison of each candidate with the wallet that the person described. */
export interface WalletRecognition {
  checkFor(request: WalletEvidenceRequest): WalletCheck;
}
