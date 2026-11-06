// MnemoCode's long jobs in a worker of their own, so that the page stays responsive and Cancel
// stops a job at once: the page terminates this worker, which also frees what it kept. The worker
// instantiates the page's compiled MnemoCode it is given and only translates messages; the
// searches, restores, repairs and cross-stitch patterns are MnemoCode's (packages/recovery-backup).
import { instantiateMnemoCode } from "@ckd/recovery-backup/mnemocode-engine.js";
import { MnemoCodeSearches } from "@ckd/recovery-backup/mnemocode-search.js";
import { MnemoCodeShareJobs } from "@ckd/recovery-backup/mnemocode-shares.js";
import { makeStitchPattern, type StitchRequest } from "@ckd/recovery-backup/mnemocode-stitch.js";
import type { MnemoCodeWorkerMessage } from "./mnemocode-worker-client.js";
import { MnemoCodeWorkerProtocol } from "./mnemocode-worker-protocol.js";

// The searches own each input shape; the worker adds only the routing discriminator.
export type MnemoCodeSearchRequest =
  | ({ readonly type: "words" } & Parameters<MnemoCodeSearches["words"]>[0])
  | ({ readonly type: "dates" } & Parameters<MnemoCodeSearches["dates"]>[0])
  | ({ readonly type: "missing-codes" } & Parameters<MnemoCodeSearches["missingCodes"]>[0])
  | ({ readonly type: "restore" } & Parameters<MnemoCodeShareJobs["restore"]>[0])
  | ({ readonly type: "repair" } & Parameters<MnemoCodeShareJobs["repair"]>[0])
  | ({ readonly type: "stitch" } & StitchRequest);

self.onmessage = ({ data }: MessageEvent<MnemoCodeWorkerMessage<MnemoCodeSearchRequest>>) => {
  try {
    const binding = instantiateMnemoCode(data.module);
    const searches = new MnemoCodeSearches(binding);
    const shares = new MnemoCodeShareJobs(binding);
    const progress = (value: unknown): void => postMessage({ type: "progress", progress: value });
    const request = data.request;
    if (request.type === "stitch") {
      const pattern = makeStitchPattern(binding, request);
      postMessage({ type: "result", outcome: pattern }, { transfer: [pattern.pdf.buffer] });
      return;
    }
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
