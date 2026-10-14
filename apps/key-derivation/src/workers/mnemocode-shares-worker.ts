// MnemoCode's share restores and repairs in a worker of their own: a repair of marked shares or a
// search of forgotten date digits can take long, and Cancel terminates the worker at once. The
// worker only translates messages; the work is MnemoCode's (packages/recovery-backup).
import type { WalletEvidenceRequest } from "@ckd/recovery-backup/mnemocode-search.js";
import { MnemoCodeShares, sskrSharePlatform } from "@ckd/recovery-backup/mnemocode-shares.js";
import { fingerprintWithoutPassphrase } from "@ckd/recovery-backup/fingerprint.js";
import { SskrCodec } from "@ckd/recovery-backup/sskr-codec.js";
// The build swaps in the fingerprint-only recognition when Bitcoin is not selected.
import { MnemoCodeWalletRecognition } from "@ckd/recovery-backup/mnemocode-wallet-bitcoin.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { fillSecureRandom } from "@ckd/core/secure-random.js";
import { webCryptoPbkdf2 } from "./webcrypto-pbkdf2.js";

interface ShareWorkerFactors {
  readonly wallet?: WalletEvidenceRequest;
  /** The page's SSKR WASM module: the artifact embeds it once, so the worker is handed a copy. */
  readonly sskrWasm: Uint8Array<ArrayBuffer>;
}

/** The owner's requests, with wallet factors replacing a callback across the worker boundary. */
export type MnemoCodeSharesRequest = ShareWorkerFactors &
  (
    | ({ readonly type: "restore" } & Omit<
        Parameters<MnemoCodeShares["restore"]>[0],
        "walletCheck"
      >)
    | ({ readonly type: "repair" } & Omit<Parameters<MnemoCodeShares["repair"]>[0], "walletCheck">)
  );

/** MnemoCode's shares over the SSKR library made from the page's module, on the first request. */
let made: MnemoCodeShares | undefined;
const sharesWith = (sskrWasm: Uint8Array<ArrayBuffer>): MnemoCodeShares => {
  made ??= new MnemoCodeShares(
    sskrSharePlatform(new SskrCodec(sskrWasm)),
    fillSecureRandom,
    (mnemonic) => fingerprintWithoutPassphrase(mnemonic, mnemonicToSeed),
  );
  return made;
};
const recognition = new MnemoCodeWalletRecognition(webCryptoPbkdf2);
// Cancel terminates the worker; the library still takes a signal, which never fires here.
const neverAborted = new AbortController().signal;

self.onmessage = async ({ data }: MessageEvent<MnemoCodeSharesRequest>) => {
  try {
    const progress = (value: unknown): void => postMessage({ type: "progress", progress: value });
    const wallet = data.wallet;
    const request = {
      answer: data.answer,
      mode: data.mode,
      dates: data.dates,
      confirmed: data.confirmed,
      ...(data.limits === undefined ? {} : { limits: data.limits }),
      ...(wallet === undefined ? {} : { walletCheck: recognition.checkFor(wallet) }),
    };
    const shares = sharesWith(data.sskrWasm);
    if (data.type === "repair") {
      const outcome = await shares.repair(
        { ...request, ...(data.form === undefined ? {} : { form: data.form }) },
        progress,
        neverAborted,
      );
      postMessage({ type: "result", outcome });
      return;
    }
    const outcome = await shares.restore(
      {
        ...request,
        ...(data.list === undefined ? {} : { list: data.list }),
        ...(data.listPassphrase === undefined ? {} : { listPassphrase: data.listPassphrase }),
      },
      progress,
      neverAborted,
    );
    // The list's bytes move to the page rather than being copied, as the search worker does.
    const list = outcome.kind === "phrases" ? outcome.list : undefined;
    postMessage(
      { type: "result", outcome },
      { transfer: list === undefined ? [] : [list.bytes.buffer] },
    );
  } catch (cause) {
    postMessage({ type: "error", message: cause instanceof Error ? cause.message : String(cause) });
  }
};
postMessage({ type: "ready" });
