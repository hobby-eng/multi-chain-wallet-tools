import { Slip39WorkerRuntime, type Slip39WorkerScope } from "./slip39-worker-runtime.js";

// The build embeds this entry only as a DedicatedWorker script. Its native onmessage/postMessage
// edges match this port; the page never executes this entry as a Window module.
new Slip39WorkerRuntime(self as unknown as Slip39WorkerScope);
