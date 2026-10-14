// The btcutil-js library embedded in an offline page: its WebAssembly is inlined from
// node_modules, and its Node-only dynamic import becomes a refusal, so that the page loads nothing
// at run time.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The refusal that replaces btcutil's dynamic import of a Node module. */
const NODE_IMPORT_REFUSAL =
  "((moduleName) => Promise.reject(new Error(`Node-only module ${moduleName} is unavailable in the offline browser artifact.`)))";

/**
 * The esbuild plugin that embeds btcutil. With `replaceFetch` its fetch calls refuse too; a build
 * that defines fetch away for the whole bundle leaves them.
 */
export function embeddedBtcutilPlugin(root, { replaceFetch = false } = {}) {
  return {
    name: "embedded-btcutil-wasm",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^btcutil-js-wasm$/ }, () => ({
        path: "btcutil-js-wasm",
        namespace: "btcutil-wasm",
      }));
      buildContext.onLoad({ filter: /.*/, namespace: "btcutil-wasm" }, () => ({
        contents: readFileSync(resolve(root, "node_modules/btcutil-js/dist/btcutil.wasm")),
        loader: "binary",
      }));
      buildContext.onLoad({ filter: /node_modules\/btcutil-js\/dist\/index\.js$/ }, ({ path }) => {
        const source = readFileSync(path, "utf8").replaceAll(
          'new Function("m", "return import(m)")',
          NODE_IMPORT_REFUSAL,
        );
        return {
          contents: replaceFetch
            ? `const __offlineFetch = () => Promise.reject(new Error('Network access is unavailable in the offline browser artifact.'));\n${source.replaceAll("fetch(", "__offlineFetch(")}`
            : source,
          loader: "js",
        };
      });
    },
  };
}
