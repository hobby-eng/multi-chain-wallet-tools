# AUD-023 harnesses: selftests reviewer

These scripts belong to audit AUD-023 of multi-chain-wallet-tools (reviewed snapshot: HEAD
c5b62c2d489e7525326071128095ba95ecca92ac plus the dirty tree of manifest fingerprint
8e8649c9059d2bdeb84d5eccb2d1191142888c0c32601df1276116d640b873aa). They check the startup and
full self-tests added to the Deriver, the PSBT Inspector, the Discovery Scanner and the Activity
Viewer since AUD-022. They use public test data only and never write to `dist/` or to product
files. Run every command from the repository root. Browser and build scripts are heavy: wrap them
in `flock docs/audits/AUD-023-evidence/heavy.lock`.

## selftests-independent-vectors.mjs

What it checks: recomputes a sample of the known answers with an implementation written in the
script (node:crypto/OpenSSL, node:zlib and BigInt secp256k1, RFC 6979, BIP32, bech32/bech32m,
base58check, BIP-322 simple signing, BIP352 labels, BIP38, age X25519 decryption, MNCL decoding,
SSKR Shamir interpolation, BIP380 checksum, EIP-55 with OpenSSL keccak-256). It imports no product
code and none of the product's crypto libraries. For each value it also checks that the product
source still holds that literal.

Inputs: product source files (read only), `node_modules/@scure/bip39/wordlists/english.js` and
MnemoCode's vendored `bytewords-list.ts` as data tables only.

Command: `node docs/audits/AUD-023-harnesses/selftests-independent-vectors.mjs`

Expected: `55/55 checks passed.` at the reviewed snapshot; `52/52 checks passed.` since the
remediation, which moved each coin's literals into that coin's own module (fewer files to look in)
and replaced the SSKR fixture with the grouped BCR-2020-011 vector, restored here per group. Exit 0.
With `MUTATE=1` one expected value changes and the script prints one FAIL and exits 1.

## selftests-mutations.test.ts (with selftests-vitest.config.mjs)

What it checks: every new known-answer check passes as shipped and throws once one production
answer is changed through `vi.mock` (the real implementation is wrapped; nothing is edited);
the Deriver's worker runtime answers a failing feature check with `ok: false` and runs the full
checks only on `full: true`; the startup suite fails on a constant randomness source and still
releases its worker; the limits of `checkSecureRandom`; the Inspector's BIP-322 check cannot
catch a verifier that accepts every message.

Command: `pnpm exec vitest run --config docs/audits/AUD-023-harnesses/selftests-vitest.config.mjs`

Expected: `22 passed (22)`, exit 0. (The "limits" cases pass when the limit exists.) Since the
remediation the file calls the per-coin signing and BIP38 checks with the functions a build
composes, expects the SSKR check's new name, and expects `checkSecureRandom` to refuse a source
that fills only the first byte, a limit the remediation closed.

## selftests-browser.mjs

What it checks: in Chromium, with every non-file request aborted and counted: startup and full
self-tests of the built artifacts, double clicks, a startup failure (constant randomness through
an init script; a wrong BIP85 answer in a copy of the artifact), a full self-test that fails part
way (a wrong BIP38 answer), the Inspector's startup failure and partial full failure, the
Viewer's guard and EIP-55 failures, the Dash Community Deriver and Inspector, and the Scanner's
startup checks. Copies with one changed literal and a recomputed CSP script hash go to
`docs/audits/AUD-023-evidence/scratch/selftests/`.

Inputs: `dist/multi-chain-edition/` and `dist/dash-community-edition/` (read only).

Command: `flock docs/audits/AUD-023-evidence/heavy.lock node docs/audits/AUD-023-harnesses/selftests-browser.mjs`

Expected on the reviewed snapshot: exit 1 with four FAILs: the Deriver's full self-test (known
MnemoCode candidate-encryption gap), BIP85 and Silent Payments still deriving after a failed
startup, and the Scanner's missing public-input guard check. Exit 0 once those are fixed. Since
the remediation a failed full self-test closes the page's cryptographic controls, its own button
included, so the file reads the run's end from the status line and expects the badge to read
failed and generation to be closed (informational lines at the reviewed snapshot).

## selftests-composition.mjs

What it checks: thirteen selective builds (`--profile multi-chain` with `--coins`, `--features`
or `--exclude`) written to `docs/audits/AUD-023-evidence/builds/selftests/`,
then the presence or absence of each self-test's name and vector text; and the Dash Community
artifacts in `dist/` for the new self-tests' Bitcoin/Ethereum text.

Command: `flock docs/audits/AUD-023-evidence/heavy.lock node docs/audits/AUD-023-harnesses/selftests-composition.mjs`
(`SKIP_BUILD=1` rechecks the artifacts of an earlier run.)

Expected on the reviewed snapshot: exit 1 with three FAILs: the Bitcoin-only Deriver carries the
Dash compact-signature and Dash BIP38 vectors, and the Bitcoin-only Viewer has no public-input
guard check.

## selftests-heavy-gate.mjs

What it checks: whether the Deriver's full self-test respects Recover & Back Up's one-heavy-job
gate, both ways (full self-test first, then a heavy job, and the reverse).

Command: `flock docs/audits/AUD-023-evidence/heavy.lock node docs/audits/AUD-023-harnesses/selftests-heavy-gate.mjs`

Expected on the reviewed snapshot: exit 1 with three FAILs (the gate does not know the full
self-test). Exit 0 once it does.

## selftests-scanner-gate.mjs

What it checks: after a failed Scanner startup self-test (an init script damages the pinned
candidate list's bytes as `atob` decodes them), whether the candidate-list controls are closed.

Command: `flock docs/audits/AUD-023-evidence/heavy.lock node docs/audits/AUD-023-harnesses/selftests-scanner-gate.mjs`

Expected on the reviewed snapshot: exit 1: scanning is disabled, but "Show the Scanner key",
the file input and "Open list" stay enabled and a key is created. Since the remediation every
control is closed, the script no longer clicks a closed button, and it prints
`PASS list controls stay closed` with exit 0.

## selftests-firefox.mjs

What it checks: the startup self-tests of the four Multi-Chain tools and the Dash Community
Scanner in Firefox, their durations, the Inspector's full self-test, and that nothing is sent.

Command: `flock docs/audits/AUD-023-evidence/heavy.lock node docs/audits/AUD-023-harnesses/selftests-firefox.mjs`

Expected: `11/11 expectations held.`, exit 0. Since the remediation the Deriver names its signing
checks per coin ("Bitcoin compact message signature"), which the pattern accepts as well; the
browser script (`selftests-browser.mjs`) accepts the per-coin names and the BIP38 check's new label
the same way.
