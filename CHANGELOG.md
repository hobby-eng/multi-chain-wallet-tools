# Changelog

## Unreleased

### Security and dependencies

- Updated the JavaScript toolchain to Node.js 26.10.0 and Vitest 5.0.2. The canonical container, browser CI jobs, release workflow, vector workflow and lockfile now use the same reviewed toolchain.

- **CKD Shamir: replaced `sharks 0.5.0` with `blahaj 0.6.0`.** The implementation change was committed on 2026-09-23 in [`1108c8a`](https://github.com/hobby-eng/multi-chain-wallet-tools/commit/1108c8a6b0b85fb7033d4a28c82ca28d72da2e53). It fixes the biased polynomial coefficient sampling described in [RUSTSEC-2024-0398](https://rustsec.org/advisories/RUSTSEC-2024-0398.html): coefficients must include zero, using the full range 0–255. The advisory identifies `blahaj` as the corrected fork of `sharks`.
- The replacement applies to **CKD Shamir Raw and Words in both Deriver editions**. Existing CKD share serialization and recovery remain compatible; new shares use the corrected sampling. Reopening an old share does not change how it was originally generated. SSKR, SLIP-39 and Codex32 are separate implementations and were not replaced by this change.
- Corrected the CKD Shamir help link and Deriver documentation, and added `blahaj 0.6.0 — MIT` to the release passport when CKD Shamir is included. The Cargo dependency key and upstream type remain named `sharks` / `Sharks`; Cargo explicitly resolves that key to the `blahaj` package, not the old `sharks` crate.

These entries describe changes after v0.1.5, not an already published release. Carry them into the next release notes for both editions; see [the release draft](docs/releases/unreleased.md) and [the release procedure](RELEASING.md).

## Published releases

Historical release notes are retained under [docs/releases](docs/releases/). Do not rewrite them to imply that a later dependency replacement was present in an earlier release.
