"""Render the baseline report from retained local review evidence; never run product code."""
import collections
import datetime
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/AUD-034-evidence"
REPORT = ROOT / "docs/audits/AUD-034-2026-10-15"


def load(name):
    return json.loads((OUT / name).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def public(value):
    if isinstance(value, str):
        return value.replace(str(pathlib.Path.home()), "/home/user")
    if isinstance(value, list):
        return [public(item) for item in value]
    if isinstance(value, dict):
        return {key: public(item) for key, item in value.items()}
    return value


def prose(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "; ".join(prose(item) for item in value)
    if isinstance(value, dict):
        if "path" in value:
            location = value["path"]
            if "start" in value:
                location += f":{value['start']}"
                if value.get("end") != value["start"]:
                    location += f"-{value.get('end')}"
            elif "lines" in value:
                location += f":{value['lines']}"
            return f"`{location}`"
        if "decision" in value and "counterevidence" in value:
            return "; ".join(f"{key}: {value[key]}" for key in ["decision", "defense", "counterevidence", "scopeCorrection"] if value.get(key))
        return "; ".join(f"{key}: {prose(item)}" for key, item in value.items())
    return json.dumps(value, ensure_ascii=True, separators=(", ", ": "))


def publication_text(value):
    """Readable report prose; hashes, IDs, paths and canonical JSON stay unchanged."""
    text = public(value)
    nouns = "files|cases|checks|CHECK|SKILL|skills|source|test|fixture|rows|candidates|candidate|compiled|applied|errors|error|valid|complete|current|historical|syntactic|parsed|numbered|public|medium|low|new|under|confirmed|total|outputs|reports|preceding|responses|pins|byte|MiB|GiB|sharedCSS"
    text = re.sub(rf"([A-Za-z])(\d+)(?=(?:{nouns}))", r"\1 \2", text)
    text = re.sub(rf"(\d+)(?=(?:{nouns}))", r"\1 ", text)
    text = re.sub(r"(\*\*[A-Za-z0-9][^*\n]*\*\*)(?=[A-Za-z0-9`(]|\[)", r"\1 ", text)
    for old, new in {
        "Deriver471": "Deriver (471)", "Public276": "Public (276)",
        "Inspector88": "Inspector (88)", "Build437": "Build (437)",
        "Coordinator395": "Coordinator (395)", "full5638-line": "full 5638-line",
        "Codex32preview": "Codex32 preview", "Codex32src": "Codex32 src",
        "Rust+1.99.0": "Rust +1.99.0", "cargo-mutants27.1.0": "cargo-mutants 27.1.0", "explicitRust": "explicit Rust",
        "GitHub0/10": "GitHub 0/10", "dirty`": "dirty `",
        "`integration": "` integration", "sorted`": "sorted `",
        "ignored`": "ignored `", "Audit34": "Audit 34",
    }.items():
        text = text.replace(old, new)
    return text


snapshot = load("snapshot.json")
deriver = load("review-deriver.json")
inspector = load("review-inspector.json")
connected = load("review-public.json")
build = load("review-build.json")
main = load("coordinator-candidates.json")
main_decisions = {row["key"]: row for row in load("review-challenge.json")["decisions"]}
public_decisions = {row["key"]: row for row in load("review-public-challenge.json")["decisions"]}
cleanup = load("review-deriver-cleanup-challenge.json")
old33 = json.loads((ROOT / "docs/audits/AUD-033-2026-10-15.json").read_text())
prior_rows = json.loads(REPORT.with_suffix(".json").read_text())["findings"] if REPORT.with_suffix(".json").exists() else []
prior_ids = {row.get("candidateKey"): row["id"] for row in prior_rows if row.get("candidateKey")}
counters = collections.Counter()
for previous in prior_rows:
    match = re.fullmatch(r"AUD-034-([A-Z]+)([0-9]+)", previous["id"])
    if match:
        counters[match[1]] = max(counters[match[1]], int(match[2]))
findings = []


def accept(candidate, owner, original=None, challenge=None):
    row = dict(candidate)
    category = row["category"]
    key = row.get("key", row.get("candidateKey", row.get("reference")))
    if original:
        identifier = original
    elif key in prior_ids:
        identifier = prior_ids[key]
    else:
        counters[category] += 1
        identifier = f"AUD-034-{category}{counters[category]:03}"
    result = {
        "id": identifier, "category": category, "kind": "finding",
        "title": row["title"], "severity": row.get("severity", row.get("severityProposal")),
        "status": "open", "releaseBlocking": row.get("releaseBlocking", row.get("releaseBlockingProposal", False)),
        "releaseBlockingReason": row.get("releaseBlockingReason", row.get("releaseBlockingRationale", "Bounded defect; no concrete spending, egress or mandatory gate failure demonstrated.")),
        "locations": row.get("locations", row.get("affectedFiles", row.get("source", row.get("affected", [])))),
        "reproduction": row.get("reproduction", row.get("publicSyntheticReproduction", row.get("minimalPublicSyntheticRepro", "Static source/control-flow comparison at the listed paths."))),
        "expected": row.get("expected", "The declared public contract and pinned coding/security guide are enforced at the actual boundary."),
        "observed": row.get("observed", row.get("publicSyntheticReproduction", "Source trace confirms the stated title; no native execution claim.")),
        "impact": row.get("impact", "Existing conformance/maintenance gap; missing rules do not alone establish a runtime exploit."),
        "evidence": row.get("evidence", {"mode": "static review", "scope": owner}),
        "recommendedFix": row.get("recommendedFix", row.get("fix", "Correct the owning boundary without weakening validation or cryptographic parameters.")),
        "requiredVerification": row.get("requiredVerification", row.get("verification", "Retain a bounded regression for this exact cause and its valid control; native acceptance remains separate.")),
        "checks": row.get("checks", []), "candidateKey": row.get("key", row.get("candidateKey", row.get("reference"))),
        "scopeOwner": owner, "independentChallenge": challenge,
        "sourceFingerprint": snapshot["fingerprint"], "relatedFindings": row.get("relatedFindings", row.get("relatedOriginalAudits", row.get("originalFindingIds", []))),
        "baselineOnly": True,
    }
    if original:
        result["originalFindingRetained"] = True
        result["historicalDisposition"] = "Current follow-up under original ID; prior point-in-time record is not rewritten or disproved by a newer recurrence."
    findings.append(result)
    return result


for candidate in main["candidates"]:
    decision = main_decisions[candidate["key"]]
    row = {**candidate, **{key: decision[key] for key in ["title", "severity", "category", "releaseBlocking", "releaseBlockingReason", "locations", "recommendedFix", "requiredVerification"] if key in decision}}
    row["observed"] = decision.get("counterevidence", candidate["observed"])
    row["checks"] = {
        "main-qr-import-revision": ["CHECK-API-002", "CHECK-API-004", "CHECK-SEC-005"],
        "main-qr-window-retention": ["CHECK-SEC-005", "CHECK-UI-003"],
        "main-roadmap-generator": ["CHECK-DOC-001"],
        "main-markdown-graph-gate": ["CHECK-ARC-001", "CHECK-ARC-003", "CHECK-BLD-005"],
        "main-verification-table-ci": ["CHECK-DOC-002", "CHECK-BLD-005"],
        "main-startup-check-set": ["CHECK-FUN-002", "CHECK-BLD-005", "CHECK-ARC-003"],
    }[candidate["key"]]
    if candidate["key"] == "main-qr-import-revision":
        row["title"] = "A pending QR image import overwrites newer field input"
        row["reproduction"] = "qr-races-v3: start with nonempty synthetic input; defer native bitmap decode, edit the target to new text or empty and emit input, then release the decoder. Both current-field assertions fail. This is not an actual global Clear-button test."
        row["evidence"] = "qr-races-v3.command.json / qr-races-v3.log: two field-edit failures; the third case belongs to Window listener retention. Real importer/chooser/QR encoder and pixel decoder; passive bitmap/canvas/DOM only."
    if candidate["key"] == "main-qr-window-retention":
        row["evidence"] = "qr-races-v3 third failure plus static Window -> pagehide callback -> hide -> controls/popover/payload reachability. Listener accounting only, no GC/heap measurement or extraction."
    accept(row, "coordinator/shared code and documentation", challenge=decision)

for candidate in deriver["confirmedCandidates"]:
    key = candidate["candidateKey"]
    original = {"remaining-local-concealment": "AUD-028-SEC005", "seedqr-qr-gate-loss": "AUD-030-SEC001"}.get(key)
    record = accept(candidate, "Deriver", original, "Main independently read callers and guards; cleanup topics additionally challenged in review-deriver-cleanup-challenge.json. See executionEvidence for real public-entry probes; unexecuted variants remain static.")
    if key in ["remaining-local-concealment", "seedqr-qr-gate-loss", "webcrypto-password-bytes"]:
        record["evidence"] = {"command": "deriver-secret-contracts", "outcome": "2 files,5 genuine failed expectations", "scope": "MHFE card blur/hidden, WebCrypto resolve/reject byte retirement, SeedQR pending PNG after real gate closure; synthetic package/native boundaries, no whole workspace or native browser."}
    if key == "matcher-stale-edit":
        record["evidence"] = {"command": "matcher-revision", "outcome": "1 genuine failure", "scope": "Real installer, client, registry/detector/seed; passive Worker. Obsolete no-match publication after an input edit; private-output variant static."}
    if key == "early-hd-cleanup-scopes":
        record["independentChallenge"] = "Socrates independently confirmed Platform/Identity scope with narrowing: Identity post-return formatting already finally-wipes transferred arrays. Main additionally traced Silent Payments and fingerprint pre-try acquisitions; borrowed inputs and successful return ownership must remain intact. No fault-injection execution."
    if key == "slip39-imported-kdf-cost":
        record["independentChallenge"] = "Main independently traced parse four-bit exponent -> recover -> synchronous four-round PBKDF2 from Restore click. Exponent15 gives81920000 iterations per round,327680000 total for a one-block share; no cost/time was executed or measured. Explicit click does not provide the missing cost disclosure/cancellable worker."
    if key == "automatic-range-help":
        record["independentChallenge"] = "Main checked actual LargeRequestPolicy and current template text. Existing synthetic policy test is a static oracle reference, not a new run."

mhfe = next(row for row in cleanup["candidates"] if row["reference"] == "mhfe-host-verdict-propagation")
mhfe = {**mhfe, "category": "SEC", "requiredVerification": mhfe["verification"]}
mhfe["checks"] = ["CHECK-API-001", "CHECK-API-002", "CHECK-FUN-006", "CHECK-SEC-005", "CHECK-UI-003"]
result = accept(mhfe, "Deriver; independently discovered by cleanup challenger", challenge="Main independently read tab/task/run/workspace and imported PackageCheck, then reproduced the host wiring failure with actual tab/task/run/gate and synthetic package replies.")
result["evidence"] = {"command": "mhfe-verdict-gate", "outcome": "2 cases: all-passed control passes; passed:false leaves ready=true and zero failure notification", "limits": "No actual wrong published vector, KDF, WASM or native browser execution. Same-class fullCheck failure already latches; published-vector verdict does not."}
result["relatedFindings"] = ["AUD-023-SEC001"]

for candidate in connected["candidates"]:
    record = accept(candidate, "Activity/Discovery/public network", challenge=public_decisions[candidate["key"]])
    if candidate["key"] in ["core-flow-invalid-amount", "identity-base58-width", "dash-minimum-batch-estimate", "blob-worker-constructor-cleanup"]:
        record["evidence"] = {"command": "public-contracts", "outcome": "4 genuine failures", "scope": "Real entry points with passive fetch/Worker boundaries; estimate uses paper600-phrase arithmetic only, no wallet scan/egress."}

for candidate in inspector["candidates"]:
    row = accept(candidate, "PSBT/Script/descriptor/BIP38 Inspector", challenge="Main independent source/caller/markup trace in inspector-challenge-main.json; five public API/installer failures and one actual official-vector BIP38 edit failure retained. No real browser, Core RPC or full BIP38 campaign.")
    row["checks"] = {
        "script-network-selection": ["CHECK-FUN-004", "CHECK-UI-002"],
        "bip38-edits": ["CHECK-FUN-003", "CHECK-API-002", "CHECK-SEC-005"],
        "ranged-origin-validation": ["CHECK-FUN-004", "CHECK-API-004"],
        "path-card-threshold": ["CHECK-FUN-004", "CHECK-UI-002"],
        "policy-threshold-projection": ["CHECK-FUN-004", "CHECK-UI-002"],
        "copy-bindings": ["CHECK-UI-002", "CHECK-API-004"],
        "witness-only-binding-label": ["CHECK-FUN-005"],
        "selection-invert-disabled": ["CHECK-UI-002"],
        "dash-rpc-download-hidden": ["CHECK-UI-002", "CHECK-API-004"],
        "policy-lock-kind": ["CHECK-FUN-004", "CHECK-API-001"],
        "ranged-branch-kind": ["CHECK-FUN-004", "CHECK-API-001"],
    }[candidate["key"]]

for candidate in build["confirmedCandidates"]:
    if candidate["key"] == "markdown-asset-aborts-boundary-graph":
        continue  # One checker root already accepted from main; no duplicate ID.
    row = accept(candidate, "Build/CI/Rust/WASM/imported sources", candidate.get("originalFindingId"), "Main independent source/event/ownership trace in build-challenge-main.json; real canonical comparison/action checker executed, no destructive packaging or remote CI run.")
    if candidate["key"] == "marked-code-list-estimate-truncates-candidates":
        row["evidence"] = {"command": "marked-list-completeness", "result": "1genuinefailure:128validpubliccompletions,8estimated,listadmitted,100rowsreturnedwithouttruncation. Real marked-code owners and public synthetic fingerprint service, no KDF/WASM/egress.", "independentDomainControl": "marked-domain-oracle:1casepass,all128distinct completions accepted by @scure/bip39,invalidchecksumnegativecontrol refuses. No seed/KDF.", "source": candidate["locations"]}
        row["relatedFindings"] = ["AUD-023-FUN001"]

if (OUT / "review-shared-css.json").exists():
    for candidate in load("review-shared-css.json")["candidates"]:
        reproduction = candidate["minimalPublicSyntheticRepro"]
        row = {**candidate, "category": "UI", "expected": reproduction["expected"], "observed": reproduction["observedFromSource"], "requiredVerification": candidate["verification"], "checks": ["CHECK-UI-001", "CHECK-UI-002", "CHECK-ARC-003"]}
        accept(row, "Shared styles; actual Inspector consumers", challenge="Main independently read selectors, actual nested map DOM, toolCss order and final heading/print cascade; css-challenge-main.json. Source selection only, no native CSS/print/contrast measurement.")

if (OUT / "late-candidates-main.json").exists():
    imported_decisions = {row["key"]: row for row in load("review-challenge.json")["supplementalImportedApiChallenge"]["decisions"]}
    decision_keys = {"sskr-unknown-ur-type-echo": "imported-sskr-ur-type-echo", "unicode-scalar-surrogate": "imported-word-table-lone-surrogate", "saved-card-duplicate-quorum": "imported-saved-note-duplicate-members"}
    for candidate in load("late-candidates-main.json")["candidates"]:
        if candidate["key"] not in decision_keys:
            continue  # Release-note count remains an observation after independent history challenge.
        decision = imported_decisions[decision_keys[candidate["key"]]]
        assert decision["decision"].startswith("confirmed")
        accept(candidate, "Exact imported MnemoCode API and direct host integration", challenge=decision)

existing = {row["id"] for row in findings}
for candidate in old33["findings"]:
    if candidate["id"] in existing or candidate["id"] == "AUD-033-ARC004":
        continue
    row = accept(candidate, "Retained CORE migration debt; all four domains", candidate["id"], "Current scoped source traces, type-aware980-file lint and explicit negative gate evidence; no new defect ID assigned to the same root.")
    row["checks"] = {"ARC": ["CHECK-ARC-001", "CHECK-ARC-002", "CHECK-ARC-003"], "API": ["CHECK-API-001", "CHECK-API-004"], "DOC": ["CHECK-DOC-002", "CHECK-ARC-003"]}[candidate["category"]]
    row["evidence"] = {"original": candidate.get("evidence"), "current": "review-deriver.json retainedFindingDispositions, review-inspector.json inheritedConfirmed, public/build regression ledgers; lint-all1094diagnostics and format-all2files are conformance evidence, not independent vulnerability counts."}

commands = []
command_notes = {
    "baseline-check": "Passed metadata/facts/TypeScript/copy checks;678 source files. This command omits required lint/code-rule/Rust gates.",
    "lint-all": "Failed configured owned-code scope:980 files,1094 error diagnostics; imported/generated paths excluded. Grouped conformance debt, not1094 independent defects.",
    "format-all": "Failed two baseline files:adapter-settings.test.ts and recovery-sskr-wasm/UPSTREAM_NOTICES.md; no formatter applied to baseline.",
    "shared-runtime-fd": "13files104cases passed; authoritative rerun after fixing logger capture.",
    "shared-runtime": "Exit0 but empty pipe-capture log: unusable case-count evidence; superseded by shared-runtime-fd.",
    "qr-races": "Exit1, empty pipe capture; unusable failure detail.",
    "qr-races-fd": "Retained first fixture failure: FileChoice.after input capture was wrong; not counted as a product failure.",
    "qr-races-v2": "3failed expectations; empty edit began blank, so no true populated-field clearing proof; strengthened byv3.",
    "qr-races-v3": "1file3genuine failures:2real nonempty->edit/empty publication failures and1listener-release observation; no actual Clearbutton or heap/GC claim.",
    "matcher-revision": "1genuine failure: obsolete no-match reply publishes after source edit; actual installer/client, passiveWorker.",
    "inspector-contracts": "5genuine failures: unknownPolicyLock,invalidrangedorigin,branch2,thresholdpathavailability,Bitcoinregtest->Dashmainnet address.",
    "inspector-bip38-edit": "1genuine failure: one official public BIP38vector through real decryptor/installer,386ms KDF case; old completion clears newer password.",
    "public-contracts": "1file4genuine failures at actual public entries, synthetic provider/native boundaries; no egress or600-phrase run.",
    "deriver-secret-contracts": "2files5genuine failures:MHFEblur/hidden,WebCryptoownedencodingsresolve/reject,SeedQRpost-gate PNG publication. No KDF/nativebrowser.",
    "mhfe-verdict-gate": "1file2cases:1passed all-pass control,1failed false-verdict closure. Synthetic package replies; actual tab/task/run/gate.",
    "deterministic-backbone": "5files35cases passed:BIP39/BIP32/BIP85/Bitcoin/Ethereum/DashCore; no full vector suite.",
    "public-nearest-regressions": "6files29cases passed:Core parsing,Identity pagination/budget,estimate,exports; baseline tests miss the confirmed boundary cases.",
    "boundary-gates": "3files:2pass,1failed suite,beforeAll abort;49passed,6skipped. Real Markdown asset unresolved by verifier; no product build failure inferred.",
    "startup-main": "Exit1 strict expected-label set stale; report passed:true,missing:none. Not a cryptographic wrong answer.",
    "startup-dash": "Exit1 same expected-label root as main; report passed:true,missing:none.",
    "action-pins": "22 approved-table mismatches; existingAUD033BLD002. FullSHApins still used, no action compromise shown.",
    "wasm-producers": "Fails canonical integrity equality before producer iteration; not evidence every module producer is wrong.",
    "canonical-comparison": "Read-only actual source/generated map:onlySSKR sourceaggregate+3generatedfiles mismatch. Orchard export metadata confirms obsolete InitOutputhelpers. Public WASMmodule compiled for metadata, never instantiated; no rebuild/secret call.",
    "historical-records": "All33preceding numbered JSONrecords parse/schema/MD-ID structuralchecks pass; no replay of old results.",
    "advisory-audit": "40second timeout exit124,no response; advisory state UNASSESSED, not clean.",
    "mutants-preview": "cargo-mutants27.1.0 with explicitRust+1.99.0:12candidateedits,0applied/0compiledmutants. Dirty/shared checkout prerequisites prevent campaign; no stash/reset/commit.",
    "sskr-refusal": "1 genuine refusal-text failure with real committed SSKR WASM and checked codec. Synthetic1-of-1create/restore control passed, then unknownURtype echoed. No rebuild or KDF; this probe DOES instantiate SSKR WASM.",
    "mnemocode-direct-contracts": "3 genuine direct-API failures:2 lone surrogate cases and duplicate-member saved-card advice. Valid scalar/distinct-share controls passed; real host note wrapper and exact imported class. Guarded ordinary UI paths are not failures.",
    "marked-list-completeness": "1 genuine complete-list failure:128validcompletions,8estimated,listadmitted,100returned. No truncation state. Real owners/public fingerprint service; no KDF/WASM/egress. Overflow refusal is a valid correction; this baseline returns the complete-list discriminator.",
    "marked-domain-oracle": "1 case passed:all128distinct counterexample completions accepted by independent @scure/bip39 admission; invalidchecksum control refused. No seed derivation/KDF/WASM. This establishes input validity separately from the list owner's generator.",
}
for path in sorted(OUT.glob("*.command.json")):
    item = json.loads(path.read_text())
    item["recordSha256"] = digest(path)
    item["interpretation"] = command_notes.get(item["label"], "Preserve exact command, exit and log; no broader claim.")
    commands.append(item)

skills = load("skills-applicability.json")
for item in skills:
    if item["name"] in ["rust-review", "microsoft-rust-guidelines", "dimensional-analysis"]:
        item.update(status="applied", scope="Bounded static checklist:Rust/FFI/API/features, ownership and dimensional units across Rust/public/Inspector; no native workflow or source annotation.", execution="See domain skillsApplied/skills, no Rust build or compiler/timing proof.")
    if item["name"] == "constant-time-analysis":
        item.update(status="applied", scope="Source-level secret/public classification and selected arithmetic/control-flow review only; no compiler/assembly or JIT timing assurance.", execution="Bounded static method; exact compiler/artifact constant-time proof unexecuted.")
    if item["name"] == "agentic-actions-auditor":
        item.update(status="not-applicable", scope="All current GitHub workflows inspected; no AI-agent action or prompt/execution bridge found. Ordinary event/permission/action pin review performed under CI policy.", execution="No agentic Actions scan/run.")
    if item["name"] == "address-sanitizer":
        item.update(status="blocked", scope="No matching instrumented native/FFI test target and no nightly Rust toolchain for sanitizer execution; canonical browser modules and transitive native engine are not an ASan campaign. A whole-tree baseline does not make memory safety inapplicable.", execution="Not executed; compiler availability alone is not an instrumented result.")
    if item["name"] == "wycheproof":
        item.update(status="blocked", scope="No pinned Wycheproof corpus and compatible first-party runner are installed/selected. Cryptographic vector checks remain applicable; existing protocol fixtures are separate evidence.", execution="No Wycheproof campaign or primitive-wide assurance.")
    if item["name"] == "supply-chain-risk-auditor":
        item.update(status="applied-with-blocked-execution", scope="Local exact pins/import provenance and license/build recipes reviewed. Collector lacks uv/pnpm transitive support; advisory request timed out.", execution="Bounded local checklist applied; native collector, live advisory/publisher/maintainer analysis NOT performed.")

check_titles = re.findall(r"^### (CHECK-[A-Z]+-[0-9]+) — (.+)$", (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text(), re.M)
checks = []
for identifier, title in check_titles:
    candidates = [row["id"] for row in findings if identifier in row["checks"]]
    per_scope = {}
    for name, rows in [("Deriver", deriver["checks"]), ("Public", connected["checks"]), ("Inspector", inspector["procedureChecks"]), ("Build", build["checks"])]:
        matches = [row for row in rows if row.get("id", row.get("checkId")) == identifier]
        per_scope[name] = matches
    checks.append({"id": identifier, "title": title, "outcome": "failed / execution incomplete" if candidates else "static review / execution incomplete", "confirmedFindingIds": candidates, "scopeEvidence": per_scope, "limitation": "A scoped static trace or targeted test does not complete every tool/profile/browser/provider/release combination of this CHECK."})

reviews = ["review-deriver.json", "review-public.json", "review-inspector.json", "review-build.json", "review-challenge.json", "review-public-challenge.json", "review-deriver-cleanup-challenge.json", "build-challenge-main.json", "inspector-challenge-main.json", "review-coordinator-coverage.json"]
for extra in ["review-shared-css.json", "css-challenge-main.json"]:
    if (OUT / extra).exists():
        reviews.append(extra)
if (OUT / "coverage-completeness.json").exists():
    reviews.append("coverage-completeness.json")
review_bindings = [{"path": f"docs/audits/AUD-034-evidence/{name}", "sha256": digest(OUT / name)} for name in reviews]
operation_traces = {"Deriver": deriver["publicOperationTraces"], "Public": connected["operationTraces"], "Inspector": inspector["operations"], "Build": build["operationTraces"], "Coordinator": [
    {"operation": "Shared import and QR publication", "trace": "FileChoice->image admission->native decode->real QR decoder->input callbacks; createQrAction->QrPngExport->downloadBlob", "branches": "new edit/empty/removal/readiness/pagehide; passive native delays; native lifecycle gaps explicit"},
    {"operation": "Shared export helpers", "trace": "exactAtomic/csvCell/workbook/filename/download owners and consumer modules", "branches": "formula cells,exact integers/units,Blob URL cleanup,field selection; selected104runtimecases"},
    {"operation": "Audit and provenance records", "trace": "snapshot catalogue/ASTinventory->domainreview->independentchallenge->completeness->canonicalMD/JSON", "branches": "invalidcaptureretained,duplicateIDs/schema,oldresultsnotrerun,UTC/privacy,finalsourceidentity"},
    {"operation": "Root documentation/configuration", "trace": "capabilities and32CHECK guarantees->document claims->realowner/gate/source", "branches": "two stale documentation candidates;historicalreleaseclaims not re-certified"},
]}
limitations = [
    "This is a whole-repository baseline with bounded execution, not release acceptance, independent cryptographic certification, proof of absence of defects or completion of the CORE migration.",
    "Full default/selective matrix, real Chromium/Firefox/file lifecycle/layout/accessibility, native launchers/OSes, canonical Docker/WASM regeneration, full-cost vector/KDF replays, external Core RPC/hardware-wallet/provider/chain conformance and live funds were not executed.",
    "Published cryptographic source/specification/vector call paths were reviewed locally; transitive dependency implementations and upstream source/specification freshness were not exhaustively re-audited. No timing/optimizer/guaranteed-erasure proof.",
    "Advisory lookup timed out with no usable response; unavailable scanner/fuzzer/collector/native workflows are not passes.12mutationpreview candidates are not12bugs; no compiled mutation campaign.",
    "1667file identity coverage and4548syntactic declarations do not imply1667complete semantic proofs or4548active runtime operations. Per-file method, operation family traces and separate completeness limits control the claim.",
    "The307audit-directory allocation includes295retained historical paths plus12current procedural resources. Historical assertions retain structural/provenance limits and are not replayed; current shared Python helpers were read in full. External release/distribution claims were not newly authenticated.",
    "Passive DOM/Worker/fetch/canvas/subtle boundaries exercise actual host modules but do not establish native rendering, scheduling, structured clone, CSP, download/clipboard permissions, extraction or GC behavior.",
    "Producer sessions remain independent. New peer candidates are not silently imported into this frozen audit; direct-library candidates need exact producer contracts and host reachability before adoption.",
    "No baseline production/test/dependency/workflow/vendor fix, commit, push, tag, release or paid CI dispatch occurred. All audit failures are retained for a separate remediation phase after this report.",
]
report = {
    "schemaVersion": 1, "auditId": "AUD-034", "auditNumber": 34, "date": "2026-10-15",
    "title": "All-files baseline: CORE conformance, wallet correctness, integration and audit tool evidence",
    "reviewer": {"name": "Codex coordinator with five read-only domain/challenge/completeness reviewers", "model": None, "reasoningEffort": None},
    "snapshot": {"commit": "8bdd37a0dd94351b44018367bf628dfc902bc814", "commitComplete": False, "workingTree": "Dirty authorized/inherited integration tree, branchv0.1.5-preparation; baseline status/patch retained. Source frozen before all AUD034 tests, no baseline fixes.", "sourceFingerprint": snapshot["fingerprint"], "capturedUtc": snapshot["utc"], "algorithm": snapshot["algorithm"], "files": len(snapshot["files"]), "currentSourceFiles": 1360, "historicalFiles": 307},
    "scope": {"tools": ["Key Derivation Tool (first implementation priority)", "Activity Viewer", "Discovery Scanner", "PSBT/Script/Multisig Inspector", "shared packages", "build/CI/native/Rust/WASM/imported dependencies", "tests/docs/audit records"], "profiles": ["multi-chain", "dash-community", "selective composition source"], "coins": ["Bitcoin families", "Ethereum", "Dash Core/Platform/Identity/Orchard"], "filePartitions": {"Deriver": 471, "Public": 276, "Inspector": 88, "Build": 437, "Coordinator": 395}, "mode": "Frozen baseline; main implements only after report, reviewers read-only; distinct authors, independent challenge and separate completeness phase.", "resourceBudget": "At most5read-only reviewers,128MiB VM each/640MiB combined; one main runtime at a time,640MiB JS heap (<=1GiB process target),3GiB reserve, pause below4.5GiB available; no full2GiBArgon2 run."},
    "procedureHashes": load("procedure-hashes.json"), "checks": checks, "findings": findings, "observations": [],
    "remediation": [{"id": row["id"], "status": "open", "fixCommit": None, "verificationCommit": None, "evidence": "Baseline-only finding; no fix applied. Preserve original ID, failing evidence and host/upstream ownership in follow-up."} for row in findings],
    "limitations": limitations, "toolVersions": load("tool-versions.json"), "toolPrerequisites": load("tool-prerequisites.json"), "newSkills": skills,
    "toolingPolicy": "Tools already available in the current setup were inspected; this audit installed no scanner, fuzzer, dependency or toolchain. Skill availability is methodology, not executed test coverage. Local CORE/RUST/security rules override imported advice.",
    "skillsProvenance": {"trailOfBitsCommit": "e1f86a390d4caf28bf1c377a7d86707b2898669c", "archiveSha256": "61065c2d9f90b9dac67fb65765bc57670f51d91094e3b8d4f6ace24d91f64295", "importedUtc": "2026-10-15T11:14:06Z", "license": "CC-BY-SA-4.0", "routing": "/home/user/Documents/bip_tools/.github/skills/README-trailofbits-skills.md", "method": "Scoped checklists adapted to local review budget/frozen baseline; native Workflow/Serena runtimes not claimed."},
    "executionEvidence": commands, "retainedBuildEvidence": load("retained-deriver-builds.json"), "reviewBindings": review_bindings,
    "coverage": {"fullFileInventory": snapshot["files"], "ledgerBindings": review_bindings, "publicDeclarations": {"method": load("public-api-candidates.json")["method"], "parsedFiles": 1179, "missed": [], "candidateCount": 4548, "sha256": digest(OUT / "public-api-candidates.json"), "semanticMeaning": "Types/reexports/classes/members included; not4548executed or distinct runtimeoperations."}, "publicOperationFamilies": operation_traces, "domainDepth": {"Deriver": deriver.get("coverageSummary"), "Public": connected.get("readCounts"), "Inspector": inspector.get("counts"), "Build": build.get("counts")}, "coordinatorFileMethods": load("review-coordinator-coverage.json")},
    "priorFindingDispositions": {"AUD-033-ARC004": "Fixed in current source by MhfeWaiting/ReviewResult explicit wait values; main read choose/reviewed/settings and MhfeTask. No new runtime verification of every caller claimed; original baseline report untouched.", "rule": "Current recurrence/remaining variants of AUD028SEC005,AUD030SEC001,AUD028BLD001 and remaining7AUD033roots keep originalIDs; new owners/causes use AUD034IDs with related cross-references."},
    "refutedAndUnresolved": {"Deriver": {key: deriver.get(key) for key in ["observations", "refutedCandidates", "unresolvedGaps", "regressionDispositions"]}, "Public": {key: connected.get(key) for key in ["optionalObservations", "refutedCandidates", "unresolvedGaps", "regressionList"]}, "Inspector": {key: inspector.get(key) for key in ["observations", "refutedCandidates", "unresolvedGaps", "regressionReview"]}, "Build": {key: build.get(key) for key in ["optionalObservations", "refutedCandidates", "unresolvedGaps", "regressionChecklist"]}, "Coordinator": load("coordinator-context.json")},
}
if (OUT / "coverage-completeness.json").exists():
    report["separateCompletenessReview"] = load("coverage-completeness.json")
if (OUT / "final-source-identity.json").exists():
    report["finalSourceIdentity"] = load("final-source-identity.json")
if (OUT / "peer-mnemocode-confirmation.json").exists():
    report["producerConfirmation"] = load("peer-mnemocode-confirmation.json")
if (OUT / "peer-mhfe-pending-handover.json").exists():
    report["pendingMhfeHandover"] = load("peer-mhfe-pending-handover.json")
method_rows = {row["path"]: row for row in load("review-coordinator-coverage.json")}
for author in [deriver, connected, inspector, build]:
    for row in author["coverage"]:
        assert row["path"] not in method_rows, "Duplicate coverage allocation"
        method_rows[row["path"]] = row
assert len(method_rows) == 1667
report["coverage"]["fullFileInventory"] = [{
    **row,
    "reviewMethod": method_rows[row["path"]]["method"],
    "reviewLevel": method_rows[row["path"]].get("reviewLevel", method_rows[row["path"]].get("reviewDepth", method_rows[row["path"]].get("classification"))),
    "operationsOrGuarantees": method_rows[row["path"]].get("operationsOrGuarantees", []),
    "reviewLimitations": method_rows[row["path"]].get("limitations", []),
} for row in snapshot["files"]]
report["snapshot"].update(auditDirectoryEntries=307, retainedHistoricalEntries=295, currentProceduralResourcesInAuditDirectory=12)
report["coverage"]["perFileMethodsPublished"] = 1667
report["minimalDiagnostics"] = []
for label in ["startup-main", "startup-dash", "boundary-gates", "wasm-producers", "format-all"]:
    log_lines = (OUT / f"{label}.log").read_text().splitlines()
    headlines = [line for line in log_lines if line.startswith("Error:") or line.startswith("[warn]")]
    report["minimalDiagnostics"].append({"command": label, "headlines": headlines[:5], "publication": "Exact diagnostic headline, owner home path redacted; raw log hash in executionEvidence, full raw output local only."})
report["lintDiagnosticGroups"] = load("lint-summary.json")
report["completenessMetadataClosure"] = {
    "findingCheckLinks": "The independent completeness reviewer identified12unlinked findings. Main applied suggested guarantee mappings plusMHFEsecret-lifecycle/UI scope and regenerated forward/reverse ledgers; no new source fix or runtime claim.",
    "perFileMethodPublication": "All1667rows publish method, operation/guarantee and limitation fields; exact domain ledger SHA bindings remain, raw evidence local.",
    "diagnosticPublication": "Minimal exact gate/format headlines and all lint rule-group counts published; full raw logs local with hashes, warnings not inferred absent.",
    "historicalBucket": "Frozen historical-audit label means307directory entries:295retained historical paths plus12current procedural resources; original inventory/fingerprint unchanged.",
}
report["finalGuaranteeDispositions"] = {
    "mhfe-self-test-gate": "Confirmed AUD-034-SEC008 by independent package-latch challenge and actual host wiring probe; supersedes earlier domain unresolved-only wording. No actual current bad MHFE vector observed.",
    "matcher-worker-finally": "Not confirmed for normal separate DOM tasks; contrived same-task ordering alone is insufficient.",
    "peer-direct-cancellation": "Host MissingCodes checks signal after await/finally-wipes; direct JointPlan is not used. Producer outcomes do not automatically establish host publication defects.",
    "source-generated-sskr": "Canonical source/output mismatch confirmed under original AUD-028-BLD001; no regeneration without separately authorized coherent producer/canonical inputs.",
    "other-contract-questions": "Identity transfer membership, finite branch-ceiling partial states, staged-descriptor dual-source and parser pre-depth bounds remain explicitly unresolved, with static limits/real UI guards stated in domain records. No expensive replay required to label them unassessed.",
    "interpretation": "Per-domain records preserve their author's intermediate limits. Final challenge/completeness/guarantee dispositions control the current report; a superseded pending label is not a new uninvestigated finding.",
}
report["finalGuaranteeDispositions"]["imported-api-contracts"] = "SSKR unsafe UR-type refusal, lone-surrogate public helper and duplicate-member public saved note are confirmed under new host IDs with qualified producer cross-references. Ordinary dictionary/card UI guards remain positive controls; no automatic assertion that all peer findings affect UI. MissingCodes/directJointPlan stop outcomes remain guarded host controls."
report["informationalReleaseNoteChallenge"] = load("review-challenge.json").get("supplementalReleaseNoteChallenge")
report = public(report)
REPORT.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n")

severity = collections.Counter(row["severity"] for row in findings)
new = sum(row["id"].startswith("AUD-034-") for row in findings)
blocked = [row["id"] for row in findings if row["releaseBlocking"]]
lines = ["# AUD-034 — All-files baseline and audit tool evidence", "", "## Record metadata", "",
         "- **Audit number:**34. **Completed (UTC):**2026-10-15. **Model/effort:**unknown/unknown for coordinator and reviewers; not inferred.",
         f"- **Reviewed commit:**`{report['snapshot']['commit']}`; dirty`v0.1.5-preparation`integration tree. No commit/push or baseline fix.",
         f"- **Baseline captured (UTC):**`{snapshot['utc']}`. **Source fingerprint:**`{snapshot['fingerprint']}`.",
         "- **Identity algorithm:** SHA-256 of sorted `path + NUL + file SHA-256 + LF`; 1360 current files. 307 historical audit-directory files separately inventoried; 1667 total. Audit 34 outputs excluded.",
         "- **Canonical record:**[JSON](AUD-034-2026-10-15.json). **Rerun scripts:**[harnesses](AUD-034-harnesses/README.md). Raw logs, snapshots, patch and review ledgers stay local in ignored`AUD-034-evidence/`.", "",
         f"**Assessment:** {len(findings)} confirmed open roots/retained groups: **{new} new**, **{len(findings)-new} under original IDs**; {severity['medium']} medium, {severity['low']} low. No high/critical finding confirmed. This does not establish absence of other defects. CORE migration and release acceptance remain incomplete.",
         "", "**Blocking findings:**" + ", ".join(f"`{item}`" for item in blocked) + ". Each reason is in its finding; unavailable full release/browser evidence is an additional limitation.", "", "## Finding register", "",
         "| Finding / record ID | Category | Kind | Severity | Status | Title |", "| --- | --- | --- | --- | --- | --- |"]
for row in findings:
    lines.append(f"|{row['id']}|{row['category']}|finding|{row['severity']}|open|{row['title']}|")
lines += ["", "## Review evidence", "", "### Scope and methodology", "",
          "The baseline covers Deriver, Activity Viewer, Discovery Scanner, Inspector, shared modules, Rust/native/WASM boundaries, imported MnemoCode/MHFE code, tests, docs and CI/build/release source in both editions. Deriver work was completed as one cohesive integration block before freezing this audit. No audit defect was fixed during the baseline.",
          "", "The source catalogue uses git ls-files --cached --others --exclude-standard. Ignored installed dependencies,toolchain caches,target,dist,.git and local evidence are not first-party source entries; committed generated modules are included. Retained build artifacts are a separate identity class. Transitive internals and historical execution claims retain the limits below.",
          "", "Five read-only reviewers divide Deriver471, connected/public276, Inspector88 and build/imports437files; the coordinator owns395, including295retained historical paths and12current procedural resources. Main independently challenges other authors; a different reviewer challenges main/public candidates and separately evaluates completeness. Cleanup challenge found the MHFE verdict producer defect, which main independently reproduced. Self-challenge alone is not independent review.",
          "", "Review waves use local rules before imported skills. At most5reviewers/128MiB each; main executes one bounded runtime at a time with640MiB JS heap,3GiB reserve. No full2GiB KDF campaign, project copy/worktree, sibling edit, source reset or remote CI invocation.",
          "", "The complete per-file identity catalogue, methods, guarantees and limits for all1667paths are published in the canonical JSON. Original domain ledgers are additionally hash-bound there. Operation inventory has1179parsedTS/JS/MJSfiles,0parse misses and4548syntactic declarations, including types/reexports; these are **not4548active runtime operations**. The JSON separately records selected actual operation-family call paths and branch limits. Hashing, reading, static tracing, passive-boundary execution, retained builds and native acceptance are distinct evidence levels.", "",
          "| Domain | File/read method at completion | Limits |", "| --- | --- | --- |",
          "|Deriver471|313source bodies,152test/support bodies,full5638-line template,2fixtures,orderedwordlist,classification data and lock provenance|Local fixture/source contracts; no canonical upstream data authentication or complete browser/vector execution.|",
          "|Public276|All276source,test/support and HTML/CSS bodies read; actual provider/proof/export contracts traced|Native realms,provider/SDK internals and live/consensus behavior unexecuted.|",
          "|Inspector88|83full text/source/test/markup records and5structured public fixture/provenance records|No new Core RPC,signature satisfier/hardware or actual browser acceptance.|",
          "|Build437|411complete text bodies,2complete executable glue bodies with embedded WASM literals excluded,6structured data/provenance files,18binary artifacts|Binary instruction semantics,transitive crypto/native C,optimizer/timing and canonical reproduction not established.|",
          "|Coordinator395|88current source/test/config/docs/style files;307audit-directory entries,including12shared procedural resources and4fully read Python helpers|Historical execution/results not replayed; binary/rendered/external claims remain provenance limits. All4516sharedCSSlines statically read,without a native renderer.|", "",
          "### Procedure identities", "", "| Procedure/instruction | SHA-256 |", "| --- | --- |"]
for item in report["procedureHashes"]:
    lines.append(f"|`{item['path']}`|`{item['sha256']}`|")
lines += ["", "### New tools and skills: availability versus actual use", "",
          "The current setup adds type-aware oxlint/oxlint-tsgolint, cargo-mutants and the imported Trail of Bits/adapted skill collection to the audit methods. **No tools were installed by this audit.** Exact versions and prerequisite paths are in JSON; a skill installation supplies instructions, not a completed scan or test suite.", "",
          "| Tool | Observed version | Actual use/result |", "| --- | --- | --- |",
          "|oxlint / oxlint-tsgolint|1.88.0 /7.0.2004|Type-aware configured owned-code scope:980 files,1094 error diagnostics; imported/generated/audit paths excluded by configuration. Grouped CORE debt, not1094 vulnerabilities.|",
          "|cargo-mutants|27.1.0|Explicit Rust+1.99.0 read-only Codex32preview:12candidateedits,0compiled/applied. Clean/exclusive prerequisites absent.|",
          "|Node / pnpm / TypeScript / Vitest|26.10.0 /12.8.1 /7.0.2 /5.0.3|Inventory,real-module probes and selected regression checks; exact commands/log hashes below.|",
          "|Python standard library / SHA-256 / TypeScript AST|Python 3.14.4; TypeScript 7.0.2|Complete file/declaration catalogue, independent record validation and exact source/evidence binding.|",
          "|Prettier|3.9.9|Baseline formatcheck failed2files; source not formatted during audit.|",
          "|Rust / wasm-bindgen / Docker / clang|selected1.99.0 /0.2.129 /29.9.1 /21.1.8|Availability inspected. DefaultRust1.98.1 observed; no native/canonical rebuild or compiler timing proof.|",
          "|Playwright package|1.64.0|Installed package only; no browser launched, actual browser versions unknown.|",
          "|Semgrep,CodeQL,uv/uvx,Valgrind,cargo-fuzz,mewt/muton,fast-check|Absent|Associated execution not performed; remaining audit work continued.|", "",
          "Trail of Bits collection:`e1f86a390d4caf28bf1c377a7d86707b2898669c`;archiveSHA-256`61065c2d9f90b9dac67fb65765bc57670f51d91094e3b8d4f6ace24d91f64295`;imported2026-10-15T11:14:06Z,CC-BY-SA4.0. Exact33SKILL.mdhashes/paths are in JSON. Supporting Microsoft/Rust and JS adaptations preserve local CORE/RUST/error/secret policy; native upstream Workflow/Serena infrastructure is not claimed.", "",
          "| New skill | Disposition | Applied scope / execution limit |", "| --- | --- | --- |"]
for item in report["newSkills"]:
    lines.append(f"|`{item['name']}`|{item['status']}|{item['scope']} {item['execution']}|")
lines += ["", "### Coverage ledger", "", "The32CHECKrows below are bounded outcomes; no whole CHECK is called passed because a subset passed. Detailed per-domain methods, candidates, trace families and unresolved gaps remain in JSON.", "", "| Check ID | Guarantee | Outcome | Confirmed findings |", "| --- | --- | --- | --- |"]
for item in checks:
    lines.append(f"|{item['id']}|{item['title']}|{item['outcome']}|{', '.join(item['confirmedFindingIds']) or 'No confirmed defect in scoped review; remaining execution unassessed'}|")
lines += ["", "### Newly executed checks", "", "Each log SHA identifies raw local output. Exact argument arrays, UTCstart/end, exit/signal, recorder hash and execution-time harness hashes where captured are in JSON. Early pipe-based empty captures and the first invalid fixture remain retained and excluded from product failure counts. Later recorder versions use inherited file descriptors; earlier missing execution-time harness hashes were not fabricated.", "", "| Label / command | Exit | Recorded outcome | Raw log SHA-256 |", "| --- | --- | --- | --- |"]
for item in report["executionEvidence"]:
    lines.append(f"|`{item['label']}`: `{ ' '.join(item['command']) }`|{item['exitCode']}|{item['interpretation']}|`{item['logSha256']}`|")
lines += ["", "Minimal exact diagnostic headlines follow; owner home paths are redacted. Full raw output remains local with the log hashes above. Lint rule-group counts are also published in JSON; no absence of warnings is inferred."]
for item in report["minimalDiagnostics"]:
    lines += ["", f"**{item['command']}**", "", "```text", *item["headlines"], "```"]
lines += ["", "### Retained evidence, not a new execution", "",
          "Immediately before baseline freeze, both focused DeriverHTMLbuilds passed compilation/provenance checks. Build fingerprint`b0b87dbcc24afd519359caca1e1662a8efdfeb5c234b2ac37c2fa6850de42ea2`uses a different scope/algorithm from this audit fingerprint. Binding says no source change; the values must not be equated. Local pnpm177/Cargo445pins passed; GitHub0/10responses unavailable, an availability warning rather than upstream authentication. These are two focused builds, not eight-page/matrix/canonical/browser/release acceptance.", "", "| Retained artifact | Bytes | SHA-256 |", "| --- | --- | --- |"]
for item in report["retainedBuildEvidence"]["artifacts"]:
    lines.append(f"|`{item['path']}`|{item['bytes']}|`{item['sha256']}`|")
lines += ["", "### Findings", ""]
for item in report["findings"]:
    lines += [f"#### {item['id']} — {item['severity'].capitalize()} — {item['title']}", "",
              f"- **Category/status:**{item['category']};open. **Release blocking:**{str(item['releaseBlocking']).lower()}; {item['releaseBlockingReason']}",
              f"- **Affected files/builds:**{prose(item['locations'])};scope:{item['scopeOwner']}. Exact source fingerprint is the baseline above.",
              f"- **Reproduction:**{prose(item['reproduction'])}",
              f"- **Expected:**{prose(item['expected'])}",
              f"- **Observed:**{prose(item['observed'])}",
              f"- **Impact:**{prose(item['impact'])}",
              f"- **Evidence:**{prose(item['evidence'])}",
              f"- **Independent challenge:**{prose(item['independentChallenge'])}",
              f"- **Recommended fix:**{prose(item['recommendedFix'])}",
              f"- **Required verification:**{prose(item['requiredVerification'])}", ""]
lines += ["### Remediation and follow-up", "",
          "All findings remain open in this baseline;fix/verification commits are null. Implementation starts only after this report and uses the original ID for retained causes. No later source state is retroactively substituted for the reviewed bytes. The next phase begins with Deriver secret/readiness/lifetime findings, then Inspector/public/build/CORE debt, coordinating upstream API contracts without editing their repositories.", "",
          "AUD-033-ARC004 has an explicit current-source disposition:PasswordReview/RecoveryPassword return waiting values and MhfeTask handles them as outcomes. This is source-level evidence of a fix, not a newly executed verification of all callers. The other7AUD033roots remain in the register; completed earlier stream/admission/date-owner changes do not finish the broad CORE migration.", "",
          "### Informational observations, refuted candidates and unresolved questions", "",
          "The JSON retains per-domain observations/refutations/regression dispositions. Do not promote a keyword occurrence, mutation edit, unexecuted idea or peer candidate to a confirmed defect. Important boundaries:", "",
          "- Identity returned secret arrays are intentionally caller-owned; their post-return encoder finally already wipes them. Platform/Identity early acquisition paths are the accepted narrower defect.",
          "- Matcher old-worker finally suspicion lacks a normal separate-DOM-task reproduction; a contrived same-task Cancel/Start is not enough. MnemoCode host wrappers recheck cancellation and many input lifetimes correctly; peer direct-library outcomes do not automatically imply a host defect.",
          "- A failed MHFE component fullCheck already latches failure in that same imported class. The accepted blocking host issue is the unpropagated published-vector false verdict; current package vectors were not observed to fail.",
          "- QR disconnection/pagehide and the general sensitive renderer now revoke publication correctly. SeedQR/MHFE callers that omit readiness remain scoped variants under AUD-030-SEC001. Listener retention is source reachability, not a measured heap leak or successful extraction.",
          "- Identity transfer membership, finite-gap state propagation and staged-descriptor dual-input assumptions remain unresolved contracts. Provider/consensus/hardware behavior and dependency advisory state cannot be inferred from local fakes.",
          "- Historical release claims and optional artifact OpenPGP signing differ from current mandatory SSH-signedGitpolicy; no contradiction or malicious change is inferred solely from that wording. No evidence in this audit establishes deliberate file damage.", "",
          "- The draft phrase about expanding a canonical gate to five modules remains an observation, without a finding ID: historical AUD-013/014 evidence makes an intermediate five-module gate plausible. Current catalogue has four local modules plus separately vendored MHFE, and the draft also states four. No new canonical rebuild claim is accepted from historical wording.", "",
          "### Assessment and limitations", ""]
lines += [f"- {item}" for item in report["limitations"]]
if "separateCompletenessReview" in report:
    lines += ["", "The separate completeness reviewer identified 12 missing finding-to-CHECK links and three publication clarity points. Main repaired those metadata, published all per-file methods and minimal diagnostic headlines, and the reviewer independently confirmed all four repairs. The full assessment and closure are hash-bound in JSON/local `coverage-completeness.json`. Remaining binary, dependency, historical and execution limits remain explicit; no whole CHECK or release is promoted to passed."]
REPORT.with_suffix(".md").write_text(publication_text("\n".join(lines)) + "\n")
print(json.dumps({"findings": len(findings), "new": new, "retained": len(findings)-new, "severity": severity, "releaseBlocking": blocked, "skills": len(skills), "checks": len(checks), "commands": len(commands)}))
