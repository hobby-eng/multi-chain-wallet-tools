# Full audit execution guide

This guide defines a comprehensive first-party audit of this repository: source, dependency integration, build composition, standalone HTML, browser behavior, exports, documentation, and release evidence. It is a procedure, not a completed audit or a cryptographic certification. Writing or updating this guide does not establish that the checks below have been performed.

Use it together with [AUDIT_STANDARD.md](audits/AUDIT_STANDARD.md), [AUDIT_TEMPLATE.md](audits/AUDIT_TEMPLATE.md), [the JSON record schema](audits/audit-report.schema.json), [the security model](../SECURITY_AUDIT.md), [verification commands](VERIFICATION.md), [browser acceptance](BROWSER_ACCEPTANCE.md), [build modules](BUILD_MODULES.md), and [architecture](ARCHITECTURE.md). Actual source, manifests, lockfiles, and workflow definitions take precedence over stale documentation. Report a mismatch rather than silently assuming either side is correct.

## Contents

1. Review principles and boundaries
2. Audit identity and snapshot capture
3. Inventory and coverage planning
4. Execution sequence and command evidence
5. SEC — Security
6. FUN — Functional and protocol correctness
7. API — Contracts, integration, and exports
8. BLD — Builds, composition, reproducibility, and releases
9. UI — Browser behavior and presentation
10. ARC — Architecture and maintainability
11. DOC — Documentation, licensing, and provenance claims
12. Cross-cutting edge-case design
13. Official vectors and independent reference implementations
14. Logical grouping, finding names, and evidence
15. Remediation and repeat verification
16. Completion criteria and handoff

## 1. Review principles and boundaries

A full audit combines source reasoning, negative and boundary cases, independently expected results, real artifact execution, and process verification. A green test suite is evidence for its assertions, not a substitute for examining what it fails to cover.

- Begin from the actual implementation and supported contracts. Treat previous findings as a regression checklist, not as the complete list of possible defects.
- Keep baseline audit execution separate from remediation. For a review-only request, do not change production code, dependencies, fixtures, workflows, or committed generated files to make checks pass. Temporary harnesses and ignored build outputs must be identified and must not become accidental release inputs.
- Respect the requested scope and authorization. Do not publish releases, broadcast transactions, fund real wallets, send vulnerability reports, modify remote settings, or push changes merely because these actions appear in a checklist.
- Use public vectors, synthetic secrets, empty wallets, and isolated regtest nodes. Never use a user's active wallet material. Logs, request captures, screenshots, exports, and crash reports can retain test inputs.
- Keep CSP, sandboxing, origin isolation, and normal browser security enabled for acceptance. A diagnostic experiment with altered security settings must be separate and cannot count as a passing acceptance case.
- Inspect first-party code and its calls into dependencies. State explicitly whether upstream internals were also examined; pinning an open-source library is not an audit of its integration or every transitive dependency.
- Do not suppress a failure, lower a threshold, delete a vector, widen an allowlist, or reinterpret an exception just to obtain a green run. Investigate whether the defect is in production, the harness, the fixture, or the environment.
- Make no claims of exhaustive cryptographic proof, absence of all vulnerabilities, consensus validity, or independent specialist certification unless that work was actually performed and supported by evidence.

## 2. Audit identity and snapshot capture

Record these before running checks:

- Next available report number and `AUD-NNN` identifier, reserved without colliding with another reviewer.
- UTC start and completion timestamps; operator timezone separately if useful.
- Repository URL, branch, full HEAD, remote baseline if relevant, working-tree state, and any pre-existing changes or untracked implementation files.
- Source fingerprint and artifact SHA-256 hashes. A full HEAD does not identify a dirty working tree. Retain a safe diff/fingerprint or describe exactly which changes were included.
- Source/artifact relationship: freshly built from the reviewed snapshot, existing artifact from another commit, or unknown. Do not merge conclusions from different snapshots into one apparent result.
- Reviewer identity and tool/harness. For an AI review, record the exact model identifier and actual reasoning-effort setting, not a guessed marketing name or inferred setting.
- OS, architecture, Node, pnpm, TypeScript, Vitest, Docker, Rust, Cargo, wasm-bindgen, Playwright, and actual browser versions. Record overrides, environment variables affecting builds, and loaded binary paths where relevant.
- Pinned upstream revisions, fixture hashes, availability of independent reference implementations, and which live providers may be contacted.

Model and effort values must come from retained session/client metadata. If unavailable, use null in JSON and state unknown in Markdown. Distinguish a known model family from an unknown exact service snapshot. Do not claim `xhigh` merely because an audit was thorough.

If models or effort levels change during a review, record each phase and which findings/checks it covered. Do not label the entire audit with the strongest setting used for only one small phase. If other reviewers or agents were authorized and used, record their contributions and settings separately; their assertions require retained evidence and do not automatically constitute independent verification.

After an interruption or context loss, restore the snapshot and execution ledger first. Confirm what finished, what was running, and whether source/artifact hashes changed. Repeat incomplete or invalidated checks; do not erase previously recorded failures or count a pending run as passed.

## 3. Inventory and coverage planning

### Supported surface

Inventory all applications and shared packages, not just the last edited file:

| Application                 | Mandatory audit areas                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key Derivation Tool         | Source input, adapters, receive/change branches, generation, BIP85, optional signing/BIP38/Silent Payments, Wallet Matcher, every backup format, workers, secret visibility, and exports.                   |
| Activity Viewer             | Public-input screening, single/batch modes, adapter dispatch, balances/activity, provider validation, cancellation, totals, and CSV/JSON/XLSX.                                                              |
| Discovery Scanner           | Seed/public modes, batch line pairing, scope and estimates, all supported profiles, iframe boundary, network worker, progress, proofs/history, result navigation, and public reports.                       |
| PSBT & Multisig Inspector   | Transactions, PSBT schemas and relationships, scripts, descriptors, policies, cosigner material, import commands, signed-message verification, and BIP38 decryption.                                        |
| Shared packages and tooling | Crypto wrappers, protocol registries, recovery codecs, network/secret boundaries, exports, UI helpers, generated WASM, composition, build gates, metadata, documentation synchronization, CI, and releases. |

