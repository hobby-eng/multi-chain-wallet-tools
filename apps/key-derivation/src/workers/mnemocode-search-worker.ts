// MnemoCode's long searches in a worker of their own, so that the page stays responsive and Cancel
// stops a search at once: the page terminates this worker, which also frees what it kept. The
// worker only translates messages; the searches are MnemoCode's (packages/recovery-backup).
import { MnemoCodeSearches } from "@ckd/recovery-backup/mnemocode-search.js";
// The build swaps in the fingerprint-only recognition when Bitcoin is not selected.
import { MnemoCodeWalletRecognition } from "@ckd/recovery-backup/mnemocode-wallet-bitcoin.js";
import { MasterFingerprintCheck } from "../../../../packages/recovery-mnemocode/source/core/master-fingerprint.js";
import { webCryptoPbkdf2 } from "./webcrypto-pbkdf2.js";
import type { ReEncodingWalletRequest } from "@ckd/recovery-backup/mnemocode-reencoding.js";

// The adapter owns each input shape; the worker adds only the routing discriminator.
export type MnemoCodeSearchRequest =
  | ReEncodingWalletRequest
  | ({ readonly type: "words" } & Parameters<MnemoCodeSearches["words"]>[0])
  | ({ readonly type: "dates" } & Parameters<MnemoCodeSearches["dates"]>[0])
  | ({ readonly type: "missing-codes" } & Parameters<MnemoCodeSearches["missingCodes"]>[0]);

const fingerprints = new MasterFingerprintCheck(webCryptoPbkdf2);
const recognition = new MnemoCodeWalletRecognition(webCryptoPbkdf2);
const searches = new MnemoCodeSearches(recognition, (phrase) =>
  fingerprints.fingerprintAsync(phrase),
);
// Cancel terminates the worker; the searches still take a signal, which never fires here.
const neverAborted = new AbortController().signal;

self.onmessage = async ({ data }: MessageEvent<MnemoCodeSearchRequest>) => {
  try {
    if (data.type === "reencoding-wallet") {
      const match = await recognition.checkFor(data.wallet)(data.mnemonic);
      // Only the fields of a confirmation cross the worker boundary, never private match state.
      postMessage({
        type: "result",
        outcome: {
          matched: match.matched,
          path: match.path,
          warning: match.warning,
        },
      });
      return;
    }
    const progress = (value: unknown): void => postMessage({ type: "progress", progress: value });
    const outcome =
      data.type === "words"
        ? await searches.words(data, progress, neverAborted)
        : data.type === "dates"
          ? await searches.dates(data, progress, neverAborted)
          : await searches.missingCodes(data, progress, neverAborted);
    // A question carries no list.
    const transfer =
      "list" in outcome && outcome.list !== undefined ? [outcome.list.bytes.buffer] : [];
    postMessage({ type: "result", outcome }, { transfer });
  } catch (cause) {
    postMessage({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
  }
};
postMessage({ type: "ready" });
