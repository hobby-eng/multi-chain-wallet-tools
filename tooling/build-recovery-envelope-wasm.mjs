import { buildRecoveryWasm } from "./wasm-build.mjs";

await buildRecoveryWasm("recovery-envelope-wasm", {
  wasiHeaders: true,
  description: "Blockchain Commons envelope",
});
