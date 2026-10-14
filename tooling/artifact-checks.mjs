// The checks every tool's artifact verifier starts and ends with: the artifact of the current
// source tree, one HTML document with one style and one script, unique ids, and the checksum file
// that matches it. Each verifier keeps only the checks that are its tool's own.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBuildInfo } from "./build-metadata.mjs";
import { getToolBuild } from "./build-profiles.mjs";

/** How often `marker` occurs in `value`. */
export function occurrences(value, marker) {
  return value.split(marker).length - 1;
}

/** Count direct spellings conservatively, including qualified, bracket and optional calls. */
export function dynamicCodeCounts(source) {
  return {
    functions:
      [...source.matchAll(/\b(?:new\s+)?Function\s*(?:\?\.)?\s*\(/gu)].length +
      [...source.matchAll(/\[\s*["']Function["']\s*\]\s*(?:\?\.)?\s*\(/gu)].length,
    evals:
      [...source.matchAll(/\beval\s*(?:\?\.)?\s*\(/gu)].length +
      [...source.matchAll(/\[\s*["']eval["']\s*\]\s*(?:\?\.)?\s*\(/gu)].length +
      [...source.matchAll(/\(\s*0\s*,\s*eval\s*\)\s*\(/gu)].length,
  };
}

/** Exact reviewed defaults; no tool grants unsafe-eval, even to inert third-party glue. */
export function assertReviewedDynamicCode(html, toolId) {
  const expected = {
    "key-derivation": html.includes('Function("binder",') ? 1 : 0, // Argon2 compatibility fallback.
    "activity-viewer": html.includes('return import("node:zlib")') ? 3 : 0, // Two CSP-blocked SDK constructors and its debug Function(${o}) text.
    "discovery-scanner": html.includes('return import("node:zlib")') ? 3 : 0, // The same two SDK constructors and debug text.
    "psbt-inspector": 0,
  }[toolId];
  if (expected === undefined) throw new Error(`No reviewed dynamic-code profile for ${toolId}.`);
  const counts = dynamicCodeCounts(html);
  if (counts.functions !== expected || counts.evals !== 0)
    throw new Error(
      `${toolId} changed its reviewed dynamic-code counts: ${JSON.stringify(counts)}.`,
    );
  if (toolId === "key-derivation" && expected > 0 && occurrences(html, 'Function("binder",') !== 1)
    throw new Error("Deriver changed the reviewed Argon2 compatibility fallback.");
  if (
    expected > 0 &&
    ["activity-viewer", "discovery-scanner"].includes(toolId) &&
    (occurrences(html, "new Function") !== 2 ||
      occurrences(html, "Function(${o})") !== 1 ||
      !html.includes('return import("node:zlib")'))
  )
    throw new Error(`${toolId} changed the reviewed, CSP-blocked SDK glue paths.`);
}

/** Every TypeScript file below `directory`, with its text. */
export function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith(".ts")
      ? [{ path, text: readFileSync(path, "utf8") }]
      : [];
  });
}

/**
 * The built artifact of `toolId`, refused unless it carries the fingerprint of the current source
 * tree. `label` names the artifact in a refusal.
 */
export function currentArtifact(root, profile, toolId, label) {
  const tool = getToolBuild(profile, toolId);
  const html = readFileSync(resolve(root, "dist", tool.artifactRelativePath), "utf8");
  const expectedFingerprint = createBuildInfo(root, tool.checksumFile, profile).fingerprint;
  if (!html.includes(expectedFingerprint))
    throw new Error(
      `${label} artifact does not contain the fingerprint of the current source tree.`,
    );
  return {
    tool,
    html,
    checksumPath: resolve(root, "dist", tool.artifactDirectory, tool.checksumFile),
  };
}

/** Refuses a page that is not exactly one HTML document with one style and one script element. */
export function assertSingleDocument(html, label) {
  for (const [marker, expected] of [
    ["<!doctype html>", 1],
    ['<html lang="en">', 1],
    ["</html>", 1],
    ["<style>", 1],
    ["</style>", 1],
    ["<script>", 1],
    ["</script>", 1],
  ]) {
    const actual = occurrences(html, marker);
    if (actual !== expected)
      throw new Error(`Expected ${expected} ${label} ${marker} marker; found ${actual}.`);
  }
}

/** The ids of `markup`, refused when one is used twice. */
export function uniqueIds(markup, label) {
  const ids = [...markup.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate HTML IDs.`);
  return ids;
}

/**
 * The SHA-256 of the page, refused unless the checksum file next to it records the same; a
 * checksum file that names the page must name it as `fileName`.
 */
export function assertRecordedChecksum(html, checksumPath, label, fileName) {
  const actual = createHash("sha256").update(html).digest("hex");
  const [recorded, name] = readFileSync(checksumPath, "utf8").trim().split(/\s+/u);
  if (recorded !== actual || (fileName !== undefined && name !== fileName))
    throw new Error(`${label} SHA-256 checksum file does not match its HTML.`);
  return actual;
}
