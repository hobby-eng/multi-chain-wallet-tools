# Verification map

These commands describe the current source tree. A command being available is not evidence that it passed for a particular commit. Record command, source revision plus local changes, runtime, date and outcome in an audit report.

## What runs where

| Command / implementation | Checks | Invocation |
| --- | --- | --- |
| `pnpm metadata:check` | Workspace versions, release facts, selected documentation assertions and relative file links | `check`, `verify`, `verify:ci` |
| `pnpm check` | Metadata plus TypeScript | Explicit; equivalent steps also in verification |
| `pnpm test` | `apps/**/*.test.ts`, `packages/**/*.test.ts`, `tooling/**/*.test.mjs` | `verify`, `verify:ci`; includes existing independent conformance suites |
| `node tooling/verify-dip13-vectors.mjs` | Independent dashhd DIP13 mainnet/testnet derivation | `verify`, `verify:ci` |
| `pnpm test:discovery:stream` | Shared Orchard stream integration | `verify`, `verify:ci` |
| `pnpm test:self-test` and `pnpm test:self-test:dash-community` | Edition-specific startup vectors | `verify`, `verify:ci` |
| `pnpm test:rust` | Native first-party Rust bridge/scanner tests and official fixtures | `verify`; **not** `verify:ci` |
| `pnpm build:wasm` | Pinned Rust/wasm-bindgen rebuild and generated glue checks | `build`, `verify`; not `verify:ci` |
| `pnpm test:wasm` | Actual checked-in/generated WASM boundary, note recovery, key disposal and vectors | `verify`, `verify:ci` |
| `node tooling/verify-artifact-profiles.mjs` | Four tools × two editions, CSP, graph/content boundaries and artifact invariants | `verify`, `verify:ci` |
| `node tooling/verify-reproducible-build.mjs` | Two HTML builds, source/build identity and deterministic outputs | `verify`; CI variant uses `--reuse-generated-wasm` |
| Release bundle/manifest verifiers | Exact named files, sidecars, manifests and edition separation | `verify`, `verify:ci` |
| `pnpm test:browser:files` | Real standalone `file://` UI in Chromium/Firefox, both editions | **Separate**, not included in `verify`/current CI |
| `node tooling/verify-browser-regressions.mjs` | CSP/storage probes, verifier revisions, CoinJoin, BIP38 and BIP85 | **Separate**, not included in `verify`/current CI |
| `test:activity-viewer:*`, `test:discovery:mainnet`, `test:discovery:testnet`, `test:discovery:batch*` | Mutable public-provider observations | **Separate**, intentionally outside deterministic CI |
| `pnpm audit` | Package vulnerability advisories, not first-party correctness | Separate online command |
| `node tooling/check-upstream-versions.mjs` | Upstream version/pin comparison | Separate scheduled workflow; does not update dependencies |

The current GitHub `ci.yml` builds `Dockerfile.reproducible`, whose final build layer runs **`pnpm verify`**, not `pnpm verify:ci`. This includes native Rust and a WASM rebuild before the committed-byte comparison. It does not run Playwright or live providers.

Some verifiers are imported modules rather than standalone executable tests: `verify-dash-sdk-build.mjs` checks installed SDK versions/integrities when Viewer/Scanner build; `verify-evo-read-only.mjs` and Dash graph gates are used by artifact/build checks. Their presence in `tooling/` does not mean they need another identical CLI invocation.

## Efficient local sequence

1. Change one functional area and run its targeted test file(s), plus TypeScript if interfaces changed.
2. After functional fixes, run the full module suite once and build the eight HTML files. `pnpm build:html` reuses the existing generated Orchard WASM; it is not a fresh WASM build.
3. Run both browser runners against those final files. Repeat only affected browser/edition/case combinations after diagnosing failures. See [browser acceptance](BROWSER_ACCEPTANCE.md).
4. Run live network observations separately, with public fixtures only.
5. Before release, use the canonical Docker verification and compare its generated WASM with the committed bytes. Review both editions' manifests.

Browser filters: `BROWSER_ENGINES` works for both runners. The extended runner also accepts `BROWSER_PROFILE` and `BROWSER_CASES`. `PLAYWRIGHT_MODULE` points to a local Playwright installation; Playwright is not a runtime dependency of the HTML applications.

## Existing evidence and coverage limits

The [remediation record](AUDIT_REMEDIATION_2026-09-12.md) records 919 passing module tests and a 16/16 standalone acceptance matrix for its snapshot, plus a qualified extended-browser result. The [follow-up audit](AUDIT_FOLLOWUP_2026-09-12.md) found additional edge cases outside that coverage. Historical success is not a claim that those new findings are fixed.

- Ethers, dashhd, Go/btcd WASM and literal upstream vectors provide useful comparisons, but shared primitive ancestry must be considered. Two package names do not automatically mean two independent cryptographic implementations.
- The BitcoinerLab compiler is production code here; comparing its result to another call into itself is not an independent script oracle.
- Vitest's configured coverage include list currently covers crypto-core and coin-protocols only. There is no complete coverage percentage or minimum threshold for Inspector, network clients or UI controllers. The normal suite does not generate coverage reports.
- Vector acquisition in `apps/psbt-inspector/tests/independent-audit/update-vectors.mjs` is pinned and explicit. Tests use stored fixtures without network access. Changes to its parsers must assert expected suite counts so that silently extracting fewer vectors cannot look like success.
- Real Core wallet import/sign/spend compatibility, every hardware wallet, every Miniscript satisfaction and a MuSig signing coordinator are not covered by the current checks. The Inspector does not implement a MuSig signing lifecycle.
