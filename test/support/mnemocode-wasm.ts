import { readFileSync } from "node:fs";

export default new Uint8Array(
  readFileSync(
    new URL(
      "../../packages/recovery-mnemocode-wasm/generated/multi-chain/key-derivation/mnemocode.wasm",
      import.meta.url,
    ),
  ),
);
