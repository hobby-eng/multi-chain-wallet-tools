import { buildRecoveryWasm } from "./wasm-build.mjs";

await buildRecoveryWasm("recovery-sskr-wasm", {
  wasiHeaders: true,
  description: "Blockchain Commons sskr",
});
