# AUD-023 build reviewer harnesses

Audit AUD-023, build reviewer. Reviewed snapshot: HEAD `c5b62c2d489e7525326071128095ba95ecca92ac`
plus the dirty working tree of the baseline manifest (fingerprint `8e8649c9…`), and the uncommitted
`.github/workflows/release.yml` of `../dash-wallet-tools` (SHA-256
`8538fc2a…`). All scripts run from the repository root, read the repository only, use public test
data, and write only below `the local scratch folder `. Run browser and
build steps one at a time, for example under
`flock docs/audits/AUD-023-evidence/heavy.lock`.

## build-selective-variants.mjs

Builds seven selective Deriver variants into
`docs/audits/AUD-023-evidence/builds/build/` (Multi-Chain profile: Dash +
Ethereum, Bitcoin + Ethereum, everything without SSKR, Ethereum with every recovery feature, Dash
alone, Bitcoin alone; Dash Community profile without SSKR), checks that the builder refuses eleven
invalid combinations without writing a file, and scans the built pages: exactly one BIP39 English
wordlist, one copy of each WASM the build needs and none of the others, no http(s) URL outside the
reviewed links of `verify-key-derivation-artifact.mjs`, no public test vector of a coin the build
leaves out, and no share panels without SSKR.

Inputs: the working tree (`apps/key-derivation/scripts/build-key-derivation-html.mjs` and the
committed WASM files). Commands:

```sh
node docs/audits/AUD-023-harnesses/build-selective-variants.mjs reject
node docs/audits/AUD-023-harnesses/build-selective-variants.mjs build kd-bitcoin-alone   # and the other six ids
node docs/audits/AUD-023-harnesses/build-selective-variants.mjs scan
```

Expected: `reject` prints eleven `refused:` lines and exits 0. Each `build` prints the builder's
`Built …` and `SHA-256 …` lines and exits 0. `scan` prints one summary line per variant; on the
reviewed snapshot it exits 1 with eight `VIOLATION` lines: `kd-no-dash` and `kd-bitcoin-alone` carry
the Dash vectors `XmN7PQYW…`, `6PYMfcjo…` and `XbAei18d…`, and `kd-bitcoin-alone` carries
MnemoCode's Ethereum vector `0x9858EfFD…` and the coin name "Ethereum and EVM networks". A tree
whose builds carry no excluded coin's vectors exits 0.

## build-variant-startup.mjs

Opens each variant built above as a `file://` page in a fresh Chromium or Firefox context, waits up
to 120 s for `#crypto-self-test-status` to pass or fail, and prints the startup checks
(`#crypto-self-test-details`), the recovery tabs and the coins of MnemoCode's wallet question.

```sh
node docs/audits/AUD-023-harnesses/build-variant-startup.mjs chromium
node docs/audits/AUD-023-harnesses/build-variant-startup.mjs firefox kd-bitcoin-alone kd-no-bitcoin kd-dash-community-no-sskr kd-recovery-only
```

Expected on the reviewed snapshot: every variant `OK` (startup self-test passed, no page error, no
request), exit 0. A variant whose self-test fails, that raises a page error or makes a request
prints `FAILED` and the command exits 1.

## build-dash-words.mjs

Applies `findDashArtifactViolations` from `tooling/verify-dash-community-artifacts.mjs` to the Dash
Community selective variant and to the canonical Dash Community Deriver, Scanner and Viewer in
`dist/` (read only); the Multi-Chain Dash-only variant is reported for information.

```sh
node docs/audits/AUD-023-harnesses/build-dash-words.mjs
```

Expected: the four Dash Community pages `clean`, exit 0; the Multi-Chain Dash-only variant lists
"Bitcoin, Ethereum, Ethereum adapter registration, Multi-Chain branding" (not a failure).

## build-wasm-paths.mjs

Searches every committed `packages/*/generated/**/*.wasm` for absolute build-machine paths
(`/home/`, `/Users/`, `C:\Users\`) and reports whether each module is embedded in the canonical
Deriver pages of `dist/` (read only).

```sh
node docs/audits/AUD-023-harnesses/build-wasm-paths.mjs
```

Expected on the reviewed snapshot: exit 1; `packages/recovery-mhfe-wasm/generated/runtime/mhfe.wasm`
holds 21 paths below `$CARGO_HOME` and is embedded in both
canonical Deriver pages; the four project-built modules hold none. Exit 0 when no module holds such
a path.

## build-provenance-ci-refusal.mjs

Calls `verifyDependencyProvenance` on a synthetic fixture root (dummy lockfiles and placeholder
sources in the reviewer's scratch folder, as the unit test does) with a mocked GitHub that confirms
every commit, once with `CI=true` and once without.

```sh
node docs/audits/AUD-023-harnesses/build-provenance-ci-refusal.mjs
```

Expected on the reviewed snapshot: `CI=true: refused: Unreleased upstream sources cannot be built in
CI: mnemocode-core, mhfe-v0.5.0.` and `CI unset: passed with warnings`, exit 0. Exit 1 if `CI=true`
does not refuse an unreleased pin or the unset case refuses.

## build-release-workflows.py

Static checks (PyYAML) of the Dash and canonical release workflows for AUD-022-SEC003 and
AUD-022-BLD002: read-only workflow default, write/OIDC/attestation permissions only on `publish`,
no dependency install in `publish`, `publish` needs a `launchers` job that runs
`verify-key-derivation-launcher.mjs` (with `--profile dash-community` for Dash) on Linux, Windows
and macOS runners, and, for Dash, the truth table of the `publish` `if:` over every upstream result.
Each workflow is then mutated in memory four ways; every mutation must be refused.

```sh
python3 docs/audits/AUD-023-harnesses/build-release-workflows.py \
  ../dash-wallet-tools/.github/workflows/release.yml \
  .github/workflows/release.yml
```

Expected on the reviewed snapshot: both workflows `passed`, every mutation `refused`, exit 0. The
committed Dash workflow (`git -C ../dash-wallet-tools show HEAD:.github/workflows/release.yml`,
SHA-256 `eb8657d6…`) fails 18 checks and exits 1.

## build-doc-links.py

Resolves every relative link and `#anchor` (GitHub heading slugs) in the eleven documents of the
build reviewer's scope and lists unusual non-ASCII characters outside code.

```sh
python3 docs/audits/AUD-023-harnesses/build-doc-links.py
```

Expected on the reviewed snapshot: no `BROKEN` line, "unusual characters outside code: none" for
every document, exit 0.
