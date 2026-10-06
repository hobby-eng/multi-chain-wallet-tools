# MHFE browser package

This directory holds the browser package of the MHFE 0.5.0 release (suites
`MHFE-BIP39-256-EXPERIMENTAL-3` for 24-word containers and `MHFE-BIP39-LP-EXPERIMENTAL-4` for
containers as long as a 12- to 21-word phrase) from
[`hobby-eng/mhfe`](https://github.com/hobby-eng/mhfe), unchanged: the files of
`mhfe-v0.5.0-browser.tar.gz` (SHA-256
`3c81eab477dd491fb78ed13103d8a7c1cee9e74e9dbdb6abfcb5dd1e1b360460`) from the
[v0.5.0 release](https://github.com/hobby-eng/mhfe/releases/tag/v0.5.0), checked against its
OpenPGP-signed `SHA256SUMS` and built from tag `v0.5.0`
([`52b6b36`](https://github.com/hobby-eng/mhfe/commit/52b6b36a16d36fa895f3b3e9e034b52c9f963c34)),
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

- `generated/client.js`: `057ce242fbbd94e94df833f1cfc7a3b742c98086095a869c34977307dc209cee`
- `generated/client.d.ts`: `8692d3d6777215feac9a9d84094b88122aee60fa7d6c5a235c096efe86db2653`
- `generated/mhfe-worker.js`: `f6d0b120bfbafb83ddbc20d121b9fcb87c581d89ae55c5d87db2893bf5c2c5d9`
- `generated/mhfe_core_bg.wasm`: `a8afbcb8b0800396daeb099d23897f9000987a49e71110ee66808412b363e9f7`
- `generated/argon2-mt.js`: `f98906c851a986df514d22536bb48a09724a0fa0b49079860b9a0ef00806f521`
- `generated/argon2-st.js`: `63ece7b314daf8a06ebadb0ff7acdf8be886ddfc9660b5ad13577536c4a3f6da`

MHFE is MIT licensed (`LICENSE-MHFE`). The Argon2 builds contain the reference C implementation of
Argon2, used under Apache-2.0 (`LICENSE-ARGON2`).
The package's own notices come with it unchanged in `notices/THIRD_PARTY_NOTICES.md`: the
Emscripten runtime, musl and the wasm-bindgen JavaScript glue in the worker and the Argon2 builds,
then the licence of every Rust crate compiled into the MHFE core.