Obtain current coins, features, profiles, and dependency names from the manifests and composition code. Do not copy a historical matrix and assume it covers new modules. Current tool vocabulary is maintained in `tooling/tool-manifests.mjs`; edition defaults are supplied by the build profiles.

### Coverage ledger

For each applicable check, record `checkId`, category, logical group, affected tool/coin/feature/build, method, outcome, snapshot, and evidence. Outcomes are `passed`, `failed`, `blocked`, `skipped`, `not-run`, or `not-applicable`. A blocked test is neither an application pass nor necessarily an application defect.

Use the stable procedure IDs below, such as `CHECK-SEC-001`. These identify audit tasks, not findings. A reproduced defect receives its separate `AUD-NNN-SEC001` finding ID. One task can expose multiple defects, and one defect can be supported by several tasks.

Describe why a case is not applicable. For example, Ethereum has no Bitcoin-style change branch, an offline tool has no public-provider contract, and the Inspector has no transaction-signing coordinator. A missing advertised capability is a finding; an intentionally unsupported feature is not automatically a defect.

## 4. Execution sequence and command evidence

### Recommended sequence

1. Capture identity and snapshot; inventory the supported surface and create the coverage ledger.
2. Read the security/composition boundaries and trace source-to-dependency-to-result paths before assuming tests exercise them.
3. Run metadata, type, format, and baseline source checks. Record failures even if unrelated to the area under review.
4. Run targeted official-vector, negative, edge, and differential probes. Use actual production entry points and serialization paths.
5. Execute canonical Docker verification, including a fresh uncached build when claiming reproducibility. Inspect committed WASM comparisons and release bundle verification.
6. Execute matrix compilation and representative runtime coverage; enlarge the sample around conditional imports and optional functions.
7. Run all three browser suites against final, hash-recorded files in the pinned engines. Inspect screenshots, request captures, errors, and exports manually where appropriate.
8. Run optional live-provider and real Core regtest comparisons separately. Report provider/environment failures independently from deterministic results.
9. Inspect documentation, licensing, provenance, and release synchronization against the same source.
10. Reconcile every category, finding, previous finding disposition, skipped case, and remaining risk before writing conclusions.

### Current commands

Verify the scripts still exist in package.json before execution. The following are commands, not promised results:

```sh
pnpm metadata:check
pnpm check
pnpm format:check
pnpm test
pnpm audit --audit-level high
pnpm verify
./tooling/build-reproducible.sh
pnpm build:matrix:plan
pnpm build:matrix:smoke:plan
pnpm build:matrix:smoke
pnpm build:html
pnpm test:browser:files
pnpm test:browser:regressions
pnpm test:browser:selective
```

`pnpm verify` already invokes substantial source, Rust, vector, build, and artifact checks; inspect its current expansion and do not count repeated invocations as additional independent evidence. The canonical Docker build also invokes verification and matrix smoke. Reuse its logs for covered checks rather than rerunning expensive suites without a reason.

`pnpm build:html` uses committed generated WASM; it does not establish a fresh canonical WASM build. `./tooling/build-reproducible.sh --wasm` replaces committed generated inputs and is a remediation/development action, not a review-only baseline check. The full wrapper replaces ignored dist outputs; record artifact hashes before and after if existing artifacts are also being reviewed.

For an uncached canonical check, inspect Dockerfile.reproducible and the wrapper's current build arguments, then run the corresponding Docker build with `--no-cache`, `--platform linux/amd64`, the recorded `SOURCE_COMMIT`/`SOURCE_DIRTY`, and the correct target. Record the exact command and retain the resulting comparison evidence. A cached successful layer cannot prove that current source reproduces the committed files.

The routine format script currently targets source formats; explicitly check Markdown/JSON documentation with Prettier as well. A browser subset filtered with `BROWSER_CASES`, `BROWSER_ENGINES`, or `BROWSER_PROFILE` is diagnostic evidence, not the full matrix.

Optional live commands include the Activity Viewer Core/Platform mainnet/testnet scripts and Discovery mainnet/testnet/batch scripts listed in package.json. They use mutable remote data and are outside deterministic CI. Choose public fixtures and record provider/network/time; never substitute real secrets.

For each command retain its exact text, environment, start/end, exit code, summary, failure location, and evidence path/hash. Record timeouts, process crashes, incomplete logs, network warnings, stale caches, and toolchain overrides. Do not add overlapping suite totals together. Report original failures and scoped reruns separately.

## 5. SEC — Security

### CHECK-SEC-001 — Threat model and secret ownership

Trace mnemonic, BIP39 passphrase, seed bytes, WIF/xprv, private/spending keys, viewing keys, KDF passwords, decrypted records, and backup shares from input through every consumer. Identify the owning document/worker/module, copies, lifetime, reveal/copy/export paths, and cleanup.

Distinguish spending authority from privacy-sensitive viewing material and ordinary public metadata. Verify that no UI label promises a separate vault where the tool actually uses an offline document plus worker. Record the limits of clipboard control, host/browser compromise, immutable strings, WASM panic handling, and intentional user exports.

### CHECK-SEC-002 — Secret Vault, CSP, sandbox, and transport

For seed-capable Discovery builds, check the actual iframe `sandbox="allow-scripts"` without `allow-same-origin`, opaque origin, parent-DOM denial, vault CSP `default-src 'none'` and `connect-src 'none'`, and denial of images, nested frames, workers, and form submissions. Inspect effective policy in final HTML and runtime, not only a template string.

For offline Deriver/Inspector, verify whole-document network denial and absence of network APIs, remote imports, telemetry, CDN/update paths, or unexpected resources. For watch-only Discovery, verify the public-input boundary and physical exclusion of secret derivation/vault modules. Do not impose a Scanner iframe requirement on an offline tool that does not use that architecture.

