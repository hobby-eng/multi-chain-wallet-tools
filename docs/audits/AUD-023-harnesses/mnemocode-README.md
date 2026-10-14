# AUD-023 harnesses: mnemocode reviewer

These scripts belong to audit AUD-023 of multi-chain-wallet-tools, reviewed at HEAD
`c5b62c2d489e7525326071128095ba95ecca92ac` plus the dirty working tree of the baseline manifest
`docs/audits/AUD-023-evidence/snapshot-baseline.json` (fingerprint `8e8649c9…`). They review the
Deriver's adoption of MnemoCode `c7a45234f4dac0935172fd0ede9d6c5d341524b2` (a local commit of
`../mnemocode`). They use public test data only (`abandon … about`, `legal winner … yellow`, the
BIP39 passphrase `TREZOR`) and edit nothing. Run every command from the repository root.

## mnemocode-vendor-compare.mjs

What it checks: every file in `MNEMOCODE_FILES` (tooling/sync-mnemocode-source.mjs) is byte-equal to
the same upstream path at the pinned commit (`git show`), and its manifest hash matches; the
manifest's commit, version and shared dependency versions equal the pinned `package.json`; the
product's own offline gate (`verifyMnemoCodeSource`) passes; which allowed package specifiers the
vendored code uses (unused entries mean a loose allowlist); constructs that the import scanner
cannot see or network/eval primitives in vendored code; and the upstream `src/` files outside
`src/cli/` that are not vendored.

Inputs: the MnemoCode checkout (default `../mnemocode`) and the pinned commit (default `c7a45234f4dac0935172fd0ede9d6c5d341524b2`).

```sh
node docs/audits/AUD-023-harnesses/mnemocode-vendor-compare.mjs [mnemocode-checkout] [commit]
```

Expected output: `byte-equal with c7a45234f4dac0935172fd0ede9d6c5d341524b2: 129/129`, `allowed but unused: none`, `PASSED`; exit
code 0. Any difference is listed under `FAILED` and the exit code is 1.

## mnemocode-coin-evidence.audit.test.ts (with mnemocode-vitest.config.mjs)

What it checks: coin-address wallet evidence through the Deriver's production path, the
recognition classes that the workers build (`mnemocode-wallet-bitcoin.ts`, `-dash.ts`,
`-fingerprint.ts` at the reviewed snapshot; since the remediation `mnemocode-wallet-coins.ts` with
the Dash edition's or no offered coins, composed in the file as the build composes them) with the
page's WebCrypto PBKDF2, and `MnemoCodeSearches.words`. Expected
addresses come from an independent derivation in the file (no MnemoCode coin module), which first
reproduces the published BIP84 vector and the BIP44/BIP49 values of the public phrase and agrees
with MnemoCode's own first-address vectors. For each of the eleven coins of "Address of another
coin": the first address matches at its path; the address at index 7 is found among 20 from index 0
and not among 7; another phrase does not match; the BIP39 passphrase is used. Bitcoin addresses of
the three single-key profiles through "Every type". Refusal messages for a wrong coin, a damaged
address and an unknown coin. The library's address-count bounds (0, -1, 1.5, 1001, 2^53, NaN,
Infinity, a string) in each edition's `assertEvidence`. The word search finds the forgotten last
word by each coin's fifth address. It also prints how many candidates a word search shows (100 of
128 at the reviewed snapshot, AUD-023-FUN001; all of them, up to MnemoCode's
`MAX_SHOWN_CANDIDATES`, since the remediation).

```sh
pnpm exec vitest run --config docs/audits/AUD-023-harnesses/mnemocode-vitest.config.mjs \
  docs/audits/AUD-023-harnesses/mnemocode-coin-evidence.audit.test.ts --silent=false --reporter=verbose
```

Expected output at the reviewed snapshot: 20 passed, 1 failed, exit code 1. The failing test,
"records what the Dash edition's assertEvidence does with a bad count", reproduces a candidate
finding: the Dash edition's `assertEvidence` accepts every bad count and the search then fails at
its first candidate. After the remediation, whose expectations the file now holds (all candidates
shown, a coin the build does not offer refused by name): 21 passed, exit code 0.

## mnemocode-browser.mjs

What it checks, in Chromium, on the built pages in `dist/` (read-only), with every HTTP(S) request
aborted and counted: `late-card-qr` (a card export that completes after the source phrase changed
must not put the old phrase's QR images back), `late-card-qr-shares` (the same when a new split
replaces the shares meanwhile), `clear-linked` (observation only: what Generate & Derive's Clear
leaves in the MnemoCode panel when its phrase was linked there), `handover-replace` (a share handed
from Decode to Restore must keep the shares already typed there), `decode-dates` (what Decode says
for a date with ?), `word-shown` (a one-word search should show all 128 candidates, as MnemoCode's
recover-word does), `count-bounds` (the page's refusals of address counts), `dash-edition` (the
Dash Community edition offers only the fingerprint, a Dash address and "It cannot"), and `layout`
(the panels with the new fields at 1280 and 390 pixels: no horizontal overflow, every visible
control inside the viewport, screenshots).

Inputs: `dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html` and
`dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html` from the
coordinator's build; the pinned Playwright Chromium. Heavy: run it under the audit lock.

```sh
flock docs/audits/AUD-023-evidence/heavy.lock \
  node docs/audits/AUD-023-harnesses/mnemocode-browser.mjs [probe,...]
```

Output: one line per probe, `docs/audits/AUD-023-evidence/mnemocode-browser-report.json` and
`mnemocode-layout-*.png` (local evidence). Expected at the reviewed snapshot: `late-card-qr`,
`late-card-qr-shares`, `handover-replace` and `word-shown` fail (candidate findings), the others
pass; exit code 1. After fixes every probe passes and the exit code is 0. Adapted after the
remediation: a card export that finishes after its inputs changed now saves nothing and says so
(AUD-023-SEC002), so the two late-card probes wait for either a download or that status and expect
no QR image after it; the max-results field now shows only for a date search (AUD-023-FUN001), so
the layout probe chooses that search first.
