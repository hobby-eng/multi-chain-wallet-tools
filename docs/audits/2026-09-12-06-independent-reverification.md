# Independent re-verification audit — 2026-09-12 (third pass, commit d978dd4d)

This report re-checks every finding, drift item, maintainability note, test/vector gap and recommendation of the [second-pass independent audit](2026-09-12-04-independent-audit.md) (commit `a652ad5f`) against the remediated tree, and records a fresh audit of the new code. Nothing in the repository was modified by the reviewer except this report and its JSON twin. Every runtime claim below was re-executed on this host; diffs alone were not accepted as proof.

## Identity, environment and scope

- **Reviewer:** Claude Fable 5.1 (model id `claude-fable-5-1`, Anthropic), running as Claude Code inside the Claude desktop app.
- **Date/time:** 2026-09-12, 13:29–13:58 UTC (16:29–16:58 Europe/Moscow). Times per check are listed with the commands.
- **Host:** Ubuntu 26.04.1 LTS, Linux 7.0.0-31-generic x86_64, 16 CPU threads, 14 GiB RAM.
- **Repository:** `/home/user/.copilot/repos/copilot-worktrees/derivationtool/hobby-eng-studious-tribble`, branch `hobby-eng-psbt-inspector-v4`, upstream `origin/hobby-eng-psbt-inspector-v4` (ahead 13).
- **Commits reviewed:** `a652ad5f` → `0b747882` (12 remediation commits: `bce69a35`, `84fb94c4`, `05bcc7a1`, `69d5fe03`, `014cd7d7`, `08136107`, `c072eccb`, `18b753cd`, `ad000f0d`, `068105ee`, `9a648f15`, `0b747882`) and the final `d978dd4d` "Bind local canonical builds to Git state" (tooling only: `tooling/build-reproducible.sh`, `tooling/verify-reproducible-container.mjs`). Module tests, TypeScript, Rust, artifact builds and both browser suites ran on `0b747882`; the canonical Docker build, the container verification and the probes ran on `d978dd4d`. The two commits differ only in the two tooling files, which are not inputs to the artifacts (verified: container `/dist` for `d978dd4d` is byte-identical to the local `0b747882`/`d978dd4d` build apart from the record's own commit field).
- **Working tree:** clean before and after (`git status --short --branch` printed only the branch line); `git diff --check` exit 0.
- **Toolchain observed:** Node v24.19.0 (`/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`); pnpm 11.19.0 fallback wrapper (`/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm`; repository pin 11.25.0 — only used inside Docker); TypeScript 7.0.2; Vitest 5.0.0; Playwright 1.62.1 via `PLAYWRIGHT_MODULE=/home/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`; Chromium 151.0.7922.34 (`/home/user/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`); Firefox 153.0 (`/home/user/.cache/ms-playwright/firefox-1538/firefox/firefox`); Docker 29.8.0 build 88096ef; Rust/Cargo 1.98.1 (`RUSTUP_HOME`/`CARGO_HOME` under `/home/user/Documents/derivationtool23/.tools/`); local wasm-bindgen 0.2.128 now matches the pin but was **not** used — the committed WASM was compared against the canonical container output; btcutil-js 0.4.1 (Go/btcd WASM oracle).
- **Constraints honoured:** no code, test, doc, lock-file or artifact edits (other than this report); no new worktree; no commit/push/tag/release; browser security, CSP and sandbox untouched; no user secrets — only official vectors (BIP32 test vectors 1/2, Trezor "abandon×11 about" phrase, Core Miniscript/PSBT corpora) and the generator points `G`/`2G` as marked synthetic keys.
- **Path hygiene:** the brief asked that no audit file, log or report contain the real home directory. Tracked files: none contain it (checked with `git grep`). Ignored `test-results/**/report.json` files written by the acceptance runners (36 files) and all reviewer logs had the real home directory replaced with `/home/user` — these are ignored outputs, not code inputs. One Playwright-managed symlink under `test-results/browser-runtime/browsers/.links/` embeds the path in its link name and was left untouched because it is runtime state, not a log.

## Assessment

All six confirmed defects of the second pass are fixed or mitigated at runtime, every Static/Unconfirmed item is resolved, and 9 of the 10 test/vector additions plus 6 of the 6 structural recommendations were implemented. The tree is release-candidate quality with respect to the previous findings. What remains open is small and non-blocking: two documentation omissions introduced by the fixes themselves (release-asset list and third-party notice), one reviewed-and-documented exception (Dash Community Inspector still bundles the shared Bitcoin decoder code under a counted allowlist), the roadmap-tracked consolidation of grammar/checksum helpers and controller size, one missing BIP38 Dash-prefix round-trip test, and the live DashScan pending-only fixture. No new High or Medium defect was found in this pass.

## 1. Status of every previous finding

| Item | Previous severity | Status on `d978dd4d` | Runtime evidence (this pass) |
| --- | --- | --- | --- |
| IA-01 `multi()`/`sortedmulti()` > 20 keys compiled "sane" | High | **Fixed** | Probe R1: `wsh(multi(1,20 keys))` compiles; 21 keys, `sortedmulti(1,21)`, `sh(wsh(multi(1,21)))` rejected with "multi() contains 21 keys; the p2wsh limit is 20"; bare `multi(1,4)` rejected (limit 3); `multi_a(1,999)` compiles, 1000 rejected (limit 999); `sh(multi(16,16))` rejected by the P2SH 520-byte wrapper; `thresh` with 21 `pk` fragments still valid (limit applies to CHECKMULTISIG only, as in Core). Limits centralised in `apps/psbt-inspector/src/consensus-limits.ts` and enforced in `validatePolicyMiniscript` with an explicit context (`bare`/`p2sh`/`p2wsh`/`tapscript`). Tests: `apps/psbt-inspector/tests/consensus-limits.test.ts`. |
| IA-02 Firefox page crash on terminating an in-flight derivation worker | Medium | **Fixed (behaviourally)** | Reviewer harness, Firefox 153, rebuilt artifacts: `main-immediate-clear` 3/3 ok, `main-tab-clear` 3/3, `cancel-during-20` 3/3, `tab-switch-during` 3/3, `bip85-tab-clear` 3/3, `full` (BIP85 child wallet + signer + clear + reload) 3/3, Dash Community `main-immediate-clear` 3/3 and `cancel-during-20` 3/3; Chromium `main-tab-clear` 2/2. Previously 12/12 of the same Multi-Chain variants crashed. The `derive-client.ts` lifecycle (`booting`→`ready`→`terminated`, deferred `worker.terminate()` until the `ready` message, queued requests wiped on terminate) is what the harness exercised; the repository's own `workerReadiness` case passed in both engines and both editions (38/38). Engine-level root cause remains uncharacterised (see §10). |
| IA-03 contradictory `sortedmulti` rows | Low | **Fixed** | Probe R1 rows: `wsh(sortedmulti)` → exactly "threshold=2-of-2" + "key order=BIP67 lexicographic sort · sortedmulti()"; `sh(multi)` → "Supplied order preserved · multi()"; `tr(...,sortedmulti_a)` → "lexicographic x-only key sort · sortedmulti_a()"; `multi_a` → "supplied key order · multi_a()". `calls()` now skips matches preceded by `[a-z0-9_]`. |
| IA-04 PSBT cross-field relationships unverified | Low | **Fixed** | Probe R2 (synthetic PSBTs from `G`/`2G`): wrong MuSig2 aggregate → rejected "does not match KeyAgg(participants)"; nonce for a non-participant → rejected; non-DER partial signature → rejected; 300-level BIP32 path → rejected (255 limit); output value 2^63 → rejected (`MAX_MONEY`); redeem script vs mismatching witness UTXO → accepted with "Redeem/witness script commitments: failed" in the verification matrix; control-block internal key mismatch → "Taproot control-block internal key: failed"; v2 mixed height/time locks → "PSBT v2 locktime requirements: failed"; modifiable flags 0xff → "not-verified". The 133-case official corpus still classifies with 0 anomalies. |
| IA-05 Dash Community artifact gate skipped the Inspector | Low | **Mitigated, documented exception** | `tooling/verify-dash-community-artifacts.mjs` now iterates `profileToolIds(profile)` and applies `DASH_INSPECTOR_SHARED_DECODER_ALLOWLIST` (counted maxima, e.g. "bitcoin" ≤ 71, "Taproot" ≤ 48, "MuSig" ≤ 41) plus forbidden implementation markers (btcutil-js, BIP0322, TapTweak, keyAggregate, BIP49/84/86 …). `musig-psbt.ts` is physically replaced by `musig-psbt-disabled.ts` in the Dash build (`build-psbt-inspector-html.mjs` forbids the real module as input). The shared Bitcoin descriptor decoder code is still bundled; `SECURITY_AUDIT.md` now discloses "bounded shared Inspector decoder vocabulary". Acceptable, but the bundle is not Bitcoin-free — see §9. |
| IA-06 conformance suite asserted less than it appeared | Medium (test credibility) | **Fixed** | `crypto-conformance.test.ts` compiles the `"?"` Core vectors and compares NONMAL/NEEDSIG/TIMELOCKMIX flags, asserts `expectedPsbtError` per invalid PSBT vector, and includes BIP341 multi-leaf vectors 5/6. Reviewer probe R1 independently re-ran all 119 valid Core contexts: 0 compile failures, 0 flag mismatches; both multi-leaf trees match `scriptPubKey`. |
| Static: DashScan pending-only history failed pagination | Static/Unconfirmed | **Fixed (mocked)** | Probe R3: pending-only page with `pagination.total` 1 or 0 → OK (1 tx); 150 confirmed + 1 pending with total 151 or 150 → OK (150 rows); total off by 2 → still rejected; total changing between pages → still rejected. Test: `packages/dash-network/tests/history-pagination.test.ts`. Live confirmation still absent (§10). |
| Static: whitespace stripped before checksum | Static/Unconfirmed | **Fixed** | `pkh( KEY )` → "Whitespace is not permitted inside a descriptor expression; its checksum covers the exact spaced text". |
| Static: `older(65536)` shown as "0 blocks" without warning | Static/Unconfirmed | **Fixed** | Row "Timelock 1 · effective constraint = None · BIP68 masks this value to a zero delay; reserved bits do not…" emitted alongside "Relative lock 1 = 65536 = 0 blocks". |
| Static: `deriveDashPlatform` accepted any key class | Static/Unconfirmed | **Fixed** | Probe R3: key classes 0 and 1 accepted, 2 rejected (`DIP17_PAYMENT_CHAINS`). Test: `dash-platform.test.ts`. |
| Static: mixed-case Platform address | Informational | Unchanged (rejected) | `daSh1…` rejected. |

## 2. Status of the previous documentation-drift items

1. "Intermittent Firefox BIP85 reload crash" wording — **Fixed** in `docs/ROADMAP.md`, `docs/VERIFICATION.md`, `docs/BROWSER_ACCEPTANCE.md`, `README.md`, `SECURITY_AUDIT.md` (no occurrences). It remains in the historical snapshot `docs/audits/2026-09-12-03-followup-audit.md` (4 occurrences), which is acceptable because `docs/VERIFICATION.md` states that historical results are not evidence for the current checkout.
2. "34/34 extended" claim not reproducible — **Fixed**: the matrix is now 38 cases, documented as 38 in `docs/BROWSER_ACCEPTANCE.md:33`, and reproduced 38/38 here.
3. Dash Community Inspector content claims — **Fixed by disclosure** (`SECURITY_AUDIT.md:16` "bounded shared Inspector decoder vocabulary"; README keeps "P2SH-only build without Bitcoin SegWit, Taproot, or MuSig2", which is true of behaviour and controls).
4. "does not silently sort" statement vs `sortedmulti` rows — **Fixed** (rows corrected; statement now accurate).
5. `docs/releases/v0.1.4.md` bullet placement — **Fixed** (consensus limits, PSBT checks, worker readiness contract now under implemented changes; "Pending release preparation" correctly says the feature list is not approved).
6./7. MuSig2 scope, BIP45/48 wording, descriptor vs PSBT distinction — unchanged and still accurate.

## 3. Status of the maintainability findings

| # | Item | Status |
| --- | --- | --- |
| 1 | Substring-based `calls()` extraction in `descriptor.ts` | **Mitigated, not restructured**: 9 call sites remain; the word-boundary guard fixes the observed double-count (IA-03). Rows are still not derived from the `ExpressionNode` tree. |
| 2 | Three grammar layers each re-validating keys | **Open** (tracked in `docs/ROADMAP.md:37`). The consensus-limit module now gives all layers one owner for limits, which removes the concrete risk shown by IA-01. |
| 3 | Imports at the end of `descriptor.ts`; duplicated BIP380 `polymod` | **Open**: 7 `import` statements still after line 700 of the 819-line file; `polymod` still defined in both `apps/psbt-inspector/src/descriptor.ts` and `packages/export-core/src/descriptor.ts`. Roadmap-tracked. |
| 4 | `controller.ts` size / implicit worker lifecycle | **Partially addressed**: worker lifecycle is now explicit in `derive-client.ts` (`ready()` contract, awaited at `controller.ts:1332`); the controller itself is 2056 lines (was 2053). Roadmap-tracked. |
| 5 | `psbt.ts` mixes framing, schema and relationships | **Addressed**: `PsbtVerificationCheck` / `globalVerification` / `inputVerification` form the separate relationship table that also drives the UI "Verification matrix" cards. |
| 6 | Hard-coded tool list in the Dash gate | **Fixed** (`profileToolIds(profile)`). |
| 7 | Conformance test assertions | **Fixed** (see IA-06). |

## 4. Status of the "tests and vectors to add" list (§12 of the previous report)

| # | Item | Status |
| --- | --- | --- |
| 1 | Key-count limits | **Added** (`consensus-limits.test.ts`, descriptor tests). |
| 2 | Browser "terminate during in-flight derivation" | **Added** (`workerReadiness` case, both engines/editions; passed 38/38 here). |
| 3 | Exact multisig row assertions | **Added**. |
| 4 | PSBT relationship fixtures | **Added** (`psbt-relationships.test.ts`). |
| 5 | Compile `"?"` vectors, flag comparison, invalid-PSBT error class, BIP341 multi-leaf | **Added**. |
| 6 | BIP38 uncompressed vector 2 by hex + re-encryption; Dash-prefix round trip | **Partially**: vector 2 (`6PRNFFkZ…`, hex `09c26868…`) is asserted with re-encryption in `bip38.test.ts:44-50`; **no Dash-prefix BIP38 round-trip test exists** (no "dash"/"prefix" reference in the file). |
| 7 | Go/btcd differential for the Deriver families | **Added** (`packages/coin-protocols/tests/independent-derivation-conformance.test.ts`: Bitcoin BIP44/49/84/86 mainnet+testnet at boundary indexes, Taproot output keys vs Go `tr(xpub)`, Ethereum, Dash Core/CoinJoin/Purpose48/legacy mobile/DIP17/DIP13, descriptor export round trip). Runs inside `pnpm test` (84 files / 1071 tests). |
| 8 | BIP44/BIP49 Trezor first addresses, Ethereum index 0/1 | **Added** (`bitcoin.test.ts:33`, conformance test lines 37/68/69). |
| 9 | Inspector in the Dash gate | **Added** (counted allowlist). |
| 10 | Live DashScan pending-only fixture | **Not done**: only mocked pages are tested; whether the live API counts pending rows in `pagination.total` remains unobserved. The code now accepts both interpretations, so the risk is confined to reporting, not correctness. |

## 5. Status of the recommendations (§13 of the previous report)

- Release gating with a required extended-browser result — **Done**: `.github/workflows/ci.yml` and `release.yml` add a `browser` job (Playwright 1.62.1, Chromium+Firefox, both suites); `release` needs `browser`; `verify-reproducible-container.mjs` asserts the gate exists.
- Consensus-limit table — **Done** (`consensus-limits.ts`, consumed by the Miniscript engine, descriptor decoder and PSBT parser; `CONSENSUS_LIMITS` includes 520/10 000 bytes, tree depth 128, BIP32 depth 255, BIP68 masks, lock-time threshold, `MAX_MONEY`).
- Verified/unverified matrix in the Inspector UI — **Done** (`verificationMatrix()` in `app.ts`, statuses `verified`/`failed`/`not-verified` per relationship).
- Worker readiness contract with a visible "Initialising cryptography locally…" state — **Done**.
- Machine-readable verification record — **Done** (`dist/verification-record.json`, schema `docs/verification-record.schema.json`, copied into both release bundles and covered by `SHA256SUMS`; `SOURCE_COMMIT`/`SOURCE_DIRTY` bound in CI and, since `d978dd4d`, in the local wrapper). It is unsigned, as documented.
- Feature ideas 1–5 (fee-rate display, BIP388 policy validation, export diff mode, Electrum mode, practice-mode banners) — **Not implemented**; these were suggestions, not defects. No `sat/vB`, `BIP388` or `faucet` strings exist in the Inspector/Deriver sources.

## 6. Fresh audit of the remediation code (new findings)

No new confirmed defect. Observations, all Low/Informational:

- **NF-01 (Low, documentation drift introduced by the fix):** `RELEASING.md` "What GitHub publishes" (lines 72–101) lists 10 files per bundle, but `pnpm release:bundle` now also produces `dist/multi-chain-edition/release/verification-record.json` (present in the generated directory and in `SHA256SUMS`, and uploaded because `release.yml` publishes `dist/multi-chain-edition/release/*`). `tooling/verify-github-release-assets.mjs` requires the file, so the documented list is one file short for both bundles.
- **NF-02 (Informational):** `THIRD_PARTY_NOTICES.md` does not list the new `playwright@1.62.1` devDependency added in `0b747882` (`package.json:77`), while it lists `typescript` and `vitest` in the same development-only table.
- **NF-03 (Informational, reviewed exception):** the Dash Community PSBT Inspector artifact still contains the shared Bitcoin descriptor decoder vocabulary (≤ 71 "bitcoin" occurrences by allowlist). Behaviour is Dash-only and the exception is now documented; a future change that raises a count above its maximum will fail the gate, which is the intended tripwire.
- **NF-04 (Informational):** the new `consensus-limits.ts` sets `maximumMoney` identically for Bitcoin and Dash (21 000 000 × 10⁸). Dash's `MAX_MONEY` is also 21 000 000 DASH in `dashd` (`amount.h`), so the value is correct; a comment naming the Dash source would prevent a future "copy-paste" suspicion.
- **NF-05 (Informational):** the probe timing for `tr(musig(999 × G))` plus a 1024-leaf balanced tree was 4.2 s on this host (previously ~4 s); no regression, and the UI runs this inside a worker.

## 7. Tests and checks executed (all on this host; exit codes in parentheses)

| Time (UTC) | Command / check | Result |
| --- | --- | --- |
| 13:29–13:43 | `pnpm sync-project-metadata --check`, `verify-project-facts`, `tsc` (native TS 7.0.2), `verify-reproducible-container`, `verify-dip13-vectors`, `verify-shielded-stream`, both self-tests, `verify-shielded-wasm`, `test-rust` | all (0); Rust 12 passed / 1 ignored |
| 13:43 | Vitest (`pnpm test`, JSON reporter) | 84 files, 185 suites, **1071 passed, 0 failed, 0 skipped** |
| 13:44–13:45 | `build-html-profiles`, `verify-artifact-profiles`, `verify-reproducible-build --reuse-generated-wasm`, `create-verification-record --mode ci`, release assets (both profiles), `verify-verification-record` | all (0) |
| 13:45–13:47 | `verify-browser-files.mjs` (Chromium + Firefox, both editions, 4 tools) | **16/16 passed**, 32 layout screenshots, 0 unexpected requests |
| 13:47 | `verify-browser-regressions.mjs` | **38/38 passed** (10 case families × engines × editions, incl. `worker-readiness`) |
| 13:48 | Reviewer probes R1/R2/R3 (Vitest, scratch config, 9 tests) | 9/9 passed; details in §1 |
| 13:49–13:51 | `docker build --platform linux/amd64 --network host -f Dockerfile.reproducible --build-arg SOURCE_COMMIT=d978dd4d… --build-arg SOURCE_DIRTY=false --target artifacts` | (0); 41 files exported from `/dist` |
| 13:52 | Container `/dist` vs local `dist/` SHA-256 (40 artifact/sidecar/WASM files) | **byte-identical**; `verification-record.json` identical apart from `commit`/`sourceDate` fields |
| 13:52 | Markdown link check (32 files, 134 relative links, 54 unique URLs) | 0 broken, 0 non-200 |
| 13:52 | `pnpm audit` / `pnpm audit --prod` | no known vulnerabilities |
| 13:53–13:57 | Reviewer Firefox/Chromium termination harness | 24 Firefox runs ok, 2 Chromium runs ok, 0 crashes (§1, IA-02) |

## 8. Browser results

- Basic acceptance 16/16 and extended regressions 38/38 on the rebuilt `0b747882` artifacts (identical bytes to `d978dd4d`). The `worker-readiness` case clicks Clear, Cancel and a protocol tab immediately after starting a derivation and asserts no page error and no exposed input.
- Reviewer harness variants (independent of the repository runner, `file://` loading, all network routes aborted): listed in §1. Every variant that crashed on `a652ad5f` now completes, including a full BIP85 child-wallet + message-signer + Clear + reload cycle in Firefox.

## 9. Docker and reproducibility

- Canonical container build for `d978dd4d` with the new `SOURCE_COMMIT`/`SOURCE_DIRTY` build-args succeeded; the exported `/dist` matches the local build byte-for-byte (40 files) and the record's `commit`/`dirty` fields read `d978dd4d…`/`false`.
- `tooling/build-reproducible.sh` now derives both build-args from `git rev-parse HEAD` and `git status --porcelain`; `verify-reproducible-container.mjs` asserts their presence in the wrapper and the three workflows. Verified on `d978dd4d` (exit 0).
- The committed generated WASM equals the container output (unchanged from the previous pass; no Rust source changed since).

## 10. Residual limitations

- IA-02 is fixed behaviourally; the Firefox engine-level cause (why terminating a booting 12 MB Blob-URL worker kills the content process) is still not characterised. The readiness contract avoids the trigger rather than proving the engine safe.
- Live DashScan semantics for pending-only addresses remain unobserved (§4 item 10).
- No libsecp256k1 or Bitcoin/Dash node was available as a third oracle; Go/btcd and Noble/Scure remain the two executed implementations.
- Live-provider reachability was not re-run in this pass (it was 9/9 on the same day and no network code changed except DashScan pagination, which is covered by mocked probes).

## 11. Checks not performed (with reason)

- Live-provider smoke: not repeated (see §10).
- Local WASM rebuild with the now-matching wasm-bindgen 0.2.128: not run; the canonical container remains the reference and its output equals the committed WASM.
- Headed browser / Firefox crash dump: headless session.
- `pnpm install --frozen-lockfile` with pnpm 11.25.0 outside Docker: pinned version not installed locally; succeeded inside the container.
- Bitcoin Core / Dash Core RPC import of exported descriptors and PSBT signing round trips: no node available.

## 12. Remaining open items (consolidated)

1. **NF-01** `RELEASING.md` publish lists omit `verification-record.json` (Low, docs).
2. **NF-02** `THIRD_PARTY_NOTICES.md` omits `playwright@1.62.1` (Informational, docs).
3. Maintainability items 1–4 (substring `calls()`, three grammar layers, imports-at-end + duplicate `polymod`, 2056-line controller) — roadmap-tracked, not defects.
4. BIP38 Dash-prefix round-trip test absent.
5. Live DashScan pending-only fixture absent.
6. IA-05 exception: Dash Community Inspector bundles shared Bitcoin decoder code under a counted allowlist (documented; acceptable).
7. Feature suggestions 1–5 of the previous report: not implemented (optional).

## Reproduction and evidence layout (outside the repository)

Reviewer files live in the session scratchpad (not committed): `probes/vitest.probe.config.mjs`, `probes/r1-descriptors.probe.ts`, `probes/r2-psbt.probe.ts`, `probes/r3-dash.probe.ts`, `harness/ff-crash.mjs`, `harness/linkcheck.mjs`; logs `logs2/{checks.log,vitest.json,build-browser.log,probes.log,docker-build.log,docker-dist.sha256,local-dist-now.sha256,linkcheck.log,ff-harness.log}`; runner outputs `browser-files2/`, `browser-regressions2/`. All were rewritten to use `/home/user` in place of the real home directory.