Probe message-port ownership, handshake readiness, operation allowlists, source/connection attribution, malformed/unknown messages, unexpected properties, reply correlation, duplicate/stale replies, transferred-buffer ownership, channel disposal, and startup failure. Reject arbitrary URL/method/filename/MIME fields where the contract deliberately uses fixed operations. Understand any srcdoc inherited CSP, shell HTTPS permissions, meta-CSP limitations, and hosting requirements separately.

### CHECK-SEC-003 — Network egress and secret guards

Inspect every active HTTP/SDK path and its actual arguments. Verify addresses, hashes, pool positions, and approved public identifiers are the only request inputs required by the operation. Private/spending/viewing keys stay local where promised; querying a public provider still reveals identifiers, timing, and IP information.

Exercise mnemonic/passphrase/seed/key rejection at public-input and export boundaries with synthetic values, including raw, hex, Base64, percent-encoded, case/separator variants, and nested values handled by the guard. Inspect what the guard cannot detect, such as split-field encodings and valid-looking opaque hashes. Do not present a pattern tripwire as proof against arbitrary malicious code inside the secret realm.

Verify the network graph cannot import secret derivation and the vault graph cannot import network services. Check actual build graphs, including selected/virtual modules, not just relative imports in source.

### CHECK-SEC-004 — Randomness, encryption, and authentication

Trace every production random source to the intended cryptographically secure provider. Check unavailable RNG failure, injected callback type/length, repeated/short/oversized responses, identifier/salt/nonce/key generation, and cleanup when generation fails. A deterministic test source must not reach production accidentally.

For encryption inspect algorithm/version, KDF parameters and salt persistence, nonce uniqueness, authentication, key length, password encoding/normalization, error behavior, and permit semantics. Probe wrong password, wrong recipient, corrupted/truncated ciphertext, changed authenticated metadata, mixed permits, and missing permit material. Confirm decryption errors do not expose partial plaintext or silently return another supported format.

For Gordian Envelope, distinguish content encryption from permit wrapping; any valid configured permit unlocks the content. A recipient key derived from the protected mnemonic is circular access control, not independent recovery. Including a BIP39 passphrase in the container means a valid permit reveals both factors. Document actual library defaults, not assumptions based on a standards name.

### CHECK-SEC-005 — Secret lifecycle and exceptional paths

Force failures after each allocation/derivation/decoding step using bounded synthetic stubs. Check early cleanup scopes, partially decoded shares, temporary password/key buffers, returned versus caller-owned buffers, clipboard fallback fields, and disposed workers/ports.

Test Clear, Cancel, edits, tab switching, blur, hidden document, reload, late completion, and restarting. Confirm late work cannot restore a cleared secret, enable copy/export, or replace a current result. Check practical zeroization and reference release without claiming guaranteed browser/OS erasure. Inspect Rust panic/abort and WASM linear-memory residuals explicitly.

### CHECK-SEC-006 — Browser injection, persistence, and sensitive APIs

Review DOM sinks, dynamic code, user-controlled HTML/URLs, storage APIs, console/log/error text, filenames, CSV formula injection, and external-link behavior. Inspect textContent/DOM construction and any deliberate serialization escapes. Search generated bundles as well as first-party source.

Classify reviewed Node-only or unreachable generated glue separately from active browser execution. Verify CSP still forbids unsafe eval where promised and gates detect unexpected changes to reviewed dynamic-code counts. Do not remove justified glue or introduce unsafe exceptions solely because a lexical search reports a match.

### CHECK-SEC-007 — Read-only guarantees and availability bounds

Verify connected graphs do not acquire transaction broadcast, transfer, withdrawal, identity mutation, wallet/seed, or spending methods through aliases, computed properties, optional chains, wrappers, or future SDK surfaces. AST gates over known APIs are defense in depth, not proof about every future dependency method.

Probe parser/input/payload limits, recursive depth, huge counts, unbounded allocations, decompression/image limits, concurrency, retry storms, event-handler reentrancy, and cancellation. Confirm a failure cannot become an authoritative zero balance or a successful export. Use bounded workloads; an audit should not intentionally exhaust the host without a controlled diagnostic plan.

## 6. FUN — Functional and protocol correctness

### CHECK-FUN-001 — BIP39, entropy, and seed interpretation

Cover 12/15/18/21/24-word English phrases, entropy widths 128/160/192/224/256 bits, checksum validation/recalculation, leading zeros, all-zero/all-high bytes, invalid words/counts/checksums, whitespace rules, and Unicode NFKD where required. Check exact byte order and index origin.

Distinguish mnemonic entropy, entropy-plus-checksum, BIP39-derived 64-byte seed, BIP32 master key, and BIP39 passphrase. Verify that an entropy backup cannot claim to contain the separate passphrase, and master-seed restoration cannot claim to reconstruct original words. Use literal expected values, not another call to the same conversion as the only oracle.

### CHECK-FUN-002 — HD derivation and every coin/profile

Check hardened/non-hardened interpretation, limits at 0 and 2^31−1, maximum account/branch/index, invalid negative/fractional/overflow values, path parsing, public-only restrictions, origins, fingerprint/depth/version/network, and leading-zero BIP32 cases. Verify seed input is not mutated.

For each adapter trace selected network/account/profile into actual library calls and compare addresses, public/private keys, WIF, extended keys, paths, and field roles. Cover Bitcoin BIP44/49/84/86 receive/change; Ethereum's supported layouts/checksum rules; Dash Core, legacy mobile, DIP9, Platform hardened payment classes, Identity roles/HASH160, Purpose48 and Core-pkh cosigner variants, and Orchard ZIP32/capabilities. Use actual manifests to add future coins and profiles.

Test same numeric index on different branches, accounts, sources, profiles, and networks without overwrites. Do not assume a wallet-specific convention is standardized or that a public class xpub can cross a hardened sibling class. Verify exported multisig cosigner keys versus payment addresses have the promised meaning.

### CHECK-FUN-003 — BIP85, BIP38, messages, and Silent Payments

For BIP85 cover each supported application/output length, index bounds, parent mnemonic/passphrase changes, deterministic outputs, child passphrase independence, revealed/hidden state, and stale queued derivation. Non-mnemonic outputs must not be handed to mnemonic-only backup workflows.

