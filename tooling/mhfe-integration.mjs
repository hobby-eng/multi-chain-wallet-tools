import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/** One definition for feature composition and the integration's provenance inventory. */
export class MhfeIntegrationModules {
  static markers = Object.freeze(["/recovery-mhfe", "/checked-mnemonic"]);

  static owns(path) {
    return this.markers.some((marker) => `/${path.replaceAll("\\", "/")}`.includes(marker));
  }

  static files(root) {
    const directory = "apps/key-derivation/src/ui";
    return readdirSync(resolve(root, directory))
      .filter((name) => name.endsWith(".ts") && this.owns(`${directory}/${name}`))
      .sort()
      .map((name) => `${directory}/${name}`);
  }
}
