# SSKR bridge

MnemoCode's SSKR engine is the Rust source in `rust/src/` (`lib.rs`,
`share_text.rs`, `refusal.rs`). `Dockerfile.sskr` (`pnpm build:sskr`) builds it into the
JavaScript/WASM adapter in `generated/`. The bridge was written for
multi-chain-wallet-tools and taken from its revision `a0dad9e`; it is kept and
built here now. Bridge package: `recovery-sskr-wasm` 0.1.9. The bridge is
licensed under MIT or Apache-2.0 at your option, as MnemoCode and its
`rust/Cargo.toml`: [LICENSE-MIT](LICENSE-MIT), [LICENSE-APACHE](LICENSE-APACHE). File hashes are in
`integrity.json`.

Since 0.1.9 the bridge writes and reads the text of a share itself, in buffers
that it wipes, and overwrites the stack that the SSKR library worked on once a
call returns, so that no copy of a secret or of a share stays in the engine's
memory: neither the vendored libraries nor bc-ur and dcbor are changed for it.
`test/sskr-engine-memory.test.ts` searches the memory of the built engine.

Core libraries: Blockchain Commons `sskr` 0.12.0, `bc-shamir` 0.13.0,
`bc-rand` 0.5.0, `bc-ur` 0.19.2 and `bc-tags` 0.12.0, with `dcbor` 0.25.2, which
bc-ur and bc-tags bring in; the bridge itself no longer uses it
(BSD-2-Clause-Patent). Exact transitive versions are pinned in `rust/Cargo.lock`;
[dependency notices](UPSTREAM_NOTICES.md) cover that lockfile alone.
Bytewords uses the Blockchain Commons BCR-2020-012 word list, matching the list
embedded in the pinned transport implementation.

This is the Rust implementation, not the separately audited C implementation.
Upstream describes the Rust library as Community Review.

The runtime source of sskr 0.12.0 is retained under
[rust/vendor/sskr-0.12.0](rust/vendor/sskr-0.12.0/UPSTREAM.json), with its original
BSD-2-Clause-Patent license. The local patch adds secret-owner cleanup and
redacted Debug output, and wraps direct Shamir result buffers in zeroizing
owners. It preserves the pinned algorithms and wire formats. The provenance
record identifies the registry archive and each original source file.

The pinned [bc-shamir 0.13.0 runtime source](rust/vendor/bc-shamir-0.13.0/UPSTREAM.json)
also owns reconstructed entropy until its digest is checked, so failed
authentication retires that buffer. The SSKR decoder refuses a group index
outside the declared group count. Valid share encodings and recovered values
keep their meaning. Both retained dependencies include their original licenses.