For BIP38 cover official compressed/uncompressed examples, UTF-8/normalization rules, wrong password, corrupted payload/checksum, network prefixes, key/address consistency, and supported EC/non-EC modes. Unsupported variants must be explicit rather than accidentally treated as another mode.

For message signing/verification inspect exact message bytes, chain/network, encoding, protocol, public key/address binding, canonical signature formats, wrong message/key/address, malformed lengths/scalars, empty message, and stale verification results. Distinguish message signing from transaction signing.

For Silent Payments test supported address/key/label derivation and literal vectors, key/context and network bounds. Do not claim sender/receiver transaction scanning or spending flows if only address/key derivation exists.

### CHECK-FUN-004 — Scripts, descriptors, Miniscript, and multisig

Validate arity, delimiters, nested binary Taproot trees, grammar, checksum over exact accepted text, permitted whitespace, threshold syntax, numeric coercion, key lengths/curve points, compressed/uncompressed/x-only context, origin/suffix/multipath/wildcard restrictions, and selected network.

Cover ordinary pkh/wpkh/sh/wsh/tr, recognized-only forms, multi/sortedmulti and multi_a/sortedmulti_a, nested MuSig expressions, aggregate versus participant suffixes, mixed origins, and concrete versus ranged export. Respect wrapper-specific limits: bare policy, P2SH's 520-byte redeem script and practical 15-compressed-key multisig limit, P2WSH's 20-key CHECKMULTISIG limit, Tapscript-specific limits, and numeric encodings beyond OP_16.

Inspect compiled script bytes, ASM, hashes, key ordering, Taproot internal-key parity/tweak/control blocks, leaf hashes/tree structure, network address, sanity/satisfaction claims, and imported descriptor compatibility. Repeated keys, unsafe policies, or a recognized script must not be described as safe/portable merely because compilation returns bytes.

For policy presets check each supported wrapper and branch, timelock units and boundaries, hashlock preimage commitments, omitted keys, duplicate keys, decaying/expanding/staged policies, and ranged xpub preservation. Independently compare address/script results and wallet import behavior.

### CHECK-FUN-005 — Transactions, PSBT version context, and commitments

Exercise Bitcoin and Dash transaction rules separately: signed/unsigned version representation, witness flags, no/superfluous witness, txid versus wtxid, Dash transaction type and special payload, CompactSize canonicality, truncation/trailing bytes, locktime, sequence, scripts, exact amounts, unsigned/vsize/weight interpretation, and large transactions without spread-argument overflows.

For PSBT test global/input/output maps, unique full keys, framing, mandatory fields, type-specific key/value widths, v0/v2 compatibility, global xpub/origins, proprietary identifier/subtype envelopes, and valid unknown fields preserved byte-for-byte. Interpret a key using chain and PSBT version; an unknown v0 field must not be forced into a v2 schema.

Check non-witness UTXO txid/outpoint binding, witness/non-witness conflicts, missing amounts, valid atomic ranges, supplied totals/fee limitations, redeem/witness script commitments, preimage widths/hashes, Taproot derivations/leaves/control blocks, signature encodings and supported participant relationships, final scripts, and explicit unverified relationships. Parsing a signature is not verifying it.

For signing explanations cover ALL/NONE/SINGLE with and without ANYONECANPAY across Legacy/BIP143/BIP341, multiple inputs/outputs, and SINGLE without a matching output. Legacy's constant-ONE case, SegWit v0, and Taproot must not be conflated. Determine protocol from verified spending context, not optional contradictory metadata.

For v2 test height-only, time-only, both alternatives, transaction-wide compatible/incompatible combinations, maxima, fallback locktime, modifiable bits, and sequence interactions. Match display to the effective calculated locktime. Pin reference versions: a Core release that rejects v2 cannot serve as a live v2 oracle.

### CHECK-FUN-006 — Recovery and backup formats

For every format test create/restore using each supported secret width, smallest/largest valid settings, official/reference fixtures, corruption, truncation, incompatible records, and actual UI input/output handoff.

| Format                | Required cases                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SeedQR                | Four-digit word indices including leading zeros; binary Compact payload byte preservation; all accepted BIP39 lengths; out-of-range indices, wrong lengths/checksum, local image decode; distinguish tool extensions from external SeedSigner compatibility.                                                                                                                                                       |
| SLIP-39               | Current/legacy formats, threshold/count limits, group/member semantics, passphrase rules, random callback exact lengths, duplicates, incompatible identifiers, malformed/checksum-repaired shares, fewer than quorum, and original BIP39 entropy versus native SLIP-39 wallet interpretation.                                                                                                                      |
| CKD Shamir            | Raw/Words representation discriminants, versioned envelope lengths and metadata, Base64URL/word mapping, old-version readability, secret digest/set consistency, mixed sets, duplicates, altered shares with repaired checksums, and no claims of interoperability with other Shamir formats.                                                                                                                      |
| SSKR                  | Group threshold versus within-group threshold, heterogeneous groups, every distinct valid quorum in small deterministic fixtures and justified representative quorums for larger configurations, one incomplete group, mixing groups without meeting local thresholds, duplicate/mixed identifiers, standard tagged CBOR, Compact UR/full Bytewords, legacy transport compatibility, and official encoded strings. |
| Codex32               | Identifier alphabet/length, HRP, threshold/index rules, unsplit versus shares, checksum/error handling, duplicates/mixed IDs, original entropy versus BIP32 seed interpretation, supported sizes and official recovery vectors.                                                                                                                                                                                    |
| Gordian Seed Envelope | Typed entropy, optional encrypted passphrase assertion, password and X25519 permits, SSKR-permit quorums, multiple independent unlock routes, wrong unlock material, malformed types, ciphertext integrity, selected/manual recipient derivation, and circular-backup warnings.                                                                                                                                    |

A wrong password may remain undetectable in a non-authenticated/custom transformation that maps to valid entropy; the UI must not invent authentication. Threshold sharing is not encryption, QR is transport, and a checksum is not protection against intentional alteration. Proposed decoy/coordinate/palette/pipeline features are outside implemented coverage unless the audited snapshot actually contains them.

