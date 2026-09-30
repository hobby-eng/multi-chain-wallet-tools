import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

// The MHFE fast-mode launcher and its checksum file travel with the page they serve. The HTML
// build puts both next to a page that includes MHFE (build-key-derivation-html.mjs); the release
// steps copy them into the flat release folder and list them in SHA256SUMS.

/** Always this name, so that the launcher finds it next to itself or next to the page. */
export const FAST_MODE_CHECKSUM = 'mhfe-fast-mode.sha256';
/** The Python launcher from the MHFE browser package, unchanged. */
export const FAST_MODE_LAUNCHER = 'mhfe-fast-mode.py';

/**
 * The page file name that a checksum file names, after checking that the file is one line of
 * "<64 hex digits>  <page>.html". Throws for anything else.
 */
export function pageNamedByChecksumFile(text, label) {
  const match = /^([0-9a-f]{64}) {2}([A-Za-z0-9_.-]+\.html)\n$/u.exec(text);
  if (match === null) throw new Error(`${label} must hold one line "<SHA-256>  <page>.html".`);
  return { digest: match[1], page: match[2] };
}

/**
 * The folder and page of the one release artifact that has the fast-mode files next to it in
 * dist/, or undefined when no artifact of the profile includes MHFE.
 */
export function findFastModeFiles(dist, relativeArtifacts) {
  const found = [];
  for (const relative of relativeArtifacts) {
    const folder = dirname(resolve(dist, relative));
    const checksumFile = resolve(folder, FAST_MODE_CHECKSUM);
    if (!existsSync(checksumFile)) continue;
    const { page } = pageNamedByChecksumFile(readFileSync(checksumFile, 'utf8'), checksumFile);
    if (page === basename(relative)) found.push({ folder, page });
  }
  if (found.length > 1) throw new Error('Only one page of a release can carry the MHFE fast-mode launcher.');
  return found[0];
}
