// One of the Deriver's wallet-check draws in a worker of its own: the page starts a few at once,
// takes the phrase of the first that finds one and terminates the others (wallet-check-draw.ts).
// The draw itself is wallet-check-draw-job.ts.
import { RecoveryWorkerProtocol } from "./recovery-worker-protocol.js";
import { runDrawJob, type WalletCheckDrawRequest } from "./wallet-check-draw-job.js";

self.onmessage = ({ data }: MessageEvent<WalletCheckDrawRequest>) => {
  runDrawJob(data, (progress) => postMessage({ type: "progress", progress }))
    .then((outcome) => postMessage({ type: "result", outcome }))
    .catch((cause: unknown) => postMessage(RecoveryWorkerProtocol.failure(cause, "wallet check")));
};
postMessage({ type: "ready" });
