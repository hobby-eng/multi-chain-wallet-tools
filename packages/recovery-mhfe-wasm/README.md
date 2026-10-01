# MHFE browser package

This directory holds the browser package of the MHFE 0.4.0 release (suite
`MHFE-BIP39-256-EXPERIMENTAL-3`) from [`hobby-eng/mhfe`](https://github.com/hobby-eng/mhfe),
unchanged: the files of `mhfe-v0.4.0-browser.tar.gz` from the
[v0.4.0 release](https://github.com/hobby-eng/mhfe/releases/tag/v0.4.0), checked against its
`SHA256SUMS` and built from tag `v0.4.0`
([`70dddd0`](https://github.com/hobby-eng/mhfe/commit/70dddd069b3e3bb6553a3a41c42713d1e09f2d87)),
which is recorded in `tooling/verify-dependency-provenance.mjs`.

The Key Derivation Tool embeds the worker and both Argon2 builds as text and the core as bytes, and
runs every operation in a disposable Worker through `client.js`. Only the six files below are
vendored: the package's Python fast-mode launcher `mhfe-fast-mode.py` is left out, because the
executable Key Derivation Tool (`apps/key-derivation/launcher`) replaces it.

| File                           | What it is                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `client.js`, `client.d.ts`     | The page-side client and its types                                                        |
| `mhfe-worker.js`               | The worker: the Rust core's glue, the Argon2 bridge and the worker logic                  |
| `mhfe_core_bg.wasm`            | The Rust core: all MHFE logic except Argon2                                               |
| `argon2-mt.js`, `argon2-st.js` | The reference Argon2 C code compiled with Emscripten 6.0.10, threaded and single-threaded |

SHA-256 of the vendored files:

- `generated/client.js`: `4758cb17b1a2ba50255e2254bdc9209ee24779e5150a236e5bfadeb872480494`
- `generated/client.d.ts`: `385a4cc0bebdcd18ffb295151da99618aa05c439fa8bb7afda97b7c5f41778b6`
- `generated/mhfe-worker.js`: `f6bbf93e71df765723493b4d94c27afb181ebd91fded2844e0df71252137f5db`
- `generated/mhfe_core_bg.wasm`: `1a0899e69de6f1a1059970675197a8700dd2e9014bf4a63e3ebce472f397a438`
- `generated/argon2-mt.js`: `f98906c851a986df514d22536bb48a09724a0fa0b49079860b9a0ef00806f521`
- `generated/argon2-st.js`: `63ece7b314daf8a06ebadb0ff7acdf8be886ddfc9660b5ad13577536c4a3f6da`

MHFE is MIT licensed (`LICENSE-MHFE`). The Argon2 builds contain the reference C implementation of
Argon2, used under Apache-2.0 (`LICENSE-ARGON2`).
The package's own notices come with it unchanged in `notices/THIRD_PARTY_NOTICES.md`: the
Emscripten runtime, musl and the wasm-bindgen JavaScript glue in the worker and the Argon2 builds,
then the licence of every Rust crate compiled into the MHFE core.
