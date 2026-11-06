import { resolve } from "node:path";
import { build } from "esbuild";
import { BROWSER_BUNDLE } from "./html-artifact.mjs";
import { createKeyDerivationCompositionPlugin } from "./key-derivation-composition.mjs";

const WORKERS = "apps/key-derivation/src/workers";

/** Missing worker output is a build refusal, never a reason to run recovery on the page. */
export class RecoveryWorkerBuildError extends Error {
  constructor(file) {
    super(`esbuild did not produce the recovery worker ${file}.`);
    this.name = "RecoveryWorkerBuildError";
  }
  /** Stable code for the failed output contract. */
  get code() {
    return "build.recovery-worker.missing-output";
  }
}

/** Bundles recovery isolates while reusing public wordlists embedded by the page. */
export class RecoveryWorkerBundle {
  #root;
  #features;
  #plugins;

  /** `plugins` resolve what a worker shares with its page, such as MnemoCode's glue. */
  constructor(root, features, plugins = []) {
    this.#root = root;
    this.#features = features;
    this.#plugins = plugins;
  }

  /** Returns reviewed script text and its graph inputs for edition/feature admission. */
  async bundle(file) {
    const result = await build({
      absWorkingDir: this.#root,
      entryPoints: [resolve(this.#root, WORKERS, file)],
      ...BROWSER_BUNDLE,
      plugins: [
        createKeyDerivationCompositionPlugin(this.#root, this.#features),
        ...this.#plugins,
        this.#wordlists(),
      ],
      metafile: true,
    });
    const source = result.outputFiles[0]?.text ?? "";
    if (!source.includes("onmessage")) throw new RecoveryWorkerBuildError(file);
    return { inputs: Object.keys(result.metafile.inputs), source };
  }

  #wordlists() {
    const root = this.#root;
    return {
      name: "page-wordlists",
      setup(context) {
        context.onResolve({ filter: /^@scure\/bip39\/wordlists\/english(?:\.js)?$/ }, () => ({
          path: resolve(root, WORKERS, "page-wordlist.ts"),
        }));
        context.onResolve({ filter: /slip39-wordlist\.js$/ }, (args) => {
          if (
            !args.importer.replaceAll("\\", "/").endsWith("/packages/recovery-backup/src/slip39.ts")
          )
            return undefined;
          return { path: resolve(root, WORKERS, "page-slip39-wordlist.ts") };
        });
      },
    };
  }
}
