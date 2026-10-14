// Verify the source handover and host copy without replaying vectors or using the network.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
  verifyMnemoCodeSource,
} from "../../../tooling/sync-mnemocode-source.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The authoritative handover and the vendored map must identify the same exact source bytes. */
class VendorBinding {
  static check(upstream, handoverPath) {
    verifyMnemoCodeSource({ root });
    const manifest = JSON.parse(readFileSync(resolve(root, MNEMOCODE_MANIFEST), "utf8"));
    const handover = JSON.parse(readFileSync(handoverPath, "utf8"));
    if (manifest.commit !== handover.commit) throw new Error("The handover commit differs.");
    const hashes = new Map(handover.files.map(({ path, sha256 }) => [path, sha256]));
    const files = [];
    for (const [source, target] of Object.entries(MNEMOCODE_FILES)) {
      const sourceHash = digest(readFileSync(resolve(upstream, source)));
      const targetHash = digest(readFileSync(resolve(root, MNEMOCODE_SOURCE_DIRECTORY, target)));
      if (hashes.get(source) !== sourceHash)
        throw new Error(`The handed-over bytes changed: ${source}.`);
      if (sourceHash !== targetHash || manifest.files[target] !== targetHash)
        throw new Error(`The host copy differs from the handover: ${source}.`);
      files.push({ source, target, sha256: sourceHash });
    }
    return {
      commit: manifest.commit,
      handoverFingerprint: handover.fingerprint,
      handoverSha256: digest(readFileSync(handoverPath)),
      manifestSha256: digest(readFileSync(resolve(root, MNEMOCODE_MANIFEST))),
      files,
    };
  }
}

const [upstream, handover] = process.argv.slice(2);
if (upstream === undefined || handover === undefined || process.argv.length !== 4)
  throw new Error("Usage: vendor-binding.mjs UPSTREAM_ROOT HANDOVER_SNAPSHOT");
console.log(JSON.stringify(VendorBinding.check(upstream, handover), null, 2));
