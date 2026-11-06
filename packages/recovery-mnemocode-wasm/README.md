# MnemoCode WebAssembly

MnemoCode's own WebAssembly, vendored byte for byte from its canonical WASM archive: one file for each page (`generated/<edition>/<page>/`), each with its wasm-bindgen glue, its types and `modules.json`. `source.json` records the MnemoCode commit and version, the archive's SHA-256 and the SHA-256 of every file here; `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE` and `THIRD_PARTY_NOTICES.md` are MnemoCode's and ship with every release.

Nothing here is edited by hand. `pnpm sync:mnemocode` writes it and `pnpm verify:mnemocode` checks it; [MnemoCode source](../../docs/MNEMOCODE_SOURCE.md) describes the profiles, what the pages add and how to update.
