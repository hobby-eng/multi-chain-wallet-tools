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
| `pnpm test:browser:files` | Real standalone `file://` UI in Chromium/Firefox, both editions | Separate from `verify`; mandatory `browser` job in pull-request, `main`, and release CI |
| `pnpm test:browser:regressions` | CSP/storage probes, worker readiness, verifier revisions, CoinJoin, BIP38 and BIP85 | Separate from `verify`; mandatory `browser` job in pull-request, `main`, and release CI |
| `test:activity-viewer:*`, `test:discovery:mainnet`, `test:discovery:testnet`, `test:discovery:batch*` | Mutable public-provider observations | **Separate**, intentionally outside deterministic CI |
| `pnpm audit` | Package vulnerability advisories, not first-party correctness | Separate online command |
| `node tooling/check-upstream-versions.mjs` | Upstream version/pin comparison | Separate scheduled workflow; does not update dependencies |

The current GitHub `ci.yml` has two mandatory jobs. `verify` builds `Dockerfile.reproducible`, whose final build layer runs **`pnpm verify`**, including native Rust and a WASM rebuild before the committed-byte comparison. `browser` installs the pinned Playwright package and matching Chromium/Firefox binaries, builds all eight standalone HTML files from committed WASM, and runs both browser suites directly over `file://`. Neither job contacts mutable wallet-data providers.

Some verifiers are imported modules rather than standalone executable tests: `verify-dash-sdk-build.mjs` checks installed SDK versions/integrities when Viewer/Scanner build; `verify-evo-read-only.mjs` and Dash graph gates are used by artifact/build checks. Their presence in `tooling/` does not mean they need another identical CLI invocation.

## Efficient local sequence

1. Change one functional area and run its targeted test file(s), plus TypeScript if interfaces changed.
2. After functional fixes, run the full module suite once and build the eight HTML files. `pnpm build:html` reuses the existing generated Orchard WASM; it is not a fresh WASM build.
3. Run both browser runners against those final files. Repeat only affected browser/edition/case combinations after diagnosing failures. See [browser acceptance](BROWSER_ACCEPTANCE.md).
4. Run live network observations separately, with public fixtures only.
5. Before release, use the canonical Docker verification and compare its generated WASM with the committed bytes. Review both editions' manifests.

Browser filters: `BROWSER_ENGINES` works for both runners. The extended runner also accepts `BROWSER_PROFILE` and `BROWSER_CASES`. The repository pins Playwright as a development dependency; `PLAYWRIGHT_MODULE` can override module resolution for a separately installed matching copy. Playwright is not bundled into or used at runtime by the HTML applications.

## Existing evidence and coverage limits

The [remediation record](audits/2026-09-12-02-remediation-audit.md) records 919 passing module tests and a 16/16 standalone acceptance matrix for its snapshot, plus a qualified extended-browser result. The [follow-up audit](audits/2026-09-12-03-followup-audit.md) found additional edge cases, and the [independent audit](audits/2026-09-12-04-independent-audit.md) records the later pre-remediation state. The [Codex remediation verification](audits/2026-09-12-05-independent-remediation.md) records the corrected commit, canonical verification record, artifact hashes, 1,071 module tests and final 16/16 plus 38/38 browser matrices; the [independent re-verification](audits/2026-09-12-06-independent-reverification.md) separately rechecks the remediated findings and remaining limitations. Historical success applies only to its recorded snapshot; use the generated `dist/verification-record.json` for each new build.

`pnpm verify` and `pnpm verify:ci` emit `dist/verification-record.json` after their checks succeed. It records the exact source commit and dirty state, source fingerprint, pinned toolchain, check groups, and SHA-256 hashes of all eight HTML artifacts and four generated Orchard integration files. Both edition bundles contain the same record, and their `SHA256SUMS` files cover it. The record is machine-readable evidence, not a signature. Tagged GitHub releases additionally use GitHub's OIDC build-provenance attestation; verify a downloaded release asset with `gh attestation verify <file> --repo hobby-eng/multi-chain-wallet-tools`.

- Ethers, dashhd, Go/btcd WASM and literal upstream vectors provide useful comparisons, but shared primitive ancestry must be considered. Two package names do not automatically mean two independent cryptographic implementations.
- The BitcoinerLab compiler is production code here; comparing its result to another call into itself is not an independent script oracle.
- Vitest's configured coverage include list currently covers crypto-core and coin-protocols only. There is no complete coverage percentage or minimum threshold for Inspector, network clients or UI controllers. The normal suite does not generate coverage reports.
- Vector acquisition in `apps/psbt-inspector/tests/independent-audit/update-vectors.mjs` is pinned and explicit. Tests use stored fixtures without network access. Changes to its parsers must assert expected suite counts so that silently extracting fewer vectors cannot look like success.
- Real Core wallet import/sign/spend compatibility, every hardware wallet, every Miniscript satisfaction and a MuSig signing coordinator are not covered by the current checks. The Inspector does not implement a MuSig signing lifecycle.
