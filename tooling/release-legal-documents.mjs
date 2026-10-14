import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The licence and notice files every flat release carries: `name` in the release, `source` in the
 * repository. The root notices refer to the MHFE and MnemoCode package files instead of repeating
 * them, so those ship byte for byte too. A flat release has no folders (a SHA256SUMS name is a
 * plain file name), so each package file is released under a name prefixed with its project.
 * LICENSE-MHFE stays out: the root MIT block already carries MHFE's copyright and does not cite it.
 */
export const RELEASE_LEGAL_DOCUMENTS = Object.freeze(
  [
    { name: "LICENSE", source: "LICENSE" },
    { name: "ATTRIBUTION.md", source: "ATTRIBUTION.md" },
    { name: "THIRD_PARTY_NOTICES.md", source: "THIRD_PARTY_NOTICES.md" },
    {
      name: "MHFE-THIRD_PARTY_NOTICES.md",
      source: "packages/recovery-mhfe-wasm/notices/THIRD_PARTY_NOTICES.md",
    },
    { name: "MHFE-LICENSE-ARGON2", source: "packages/recovery-mhfe-wasm/LICENSE-ARGON2" },
    { name: "MnemoCode-LICENSE", source: "packages/recovery-mnemocode/source/LICENSE" },
    { name: "MnemoCode-NOTICE", source: "packages/recovery-mnemocode/source/NOTICE" },
    {
      name: "MnemoCode-DejaVuSans-NOTICE",
      source: "packages/recovery-mnemocode/source/assets/fonts/DejaVuSans-NOTICE",
    },
    {
      name: "MnemoCode-NaturalEarth-NOTICE",
      source: "packages/recovery-mnemocode/source/assets/maps/NOTICE",
    },
  ].map((document) => Object.freeze(document)),
);

export const RELEASE_LEGAL_NAMES = Object.freeze(RELEASE_LEGAL_DOCUMENTS.map(({ name }) => name));

function readSource(root, source) {
  const path = resolve(root, source);
  if (!existsSync(path)) throw new Error(`Legal document ${source} is missing.`);
  return readFileSync(path);
}

/** Copies every legal document into the release and returns its SHA256SUMS lines. */
export function copyReleaseLegalDocuments(root, release) {
  return RELEASE_LEGAL_DOCUMENTS.map(({ name, source }) => {
    // The copy and its checksum come from the same bytes.
    const bytes = readSource(root, source);
    writeFileSync(resolve(release, name), bytes);
    return `${createHash("sha256").update(bytes).digest("hex")}  ${name}`;
  });
}

/** Requires every released legal document to equal its repository source byte for byte. */
export function assertReleaseLegalDocuments(root, release) {
  for (const { name, source } of RELEASE_LEGAL_DOCUMENTS) {
    const released = resolve(release, name);
    if (!existsSync(released)) throw new Error(`Flat release lacks ${name}.`);
    if (!readFileSync(released).equals(readSource(root, source))) {
      throw new Error(`Flat release ${name} differs from ${source}.`);
    }
  }
}
