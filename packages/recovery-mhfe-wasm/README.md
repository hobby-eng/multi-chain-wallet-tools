# MHFE browser package

This directory holds the MHFE 0.4.0 browser package (suite `MHFE-BIP39-256-EXPERIMENTAL-3`) from
[`hobby-eng/mhfe`](https://github.com/hobby-eng/mhfe), unchanged. MHFE 0.4.0 is not released yet:
the files are those of `mhfe-v0.4.0-browser.tar.gz` from the reproducible Docker build
(`scripts/build-reproducible.sh`) of commit
[`5dd7a71`](https://github.com/hobby-eng/mhfe/commit/5dd7a7168aed51bb478f031dc934d07e04078a42) of the
`suite-3-c-engine` branch, recorded in `tooling/verify-dependency-provenance.mjs`, and must be
replaced by the release build before a release of these tools.

The Key Derivation Tool embeds the worker and both Argon2 builds as text and the core as bytes, and
runs every operation in a disposable Worker through `client.js`. `mhfe-fast-mode.py` stays in the
unchanged package but is not shipped: the executable Key Derivation Tool
(`apps/key-derivation/launcher`) replaces it.

| File                           | What it is                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `client.js`, `client.d.ts`     | The page-side client and its types                                                        |
| `mhfe-worker.js`               | The worker: the Rust core's glue, the Argon2 bridge and the worker logic                  |
| `mhfe_core_bg.wasm`            | The Rust core: all MHFE logic except Argon2                                               |
| `argon2-mt.js`, `argon2-st.js` | The reference Argon2 C code compiled with Emscripten 6.0.10, threaded and single-threaded |
| `mhfe-fast-mode.py`            | MHFE's Python fast-mode launcher; vendored with the package, not shipped                  |

SHA-256 of the vendored files:

- `generated/client.js`: `9586fb55165731c08fc92595e3e048c6fd8f4d1a0ecf51725062b68b549aec56`
- `generated/client.d.ts`: `ec8df6e43eff62987f2c893960175296165e85cf84636efb5df2cab6aaff4a6c`
- `generated/mhfe-worker.js`: `0ef6562d98cd33e99df8a13955b1f970c9772420b4b0d0b96b2e3ea0b95cc2b9`
- `generated/mhfe_core_bg.wasm`: `d293c4297f3df368e0fc2e1bfa96e9c8317f6ff8411edb25140e741bda23fd02`
- `generated/argon2-mt.js`: `f98906c851a986df514d22536bb48a09724a0fa0b49079860b9a0ef00806f521`
- `generated/argon2-st.js`: `63ece7b314daf8a06ebadb0ff7acdf8be886ddfc9660b5ad13577536c4a3f6da`
- `generated/mhfe-fast-mode.py`: `fb9ba8bc863b3310cb80b37383a5ac260e2b3ae20601ffce5bfc3e0ba8906788`

MHFE is MIT licensed (`LICENSE-MHFE`). The Argon2 builds contain the reference C implementation of
Argon2, used under Apache-2.0 (`LICENSE-ARGON2`).
