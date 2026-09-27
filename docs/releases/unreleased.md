# Next release notes — draft

No new version or release date has been assigned. Include the following security notice in the next Multi-Chain and Dash Community release notes before publishing either edition.

## MnemoCode module

Added MnemoCode 0.1.0 to the Deriver's offline **Recover & Back Up** workspace. The optional `mnemocode` build feature supports Encode and Decode for Direct, checksum-valid Seedshift, exact legacy Seedshift, and legacy valid-final-word recovery across all five MnemoCode representations and every standard BIP39 word count. Decode also includes bounded word recovery: one `?` placeholder returns every checksum-valid replacement with its BIP39 word number and exact checksum bits. A separate exact-legacy option accepts the complete old shifted phrase even when its checksum is invalid, enumerates every checksum-valid final-word replacement, and marks the one that preserves the old word's entropy-bearing bits. Color Unicode now uses visible four-digit code-point text while retaining support for earlier literal Private Use symbols. MNC1 records download as reveal-gated local text files instead of duplicating the raw payload on screen. The module reuses existing BIP39, QR, and download support; no npm package, Rust crate, storage API, or network behavior was added.

## JavaScript toolchain

Updated the supported and reproducible JavaScript toolchain to Node.js 26.10.0 and Vitest 5.0.2. CI, the canonical container and the lockfile use the same versions.

## CKD Shamir dependency replacement

Replaced **`sharks 0.5.0` with `blahaj 0.6.0`** in CKD Shamir Raw and Words. This fixes biased random polynomial coefficients ([RUSTSEC-2024-0398](https://rustsec.org/advisories/RUSTSEC-2024-0398.html)), which could leak information when the same secret was repeatedly split into fresh share sets. The corrected implementation samples coefficients from the full 0–255 range, including zero.

Existing CKD shares remain recoverable without format conversion. The fix changes creation of new shares; it does not retroactively change existing shares. SSKR, SLIP-39 and Codex32 are unaffected by this library replacement. Both Deriver editions use the same corrected CKD module.

The replacement was implemented on 2026-09-23 in commit [`1108c8a`](https://github.com/hobby-eng/multi-chain-wallet-tools/commit/1108c8a6b0b85fb7033d4a28c82ca28d72da2e53), after v0.1.5. Its documentation follow-up makes the replacement explicit in the changelog, CKD help, attribution and release passport. See [CHANGELOG.md](../../CHANGELOG.md).
