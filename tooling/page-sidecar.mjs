import { existsSync, readFileSync, writeFileSync } from "node:fs";

// The HTML build writes a checksum file next to every page it builds in dist/: one line, the page's
// SHA-256 and the name it is published under, as `sha256sum -c` reads it. The later steps (the
// executable build, the bundle scripts, the verification record, the artifact verifiers) check the
// page against it, so that a page changed after its build stops them. It stays in dist/ and is never
// a release asset: a release lists every asset in its one SHA256SUMS. This module is the one place
// of its name and line; the release workflow runs some of its callers without installed packages, so
// it imports Node's own modules only.

/** The path of the checksum file next to the page at `pagePath`. */
export function sidecarPath(pagePath) {
  return `${pagePath}.sha256`;
}

/** Writes the checksum file of the page at `pagePath`: its SHA-256 `digest` under `name`. */
export function writeSidecar(pagePath, digest, name) {
  writeFileSync(sidecarPath(pagePath), `${digest}  ${name}\n`);
}

/**
 * The SHA-256 and the name that the checksum file of the page at `pagePath` records, or undefined
 * when it is missing or is not one `<hex>  <name>` line.
 */
export function readSidecar(pagePath) {
  const path = sidecarPath(pagePath);
  if (!existsSync(path)) return undefined;
  const match = /^([0-9a-f]{64}) {2}([^\n]+)$/u.exec(readFileSync(path, "utf8").trim());
  return match === null ? undefined : { digest: match[1], name: match[2] };
}

/** Whether the page at `pagePath` has a checksum file that records `digest` under `name`. */
export function sidecarRecords(pagePath, digest, name) {
  const recorded = readSidecar(pagePath);
  return recorded !== undefined && recorded.digest === digest && recorded.name === name;
}
