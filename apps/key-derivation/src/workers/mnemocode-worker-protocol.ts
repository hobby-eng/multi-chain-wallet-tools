// Compatibility names share the generic protocol, with no second wire/refusal implementation.
export {
  RecoveryWorkerProtocol as MnemoCodeWorkerProtocol,
  WORKER_STOPPED,
  type WorkerStopped,
  type WorkerFailure,
} from "./recovery-worker-protocol.js";