### CHECK-FUN-007 — Discovery, providers, proofs, and accounting

Cover seed/public modes, single/batch, selected coin versus all coins, receive/change and supported hardened classes, custom paths, bounded account/index ranges, sparse high indices, gap state per branch, deduplication across profiles, and empty/error/partial/complete sections. Public-only inputs cannot silently obtain hardened/private capabilities.

Validate Core/explorer responses against requested resource/network, synchronization/tip, exact amounts, row identities, stable offsets/counts, pending versus confirmed records, overlap, duplicate hashes, changed totals, premature short pages, and provider disagreement. Ethereum RPC IDs, deployment recipients, block-height attribution, fees, and failed transactions require explicit treatment.

For Platform validate proof-backed address/Identity balances and auxiliary history separately; bind metadata to resource/network and reconcile balance where required. Identity role paths and funding enrichment must not imply discovery of every orphan asset lock/top-up/contact path.

For Orchard test External/Internal scopes, incoming/full/outgoing capabilities, ciphertext recovery, key-component vectors, nullifiers/spends, note replacement, proof-height monotonicity on empty/partial/final pages, aligned cursors, repeated-empty termination, page ceilings, one-pass bounded-memory streams, cancellation, and traps. IVK/OVK alone cannot establish an authoritative spendable balance. Distinguish observed incomplete values from complete balances and pool positions from timestamps/transaction counts.

Check totals across duplicate resources, mixed coins/assets, credits/duffs, token supply/decimals, spent/outgoing/zero-balance rows, and incomplete/error status. Do not count the same L1 address twice or convert token supply into DASH credits. Missing/unverified values must not become numeric zero.

## 7. API — Contracts, integration, and exports

### CHECK-API-001 — Actual dependency call contracts

Trace UI → validated options → registry/composition → adapter/library → normalized result → presentation/export. For each boundary check required/optional fields, units, network/path, variant discriminants, encodings, ownership, and error types. Verify the real production path, not a test-only installer or dead helper.

Call public APIs with runtime values outside TypeScript's static types: undefined/null, wrong enum, missing callback, wrong typed array, extra fields, wrong result shape, primitive type coercion, and unsupported format. Reject rather than guessing another valid mode. Check lazy WASM initialization, concurrent first calls, initialization failure, retries, and omitted feature bindings.

### CHECK-API-002 — Async state, cancellation, and revisions

Test response/error order permutations; slow older request after a newer one; edits/Clear/Cancel before readiness and during awaits; source/profile/network changes mid-operation; repeated start; active/inactive tab changes; and one batch candidate failing while others proceed.

Bind results, progress, verification, permits, exports, and buttons to the correct revision/source. Check promises are awaited or deliberately owned, abort signals reach all relevant calls including response-body parsing, retries remain bounded, and disposed operations cannot mutate current UI. Test production stream/controller seams, not independent mocks with equivalent-looking behavior.

### CHECK-API-003 — Public export schema and monetary fidelity

Inspect actual downloaded CSV, parsed JSON, and generated XLSX XML, not only an intermediate object. Cover single/batch, every coin/subtype, empty/partial/error/complete results, future synthetic adapter/asset, and all export scopes. A new coin must not require a hidden Dash-only formatting branch.

Check column order/names, rectangular CSV, quoting/newlines/Unicode, warning versus metadata positions, formula injection, true atomic integers, decimals, units, null/zero distinction, amounts beyond Number's safe integer range, token fields, dates/precision, and consistency between formats. Private exports must place individual key forms in their declared columns without embedding labels into raw values.

Confirm selection and paging do not export the wrong branch/source; all/current/selected labels match their content. Public reports must exclude all registered secrets and private/viewing material where promised. XLSX receives only the approved public projection where required. Verify filenames/MIME/download brokers use the intended fixed rules and Blob URLs are released.

### CHECK-API-004 — Encoding and import/export interoperability

Check hex casing/width, leading zero bytes, Base58Check, Base64/Base64URL padding, Bech32/Bech32m case/checksum/network, CompactSize, CBOR tags and type, Bytewords variants, UR payload, binary QR byte modes, Unicode text, and text-versus-byte conversions.

Round trips must preserve byte content and semantic type. Pair them with literal expected fixtures or external decode so producer and consumer cannot hide the same bug. Test old records, unknown optional fields, and exact supported extensions; malformed input must not be silently normalized into a different object unless the documented contract permits it.

## 8. BLD — Builds, composition, reproducibility, and releases

### CHECK-BLD-001 — Manifest, flags, and feature composition

Compare tool manifests, profile defaults, option parsing, installers/virtual modules, runtime assertions, artifact verifiers, and documented feature tables. Check actual `--features`, `--exclude`, `--coins`, `--exclude-coins`, profile/tool/output flags, aliases, inclusion/exclusion precedence, duplicate/unknown options, empty selections, and unsupported coin/feature combinations.

Build defaults in both editions, each supported coin alone, required combinations, minimal workflows, feature-only/excluded-feature variants, seed without custom paths, watch-only without seed, recovery-only Deriver combinations, and Inspector workflow-only compositions. Verify legal combinations start; rejected combinations fail clearly before partial output.

Inspect physical graph exclusion, WASM/wordlist counts, SDK presence, forbidden coin registrations/copy, navigation/menu consistency, missing optional function guards, and startup self-test applicability. Hidden controls do not prove an excluded module was removed. Internal refactoring files are not automatically user-selectable features.

### CHECK-BLD-002 — Matrix depth and runtime sampling

Run the current matrix planner and smoke set, record cardinality, and identify uncovered conditional branches. Do not hardcode a historical 66/12,116 count as current. State whether the exhaustive matrix compiled, the smoke matrix compiled, or only representative variants ran.

Runtime-test representative combinations in both engines, especially newly conditional imports, absence of a default coin, no Dash/no Bitcoin, no recovery formats, independent backup modules, and no custom-path helper. Add targeted probes around any failure. Compiler success is insufficient for dynamic installer/function requirements and template pruning.

