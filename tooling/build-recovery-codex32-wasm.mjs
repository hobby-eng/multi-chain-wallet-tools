import { buildRecoveryWasm } from "./wasm-build.mjs";

await buildRecoveryWasm("recovery-codex32-wasm", { description: "rust-codex32" });
