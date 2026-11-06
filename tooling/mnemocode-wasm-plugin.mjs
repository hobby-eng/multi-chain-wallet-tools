// Resolves @ckd/mnemocode-wasm/<file> to MnemoCode's file of one page profile
// (packages/recovery-mnemocode-wasm/generated/<edition>/<page>, MnemoCode ADR 0007): each page
// embeds only its own. tsconfig.json maps the same names to the multi-chain Deriver's file, whose
// types hold every module, for type checking and tests.
import { resolve } from "node:path";
import { MNEMOCODE_WASM_DIRECTORY } from "./sync-mnemocode-wasm.mjs";

const PREFIX = "@ckd/mnemocode-wasm/";

/** The profile of a page: the Dash Community Scanner embeds the Scanner's file, which holds no coin. */
export function mnemocodeWasmProfile(edition, page) {
  return page === "discovery-scanner" ? "multi-chain/discovery-scanner" : `${edition}/${page}`;
}

export function mnemocodeWasmPlugin(root, edition, page) {
  const folder = resolve(
    root,
    MNEMOCODE_WASM_DIRECTORY,
    "generated",
    mnemocodeWasmProfile(edition, page),
  );
  return {
    name: "mnemocode-wasm-profile",
    setup(build) {
      build.onResolve({ filter: /^@ckd\/mnemocode-wasm\// }, (args) => ({
        path: resolve(folder, args.path.slice(PREFIX.length)),
      }));
    },
  };
}