### CHECK-BLD-003 — Lockfiles, source provenance, and licenses

Check exact dependency pins, pnpm archive integrity, crates.io checksums, full Cargo git commits, installed versions, provenance source hashes, and updater/checker coverage for every current codec/QR/WASM/toolchain source. Distinguish inaccessible upstream availability checks from mismatched commits and mandatory local integrity failures.

Inspect hash-checked full upstream inputs versus selected/integrated code; do not claim the complete repository hash matches a modified subset. Review dependency licensing, generated/glue licenses, bundled transitive notices, and source distributions. A vulnerability-advisory scan does not evaluate first-party integration correctness.

### CHECK-BLD-004 — Canonical WASM and Docker bytes

Check all five current integrations: Orchard, CKD Shamir, Codex32, SSKR, and Envelope. Inspect crate inputs/lockfiles/features, Rust/wasm-bindgen/toolchain pins, build flags/cfg/backend, path remapping, glue, wasm producers, canonical hash manifest, and source freshness gate.

A matching producer string, file size, Cargo.lock, or rustc commit is not a byte-for-byte comparison. Rebuild inside the canonical environment and compare every committed generated file and manifest. Inspect differences before attributing them to harmless metadata. Verify missing/stale/tampered manifests and altered source/output fail the local gate.

Inspect Docker dependency-fetch stages versus network-disabled verification/build stages, target names, expected paths, platform, copy-out manifests, source commit/dirty propagation, and cleanup on build/create/copy/validation failure. Use fake-Docker tests for controlled failures; they supplement rather than replace real canonical builds.

### CHECK-BLD-005 — Artifacts, CI, and release workflows

Validate final HTML fingerprints, CSP hashes, duplicate IDs, unresolved placeholders, expected module counts, sidecars, release passports, file allowlists, SHA256SUMS, verification record, legal notices, attestations, and any optional detached signature. Distinguish transfer checksums, build provenance, and publisher approval.

Read current CI/release job dependencies, action pins, permissions, token scopes, caching, browser installation/revisions, failure artifact retention, and shell interpolation. Ensure mandatory verify/browser jobs cannot be bypassed by the normal release path. Reproduce on the intended runner/platform or state where only static workflow review was done.

For Dash distribution inspect canonical-source documentation rendering, exact source SHA/hashes, version-versus-published-release wording, idempotent sync, repository-local write credentials, publication queue, stable/prerelease/draft handling, duplicate tags, pending releases in order, original supported version floor, source/tag/version consistency, and asset verification delegated to current canonical code. Test resolution logic with fixtures; do not create a real release as an audit probe.

Check safe custom output paths and preservation of previous canonical artifacts on failure. A tagged release must use the intended source, not a documentation-only distribution commit presented as the implementation commit. Future additions must update manifests, gates, legal materials, and both editions without requiring a second manual asset list.

## 9. UI — Browser behavior and presentation

### CHECK-UI-001 — Real files and representative viewports

Open the final files directly over file:// in the pinned Chromium and Firefox revisions without weakening security. Record actual versions; browser overrides or unsupported old versions cannot stand in for the accepted baseline.

Inspect desktop, intermediate/narrow widths, and mobile portrait/landscape. Use representative widths around 1280, 1024, 800, 640, and 390 pixels, with short viewport heights as well as normal heights. Check horizontal scrolling, sticky/header behavior, footer reachability, expanding path/index columns, long labels, large indices, and controls adjacent to panel boundaries.

### CHECK-UI-002 — Navigation, inputs, and state preservation

Exercise every main/subtab and a return path through Recovery formats back to generation. Check there is always a visible valid panel and one active selection. Coin defaults, profile switches, auto-generation, input account/index/count persistence, branch paging, and source reference expiry must follow the intended behavior.

For numbered batch inputs test empty lines, wrapped long phrases, multiline passphrases where supported, trailing newline, internal scroll, line-height alignment, pairing errors, and resizing. One visual line number must represent the actual input record according to the documented parser, not an accidental display wrap.

Keep scan controls such as history/zero-balance options available after results and before another scan. Test mixed-coin result tabs with one, several, and synthetic many coins; labels/tickers remain visible and wrap to further rows when needed. Check Dash subtype navigation and export alignment in both source modes.

### CHECK-UI-003 — Secret visibility, help, QR, and accessibility

Test hidden/revealed/auto-concealed states; exact Reveal/Hide scope for grouped inputs; disabled secret copy/export before reveal; original/child recovery-source menus, ordering, excluded modules, linked versus manual source, help on hover/click, and touch/keyboard alternatives.

For QR/help popovers cover hover-only and pinned click modes, leaving the trigger, repeat clicks, Close, outside click, Escape if promised, scrolling/resizing, focus restoration, and switching tabs. Confirm previews do not intercept their trigger, Close is inside the viewport and functional, and top-layer positioning works with filtered/overflowing ancestors. Test PNG download and offline image import with sensitive synthetic payloads.

Check equal button heights, target size, spacing, clipped/overlapping labels, focus indication, accessible names, disabled states, informative validation, and readable help. Do not require hover as the only way to access essential information on mobile. Visual correctness needs screenshots/manual inspection as well as locator success.

## 10. ARC — Architecture and maintainability

### CHECK-ARC-001 — Ownership, imports, and composition seams

Trace packages/app boundaries and tsconfig aliases, re-exports, generated imports, virtual composition, browser/worker environments, and runtime initialization. Check cycles using resolved imports rather than grep alone. Review app-to-app and package-to-app restrictions and edition allowlists.

Verify capability installers and optional APIs are coherent; no mandatory call targets an absent feature. Separate protocol settings, state, async operation ownership, rendering, and serialization where distinct responsibilities justify it. Preserve meaningful facades; imports through a facade do not themselves make internal modules dead.

### CHECK-ARC-002 — Dead code, duplication, and false positives

Review unused exports/types/functions, orphan entry points, test-only production paths, allowlist-only references, obsolete workers, empty packages/tests, duplicate parsers/registries/checksum/amount logic, and inconsistent helper implementations.

