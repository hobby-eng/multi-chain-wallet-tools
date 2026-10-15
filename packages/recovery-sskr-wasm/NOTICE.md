# SSKR bridge

MnemoCode's SSKR engine is the Rust source in `rust/src/lib.rs`. `Dockerfile.sskr`
(`pnpm build:sskr`) builds it into the JavaScript/WASM adapter in `generated/`.
The bridge was written for multi-chain-wallet-tools and taken from its revision
`a0dad9e`; it is kept and built here now. Bridge package: `recovery-sskr-wasm`
0.1.7. The retained bridge copyright and MIT terms are in [LICENSE](LICENSE).
File hashes are in `integrity.json`.

Core libraries: Blockchain Commons `sskr` 0.12.0, `bc-shamir` 0.13.0,
`bc-rand` 0.5.0, `bc-ur` 0.19.2, `bc-tags` 0.12.0 and `dcbor` 0.25.2
(BSD-2-Clause-Patent). Exact transitive versions are pinned in `rust/Cargo.lock`;
[dependency notices](UPSTREAM_NOTICES.md) cover that lockfile alone.
Bytewords uses the Blockchain Commons BCR-2020-012 word list, matching the list
embedded in the pinned transport implementation.

This is the Rust implementation, not the separately audited C implementation.
Upstream describes the Rust library as Community Review.
