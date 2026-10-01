# MHFE browser package

This directory holds the browser package of the MHFE 0.4.0 release (suite
`MHFE-BIP39-256-EXPERIMENTAL-3`) from [`hobby-eng/mhfe`](https://github.com/hobby-eng/mhfe),
unchanged: the files of `mhfe-v0.4.0-browser.tar.gz` from the
[v0.4.0 release](https://github.com/hobby-eng/mhfe/releases/tag/v0.4.0), checked against its
`SHA256SUMS` and built from tag `v0.4.0`
([`df70ca5`](https://github.com/hobby-eng/mhfe/commit/df70ca5411b84858058bc016385cf4b0001bd570)),
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

- `generated/client.js`: `9586fb55165731c08fc92595e3e048c6fd8f4d1a0ecf51725062b68b549aec56`
- `generated/client.d.ts`: `ec8df6e43eff62987f2c893960175296165e85cf84636efb5df2cab6aaff4a6c`
- `generated/mhfe-worker.js`: `f2525c0533fe0f8594af4452b92e1e3e1fc54069a8c302bad931d369dcac2a9b`
- `generated/mhfe_core_bg.wasm`: `9e3997bc9cd432d91ea90fc628b6591724c1814f0cc1b8f8844891c647d453ec`
- `generated/argon2-mt.js`: `f98906c851a986df514d22536bb48a09724a0fa0b49079860b9a0ef00806f521`
- `generated/argon2-st.js`: `63ece7b314daf8a06ebadb0ff7acdf8be886ddfc9660b5ad13577536c4a3f6da`

MHFE is MIT licensed (`LICENSE-MHFE`). The Argon2 builds contain the reference C implementation of
Argon2, used under Apache-2.0 (`LICENSE-ARGON2`).
The package's own notices come with it unchanged, under their own names, in `notices/`:
`THIRD_PARTY_LICENSES.md` holds the licence of every Rust crate compiled into the MHFE core, and
`THIRD_PARTY_NOTICES.md` the Emscripten runtime, musl and the wasm-bindgen JavaScript glue in the
worker and the Argon2 builds.