Confirm consumers in generated source, dynamic composition, templates, public type contracts, CLIs, reference validators, and tests before calling code unused. Distinguish unused API surface from unreachable code. A helper formerly needed must either participate in the active path or be removed if its behavior is now owned elsewhere.

Do not split code merely by line count, merge security realms to reduce file count, rewrite generated glue/wordlists, or invent generic abstractions that erase hardened/context distinctions. Record concrete duplicated behavior and divergence risk with evidence.

### CHECK-ARC-003 — Comments, tests, and production-path fidelity

Review stale comments, impossible states, casts/non-null assertions, suppressions, swallowed errors, ambiguous booleans, inconsistent exports, and placeholder TODO/HACK markers. Distinguish justified design constraints from an actual fault.

Trace tests to active installers, controllers, stream loops, adapters, exports, and QR matrices. Test-only seams must not give a false impression that production dispatch was exercised. Coverage configuration and percentages must name the actual included files; skipped valid vectors and broad “any error” assertions require explicit scrutiny.

## 11. DOC — Documentation, licensing, and provenance claims

### CHECK-DOC-001 — User-facing capability and safety descriptions

Compare root/application README, SECURITY, security audit/model, draft release notes, tool help, build passport, and distribution templates to actual behavior. Verify what each utility is for, accepted input, output, create/restore meanings, supported coins/modes, and independent-wallet recovery guidance.

Check encryption versus encoding/sharing, phrase versus entropy/master seed, passphrase inclusion, permit access, grouped thresholds, custom/interoperable formats, native wallet compatibility, source handoff, offline/connected boundaries, and privacy limitations. Avoid promising future/prototype features or an audit certification the project does not have.

Release notes separate user additions after the previous version from developer/refactoring/fix changes, with logically distinct changes on separate lines. A source version/date is not proof that a release has already been published. Historical upstream/audit/tool versions must not be rewritten to the current application version.

### CHECK-DOC-002 — Commands, metadata, links, and legal materials

Verify examples against real flags, script names, output paths, module prerequisites, supported networks, installation/toolchain selection, browser revisions, canonical WASM workflow, and CI/release prerequisites. Check relative links, retained evidence links, anchors, and source hashes; external reachability alone does not establish semantic correctness.

Inspect LICENSE, ATTRIBUTION, THIRD_PARTY_NOTICES, dependency license conditions, redistribution notices, source/binary release inclusion, and canonical-to-Dash generation. Explicitly name open-source modules and source URLs where the UI/docs claim them; describe exactly what integrity verification checks and when unreachable upstream checks only warn.

Check private vulnerability-reporting instructions against the repository's actual enabled channel using read-only settings inspection. Report a mismatch; do not send a test vulnerability or change remote settings without authorization.

### CHECK-DOC-003 — Audit records and evidence consistency

Follow the global sequence, category IDs, English text, model/effort disclosure, statuses, snapshot attribution, Markdown/JSON schema, legacy aliases, and index. Check cross-report original IDs, duplicate/related references, old heading aliases, and distinction between defects, observations, and remediation.

Verify counts and outcomes against logs, not previous summaries. Null means unrecorded, not accepted or verified. Temporary probes must not be committed accidentally; required regressions/reference fixtures must be retained deliberately with provenance. Machine-local evidence paths must be labelled as such, not represented as public downloadable assets.

## 12. Cross-cutting edge-case design

For every parser, adapter, codec, network operation, controller, and exporter, choose applicable cases from this matrix. The absence of applicability must be explained rather than silently omitting a row.

| Dimension          | Cases to consider                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presence/type      | Missing, undefined, null, empty, wrong primitive/object/typed-array type, unknown discriminant, unexpected extra field.                                                           |
| Numeric boundaries | −1, 0, 1, minimum−1/minimum/minimum+1, maximum−1/maximum/maximum+1, fractional, NaN/Infinity, numeric string, overflow, safe-integer edge, protocol integer/amount limits.        |
| Length/depth       | Empty, one element, exact valid length, short/long, maximum payload, maximum+1, nested recursion/tree/path limits, valid large input below size ceiling.                          |
| Encoding           | Leading zeros, case changes, whitespace/separators, Unicode normalization, embedded newline/NUL, invalid digit/alphabet/padding, noncanonical length, wrong checksum/tag/network. |
| Combinations       | Contradictory metadata, mixed versions/networks/sets/assets, duplicates, reordered members, independent origins, overlap across profiles, valid unknown extensions.               |
| Timing             | Before ready, during await/body parse/retry, after cancel/dispose/Clear/edit, concurrent first initialization, out-of-order reply, repeated action, hidden page, reload.          |
| Failure location   | Before allocation, after partial allocation, halfway through batch/share generation, provider parse/proof failure, WASM trap, export creation, download, worker/channel startup.  |
| Persistence/state  | No cross-run stale cache, correct per-source/account/branch state, source-link expiry, repeated scan with changed options, previous output preserved on build failure.            |
| Completeness       | Empty complete, empty partial, partial with observations, one failed section, incomplete quorum, provider timeout, unavailable values versus true zero.                           |
| Composition        | Feature/coin absent, no default adapter, minimum legal combination, excluded helper, selected runtime/markup mismatch, new synthetic adapter.                                     |

Use bounded property-based/metamorphic probes where useful: seed input remains unchanged; branch/index change affects only the intended result; adding an unknown field preserves known semantics; deduplication does not change a total; encoding/decoding preserves bytes; monotonic proof heights remain valid. Metamorphic and round-trip checks complement literal/independent oracles and do not replace them.

## 13. Official vectors and independent reference implementations

For each fixture retain upstream repository, path, complete revision, license where redistribution needs it, raw-source hash, extraction method, suite counts, and expected validity/output. Keep positive, negative, and error-message-specific groups distinct. Validate extraction counts before replacing fixtures; an updater must not silently shrink coverage.

Review official Bitcoin Core/BIP and Dash Core/DIP code and tests relevant to the current snapshot, including PSBT, descriptor, BIP67, multisig import/sign workflows, special transactions, and unknown-key passthrough. Consult SLIP-39, SeedSigner, Blockchain Commons SSKR/Bytewords/Envelope, and Orchard reference material for the corresponding codecs. Pin any newly acquired sources; do not assume master or a latest release has the same protocol support.

