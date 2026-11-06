import { withNodeModule } from "../../../tooling/node-module.mjs";
import { BundledAssets } from "../../../tooling/bundled-assets.mjs";
import { SelfTestInventory } from "../../../tooling/self-test-inventory.mjs";

/** Node command adapter; report admission belongs to the shared inventory module. */
export class SelfTestVerifier {
  #definition;
  #inventory;

  /** Composes the reviewed entry and its independent report inventory. */
  constructor(definition) {
    this.#definition = Object.freeze({ ...definition });
    this.#inventory = new SelfTestInventory(definition);
  }

  /** Bundles and executes the real entry, then prints only its admitted public check labels. */
  async verify() {
    const { entry, run, label } = this.#definition;
    if (typeof Uint8Array.fromBase64 !== "function")
      Uint8Array.fromBase64 = (value) => new Uint8Array(Buffer.from(value, "base64"));
    const supplied = await withNodeModule(entry, (module) => module[run](), {
      loader: BundledAssets.loaders,
    });
    const report = this.#inventory.check(supplied);
    console.log(`Verified ${label}: ${report.checks.join(" · ")} (${report.durationMs} ms)`);
    return report;
  }
}
