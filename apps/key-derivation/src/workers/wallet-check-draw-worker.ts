// One of the Deriver's wallet-check draws (MHFE-WALLET-CHECK-SEED-1), in a worker of its own: the
// page starts a few at once, takes the phrase of the first that finds one and terminates the others
// (checked-mnemonic-feature.ts). Each worker draws fresh phrases from crypto.getRandomValues() and
// stretches each with WebCrypto's PBKDF2, so the draws of several workers add up.
import type { ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { drawWalletCheckPhrase } from "@ckd/core/bip39-wallet-check.js";
import { RecoveryWorkerProtocol } from "./recovery-worker-protocol.js";

/** What a draw is given: the wishes for the phrase and the wallet's passphrase. */
export interface WalletCheckDrawRequest {
  readonly wishes: ChosenWordsRequest;
  readonly passphrase: string;
}

/** A draw's answer. */
export interface WalletCheckDrawn {
  readonly phrase: string;
}

/** A draw's progress: the phrases this worker has tried. */
export interface WalletCheckDrawProgress {
  readonly draws: number;
}

self.onmessage = ({ data }: MessageEvent<WalletCheckDrawRequest>) => {
  drawWalletCheckPhrase(data.wishes, data.passphrase, {
    onDraws: (draws) => postMessage({ type: "progress", progress: { draws } }),
  })
    .then((phrase) => postMessage({ type: "result", outcome: { phrase } }))
    .catch((cause: unknown) => postMessage(RecoveryWorkerProtocol.failure(cause, "wallet check")));
};
postMessage({ type: "ready" });