Run all retained applicable vectors and inspect exclusions. A rejected valid vector might require private/hardened context absent from a public-only tool; record that reason. A negative vector must reject for the intended structural/semantic reason rather than an unrelated incidental error.

Compare byte outputs, addresses, hashes, amounts, fields, ordering, and classifications as appropriate. Decoded summaries alone are insufficient for consensus-sensitive scripts. Trace whether supposedly independent implementations share the same primitive/compiler; label shared ancestry. A second call to the project's production library is not an independent oracle.

Where feasible use isolated Bitcoin Core/Dash Core regtest nodes with networking disabled and synthetic wallets. Test getdescriptorinfo/deriveaddresses, watch-only/active import, fresh blank-wallet setup, network flags, receive/change addresses, and unsigned/partial/combined/finalized PSBT stages. Fund/sign/mine only synthetic regtest outputs when authorized. Record any temporary import adjustments; an adjusted import does not prove the project's unmodified export works.

Do not claim interactive MuSig2 signing, every Miniscript satisfaction, hardware-wallet interoperability, blockchain inclusion, or signature validity if only script/address/parser checks ran.

## 14. Logical grouping, finding names, and evidence

Organize findings first by category, then by coherent subsystem/workflow: for example SEC → Isolation / Egress / Secret lifecycle; FUN → HD derivation / PSBT / Recovery; API → Runtime contracts / Async state / Exports; BLD → Composition / WASM / CI; UI → Navigation / Visibility / Layout; ARC → Ownership / Dead code; DOC → Capabilities / Legal / Audit evidence.

Name a finding after the concrete defect, not a vague topic. Use:

```text
AUD-018-API001 — Medium — Invalid SSKR encoding silently selects Compact UR
AUD-018-DOC001 — Low — Recovery instructions omit the separate BIP39 passphrase
AUD-018-SEC001 — High — Secret-bearing vault can issue an unauthorized network request
```

These are naming examples, not findings about current code. Category counters run independently in initial presentation order. IDs remain stable if findings are later sorted by severity or grouped differently. Severity/status/priority are separate; do not restart an R/A/F sequence for correction tables.

A single finding describes one root cause with coherent consequences. Group affected variants under it when the fix and evidence are shared. Keep independent root causes separate even if they occur in one function. Cross-reference related findings and original IDs in follow-ups; do not duplicate a previous defect as new merely because another reviewer reproduced it.

Each confirmed finding needs:

- Exact affected source locations, adapter/build/feature combinations, and reviewed snapshot.
- Minimal synthetic reproduction with prerequisites and actual production entry point.
- Expected result from a supported contract or pinned authoritative reference.
- Observed result, including bytes/message/log where relevant.
- Concrete impact, exploitability, scope, and limits; distinguish possible risk from demonstrated harm.
- Evidence retained in an appropriate test/fixture/log, with hashes where needed.
- Recommended minimal correction and verification criteria, without applying it during a review-only audit.
- Category, severity, status, release-blocking decision/reason, and related/duplicate references.

Keep hypotheses, environment blocks, coverage gaps, and general refactoring recommendations outside confirmed findings unless a concrete reproducible contract failure is established. A non-reproduced allegation must retain its attempted scope and original reference.

## 15. Remediation and repeat verification

When fixes are authorized, record a separate fix commit and verification snapshot. Preserve caller-owned data and supported behavior; do not broadly replace production code from an older checkout. Add focused regressions to the active production path with literal expected results where meaningful.

A fix moves to `fixed` when implemented; it moves to `verified` only when its stated regression/acceptance requirements pass. Preserve original failure evidence, partial mitigations, unverified assumptions, and environmental caveats. A passing replay of an intermittent crash is not proof that the engine root cause was fixed.

Run affected checks after each coherent change. Once the final implementation is stable, run the necessary full source/canonical/build/browser gates on final artifacts. Repeating an unchanged suite without new changes or unresolved concerns adds no coverage. A diagnostic browser subset cannot be relabeled as a complete run.

Recheck legal/profile/gate/metadata documentation when adding modules or dependencies. Rust/build-input changes require canonical WASM regeneration and committed manifest consistency; a developer-host output must not replace canonical bytes. Verify both editions and selective combinations affected by the change.

If fixes change source or artifacts mid-audit, preserve the original baseline results and identify which later results apply to the remediation snapshot. Do not silently combine them into one apparent clean original review.

## 16. Completion criteria and handoff

A report is complete when every planned area has a recorded outcome and every confirmed finding has evidence and a disposition, not when everything is green. A failed/blocked audit can be a complete, honest audit report; it is not a passing release acceptance.

Before handoff:

1. Reconfirm source/artifact identity and enumerate changes since the baseline.
2. Review all seven categories and all four applications/shared tooling; record omitted modules and reasons.
3. Reconcile check commands, exit codes, unique totals, full/subset runs, initial failures, reruns, live observations, and incomplete work.
4. Confirm baseline and remediation snapshots are distinct where required; do not imply excluded work was performed.
5. Validate unique categorized IDs, logical grouping, cross-report references, English text, model/effort/phase metadata, and Markdown/JSON agreement against the schema.
6. Verify retained hash/source/vector/evidence links and provenance; distinguish public files from machine-local temporary logs.
7. Remove only audit-owned temporary probes from the repository and verify no user's pre-existing changes were deleted. Retain intentional regression fixtures/tests and report companions.
8. State unresolved defects, mitigations, release blockers, environmental blocks, unsupported cases, and next verification steps with concrete scope.
9. Update the audit index. Do not allocate an audit number to this guide, its template, or a documentation-only migration.
10. State the practical conclusion supported by evidence: tested capabilities and limitations, not a blanket guarantee of safety.

If any required full-audit area is omitted or blocked, identify the report as a full-scope audit with incomplete execution and list the gaps. Do not describe a targeted code review, source-only run, compile-only matrix, or documentation update as a fully executed end-to-end audit.
