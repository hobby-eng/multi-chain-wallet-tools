/** Confirmed host defects, separate from an expected upgrade or excluded release acceptance. */
export const FINDINGS = [
  {
    id: "AUD-032-BLD002",
    category: "BLD",
    severity: "medium",
    title: "A build without MnemoCode refuses the shared standard SSKR seed-width module",
    affectedFiles: ["tooling/key-derivation-composition.mjs"],
    reproduction:
      "Build the Dash Deriver with --exclude mnemocode while its standard SSKR feature remains selected.",
    expected:
      "Remove MnemoCode panels and operations while standard SSKR keeps the exact shared policy constants it needs.",
    observed:
      "The selective-no-mnemocode command failed on source/sskr/share-platform.ts, imported for SEED_BYTES by the standard host.",
    impact:
      "A supported selective build fails to compile. No spending-authority or secret-isolation compromise was demonstrated.",
    recommendedFix:
      "Allow that exact shared input only when the real standard SSKR host is present; preserve negative checks for absent SSKR and unrelated MnemoCode code.",
    requiredVerification:
      "Compile the affected selective artifact and retain source-graph positive/negative controls.",
    evidence: [
      "local AUD-032-evidence/selective-no-mnemocode.command.json",
      "tooling/mnemocode-shared-admission.test.mjs",
    ],
  },
  {
    id: "AUD-032-SEC001",
    category: "SEC",
    severity: "low",
    title: "Unsupported SSKR selectors are repeated and coerced in host refusals",
    affectedFiles: ["packages/recovery-backup/src/sskr-codec.ts"],
    reproduction:
      "Call SskrCodec.create with the synthetic unknown selector used in sskr-bridge-boundary.test.ts. The before-fix refusal contains that supplied text; object selectors reach String().",
    expected:
      "Refuse an unsupported selector with an owned stable code and constant safe text, without coercion.",
    observed:
      "The before-fix fixture failed on selector echo. The original adapter explicitly formatted String(encoding).",
    impact:
      "A value pasted into the wrong field can be repeated in failure presentation. No network disclosure, real secret or wallet compromise was demonstrated.",
    recommendedFix: "Use the codec's one error catalog and an own-key string admission check.",
    requiredVerification:
      "Unknown text and object selector privacy controls through the real codec; immutable coded host errors.",
    evidence: [
      "local AUD-032-evidence/sskr-before.command.json",
      "packages/recovery-backup/tests/sskr-bridge-boundary.test.ts",
    ],
  },
  {
    id: "AUD-032-API001",
    category: "API",
    severity: "medium",
    title: "Group values are read repeatedly before byte packing",
    affectedFiles: ["packages/recovery-backup/src/sskr-groups.ts"],
    reproduction:
      "Pass a group whose threshold getter changes after its first read. The original constructor repeatedly validates getters and rereads them for Uint8Array.from.",
    expected:
      "Capture each threshold/count once, validate that snapshot with CheckedSskrBridge.groupSpecifications, then pack its admitted bytes.",
    observed:
      "The before-fix test rejected an initially valid snapshot on a later getter read. Source review also establishes that a value changing only during packing can bypass the validated snapshot.",
    impact:
      "Programmatic group objects can be refused inconsistently or change their packed meaning. UI-created plain records are a narrower case; no recovery loss was demonstrated.",
    recommendedFix:
      "Snapshot the group values and delegate member admission and protocol constants to the shared library.",
    requiredVerification:
      "Single-read getters, 258/259, fractional/negative/NaN refusals, unchanged Envelope group text and official grouped SSKR controls.",
    evidence: [
      "local AUD-032-evidence/sskr-before.command.json",
      "packages/recovery-backup/tests/sskr-bridge-boundary.test.ts",
      "packages/recovery-backup/tests/sskr-groups.test.ts",
    ],
  },
  {
    id: "AUD-032-SEC002",
    category: "SEC",
    severity: "low",
    title: "Host image conversion leaves refused or partial output buffers uncleared",
    affectedFiles: [
      "packages/recovery-backup/src/mnemocode-cards.ts",
      "packages/recovery-backup/src/mnemocode-card-files.ts",
    ],
    reproduction:
      "The original image converter obtains its rasterizer before the PDF cleanup scope, never clears a rejected multi-page result, and accumulates individual outputs without failure cleanup. Sample conversion also retains its source PDF.",
    expected:
      "An owner clears the input PDF on every image conversion exit and clears prior outputs/unprocessed PDFs after a later refusal; successful output transfers to its caller.",
    observed:
      "Source paths lacked those cleanup scopes. The new bounded byte fixtures exercise missing conversion, multi-page refusal, late failure, invalid components and successful transfer without rendering PDFs.",
    impact:
      "Recovery-bearing temporary bytes can outlive the refused export until garbage collection. This is a memory-lifetime defect, not demonstrated exfiltration; JavaScript erasure remains best effort.",
    recommendedFix:
      "One MnemoCodeCardFiles owner for conversion, partial file-set cleanup and archive packing.",
    requiredVerification:
      "Tiny synthetic buffer cleanup and ownership fixtures plus existing page job/plan lifecycle regressions.",
    evidence: [
      "packages/recovery-backup/tests/mnemocode-card-files.test.ts",
      "apps/key-derivation/tests/mnemocode-card-job-lifecycle.test.ts",
    ],
  },
  {
    id: "AUD-032-UI001",
    category: "UI",
    severity: "low",
    title: "Candidate-list save failure is labelled as saved",
    affectedFiles: ["apps/key-derivation/src/ui/recovery-mnemocode-candidates.ts"],
    reproduction:
      "Force the download boundary to throw. The old finally block always labelled the disabled button Candidate list saved.",
    expected: "State that saving failed, wipe the list and stop any repeat save of wiped bytes.",
    observed: "The success label was in finally irrespective of download success.",
    impact:
      "A failed recovery-list download can look successful. The host cannot confirm a browser's eventual filesystem publication, so the new message covers the synchronous save boundary only.",
    recommendedFix:
      "Set the success label only after the save call; handle the refusal with a safe failure message and keep cleanup in finally.",
    requiredVerification:
      "The actual controller reports failure, clears bytes and disables its button under a synthetic save refusal.",
    evidence: ["apps/key-derivation/tests/mnemocode-list-save.test.ts"],
  },
  {
    id: "AUD-032-BLD001",
    category: "BLD",
    severity: "low",
    title: "Current-document gate traverses ignored historical audit evidence",
    affectedFiles: ["tooling/verify-project-facts.mjs"],
    reproduction:
      "Run pnpm check after restoring pinned dependencies. The link gate follows AUD-022-evidence/build-review.md into a historical node_modules file which is no longer present.",
    expected:
      "Check current project documents; each audit validates its ignored evidence against that audit's own snapshot.",
    observed:
      "The retained fast-gates command failed with Broken relative Markdown link in AUD-022-evidence/build-review.md.",
    impact:
      "Valid current project checks fail because a local historical dependency path changed. The CI checkout normally has no ignored evidence; no release-integrity bypass was demonstrated.",
    recommendedFix:
      "Exclude only AUD-number-evidence directories directly under docs/audits from the current-document traversal, preserving retained evidence and its dedicated validators.",
    requiredVerification:
      "The same fast gates pass without editing or deleting historical evidence; report/schema/hash validation remains separate.",
    evidence: [
      "local AUD-032-evidence/fast-gates.command.json",
      "local AUD-032-evidence/fast-gates-corrected.command.json",
    ],
  },
];
