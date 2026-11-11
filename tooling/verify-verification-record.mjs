import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILD_PROFILES,
  CHECKSUM_MANIFEST_NAME,
  VERIFICATION_RECORD_NAME,
} from "./build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const recordPath = resolve(root, "dist", VERIFICATION_RECORD_NAME);
const bytes = readFileSync(recordPath);
const record = JSON.parse(bytes);
if (
  record.schemaVersion !== 1 ||
  !Array.isArray(record.artifacts) ||
  record.artifacts.length !== 8
) {
  throw new Error("Verification record has an unsupported schema or incomplete artifact list.");
}
if (record.dependencyProvenance?.lockedDependencies === undefined) {
  throw new Error("Verification record omits dependency provenance.");
}
for (const source of record.dependencyProvenance.localSources ?? []) {
  for (const entry of source.files ?? []) {
    const actual = createHash("sha256")
      .update(readFileSync(resolve(root, entry.path)))
      .digest("hex");
    if (actual !== entry.sha256) throw new Error(`Dependency source hash mismatch: ${entry.path}`);
  }
}
for (const entry of [...record.artifacts, ...record.wasm]) {
  const actual = createHash("sha256")
    .update(readFileSync(resolve(root, entry.path)))
    .digest("hex");
  if (actual !== entry.sha256) throw new Error(`Verification record hash mismatch: ${entry.path}`);
}
const recordHash = createHash("sha256").update(bytes).digest("hex");
for (const profile of Object.values(BUILD_PROFILES)) {
  const release = resolve(root, profile.releaseDirectory);
  if (!readFileSync(resolve(release, VERIFICATION_RECORD_NAME)).equals(bytes)) {
    throw new Error(`${profile.editionName} release contains a different verification record.`);
  }
  const line = `${recordHash}  ${VERIFICATION_RECORD_NAME}`;
  const manifest = readFileSync(resolve(release, CHECKSUM_MANIFEST_NAME), "utf8");
  if (!manifest.trim().split("\n").includes(line)) {
    throw new Error(`${profile.editionName} release manifest omits the verification record.`);
  }
}
console.log(`Verified ${VERIFICATION_RECORD_NAME}: ${recordHash}`);
