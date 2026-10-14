// AUD-023 build reviewer harness: applies the Dash Community artifact word and registration check
// (findDashArtifactViolations from tooling/verify-dash-community-artifacts.mjs) to selective
// variants built by build-selective-variants.mjs, and to the canonical Dash Community pages in
// dist/ (read only). Exits 1 when a Dash Community page has a violation.
//
//   node docs/audits/AUD-023-harnesses/build-dash-words.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findDashArtifactViolations } from "../../../tooling/verify-dash-community-artifacts.mjs";

const pages = {
  // Dash Community pages: must be clean.
  "kd-dash-community-no-sskr": [
    join(import.meta.dirname, "../AUD-023-evidence/builds/build/kd-dash-community-no-sskr.html"),
    true,
  ],
  "dist Dash Community Deriver": [
    "dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
    true,
  ],
  "dist Dash Community Scanner": [
    "dist/dash-community-edition/discovery-scanner/Dash_Community_Discovery_Scanner.html",
    true,
  ],
  "dist Dash Community Viewer": [
    "dist/dash-community-edition/activity-viewer/Dash_Community_Activity_Viewer.html",
    true,
  ],
  // Multi-Chain profile, Dash only: informational, the edition's branding is expected.
  "kd-dash-alone (multi-chain profile)": [
    join(import.meta.dirname, "../AUD-023-evidence/builds/build/kd-dash-alone.html"),
    false,
  ],
};
let failures = 0;
for (const [label, [path, mustBeClean]] of Object.entries(pages)) {
  if (!existsSync(path)) {
    console.log(`${label}: missing`);
    failures += mustBeClean ? 1 : 0;
    continue;
  }
  const violations = findDashArtifactViolations(readFileSync(path, "utf8"));
  if (mustBeClean && violations.length > 0) failures += 1;
  console.log(`${label}: ${violations.length === 0 ? "clean" : violations.join(", ")}`);
}
process.exitCode = failures === 0 ? 0 : 1;
