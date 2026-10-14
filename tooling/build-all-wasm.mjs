import { runNodeScript } from "./run-script.mjs";
import { WASM_MODULES } from "./wasm-modules.mjs";

for (const { buildScript } of WASM_MODULES) runNodeScript(buildScript);
