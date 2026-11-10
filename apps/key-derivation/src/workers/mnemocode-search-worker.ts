// MnemoCode's long jobs in a worker of their own, so that the page stays responsive and Cancel
// stops a job at once: the page terminates this worker, which also frees what it kept. The worker
// instantiates the page's compiled MnemoCode it is given and only translates messages; the
// searches, restores, repairs, cross-stitch patterns and hidden records in photos and MP3 files are
// MnemoCode's (packages/recovery-backup).
import { instantiateMnemoCode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { MnemoCodeSearches } from "@ckd/recovery-backup/mnemocode-search.js";
import { MnemoCodeShareJobs } from "@ckd/recovery-backup/mnemocode-shares.js";
import { makeStitchPattern, type StitchRequest } from "@ckd/recovery-backup/mnemocode-stitch.js";
import {
  MnemoCodeStegoJobs,
  type StegoAnalyzeRequest,
  type StegoHideRequest,
  type StegoOpenRequest,
} from "@ckd/recovery-backup/mnemocode-stego.js";
import type { MnemoCodeWorkerMessage } from "./mnemocode-worker-client.js";
import { MnemoCodeWorkerProtocol } from "./mnemocode-worker-protocol.js";

// The searches own each input shape; the worker adds only the routing discriminator.
export type MnemoCodeSearchRequest =
  | ({ readonly type: "words" } & Parameters<MnemoCodeSearches["words"]>[0])
  | ({ readonly type: "dates" } & Parameters<MnemoCodeSearches["dates"]>[0])
  | ({ readonly type: "missing-codes" } & Parameters<MnemoCodeSearches["missingCodes"]>[0])
  | ({ readonly type: "restore" } & Parameters<MnemoCodeShareJobs["restore"]>[0])
  | ({ readonly type: "repair" } & Parameters<MnemoCodeShareJobs["repair"]>[0])
  | ({ readonly type: "stitch" } & StitchRequest)
  | ({ readonly type: "stego-analyze" } & StegoAnalyzeRequest)
  | ({ readonly type: "stego-hide" } & StegoHideRequest)
  | ({ readonly type: "stego-open" } & StegoOpenRequest);

const progress = (value: unknown): void => postMessage({ type: "progress", progress: value });

/** The steganography jobs: hiding is asynchronous, for it reads back the Blob it hands over. */
async function stego(
  jobs: MnemoCodeStegoJobs,
  request: Extract<MnemoCodeSearchRequest, { type: `stego-${string}` }>,
): Promise<void> {
  if (request.type === "stego-analyze") {
    postMessage({ type: "result", outcome: jobs.analyze(request, progress) });
    return;
  }
  if (request.type === "stego-hide") {
    postMessage({ type: "result", outcome: await jobs.hide(request, progress) });
    return;
  }
  const opened = jobs.open(request, progress);
  postMessage(
    { type: "result", outcome: opened },
    { transfer: opened.kind === "opaque" ? [opened.bytes.buffer] : [] },
  );
}

self.onmessage = ({ data }: MessageEvent<MnemoCodeWorkerMessage<MnemoCodeSearchRequest>>) => {
  try {
    const binding = instantiateMnemoCode(data.module);
    const request = data.request;
    if (request.type === "stitch") {
      const pattern = makeStitchPattern(binding, request);
      postMessage({ type: "result", outcome: pattern }, { transfer: [pattern.pdf.buffer] });
      return;
    }
    if (
      request.type === "stego-analyze" ||
      request.type === "stego-hide" ||
      request.type === "stego-open"
    ) {
      stego(new MnemoCodeStegoJobs(binding), request).catch((cause: unknown) =>
        postMessage(MnemoCodeWorkerProtocol.failure(cause)),
      );
      return;
    }
    const searches = new MnemoCodeSearches(binding);
    const shares = new MnemoCodeShareJobs(binding);
    const outcome =
      request.type === "words"
        ? searches.words(request, progress)
        : request.type === "dates"
          ? searches.dates(request, progress)
          : request.type === "missing-codes"
            ? searches.missingCodes(request, progress)
            : request.type === "restore"
              ? shares.restore(request, progress)
              : shares.repair(request, progress);
    // A question carries no list.
    const transfer =
      "list" in outcome && outcome.list !== undefined ? [outcome.list.bytes.buffer] : [];
    postMessage({ type: "result", outcome }, { transfer });
  } catch (cause) {
    postMessage(MnemoCodeWorkerProtocol.failure(cause));
  }
};
postMessage({ type: "ready" });
