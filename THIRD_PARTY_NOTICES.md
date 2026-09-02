# Dependency and third-party license report

Verified 2026-09-02 from exact package manifests, `pnpm-lock.yaml`, `Cargo.lock`, and locked Cargo metadata. This is dependency provenance information, not legal advice. The upstream license files remain authoritative.

Original project code is licensed under the repository's [MIT License](LICENSE), copyright (c) 2026 hobby-eng. The tables below describe separately licensed third-party components and do not transfer their authorship or trademarks to this project.

## JavaScript production dependencies

| Package | Exact version | Source repository | License | Purpose |
| --- | --- | --- | --- | --- |
| `@noble/curves` | 2.4.0 | `paulmillr/noble-curves` | MIT | secp256k1, BIP340/Schnorr utilities |
| `@noble/hashes` | 2.4.0 | `paulmillr/noble-hashes` | MIT | SHA-2, RIPEMD160, Keccak, byte utilities |
| `@scure/base` | 2.4.0 | `paulmillr/scure-base` | MIT | Base58Check, Bech32, Bech32m |
| `@scure/bip32` | 2.4.0 | `paulmillr/scure-bip32` | MIT | BIP32 HD key derivation/serialization |
| `@scure/bip39` | 2.4.0 | `paulmillr/scure-bip39` | MIT | BIP39 validation, PBKDF2 seed, English list |
| `@dashevo/evo-sdk` | 4.1.0 | `dashpay/platform` (`packages/js-evo-sdk`) | MIT | Connected Viewer/Recovery facades and trusted DAPI queries |
| `@dashevo/wasm-sdk` | 4.1.0 | `dashpay/platform` (`packages/wasm-sdk`) | MIT | Embedded proof-verifying DAPI transport for connected artifacts |

The two Dash SDK packages are bundled into `Wallet_Activity_Viewer.html` and the scan-only `Wallet_Discovery_Scanner.html`, never into the Wallet Key Derivation Tool. Their pnpm integrity pins are `sha512-31sSjLXc8XEm4/PCEUXRGBJvSDwearx1RHFza44zpB1e+TKD74M3RRhbO0X1WSdP4vNQxVuzYZV2LfwEgzyQzg==` and `sha512-4Odbmug9s3ABz+BNUi5Le2Q4csuhXdmGksqep6ev6MXIXqWm7vLGV5PZ9YJo9I9IHodKiVibPNujIoNv06NMBw==`. Copyright notices embedded by Noble/Scure identify Paul Miller and, for Scure BIP32/BIP39, Patricio Palladino. esbuild preserves inline legal comments in the standalone JavaScript.

The Wallet Activity Viewer and Wallet Discovery Scanner headers embed the official “Dash D Circle” SVG from the [Dash Brand Guidelines](https://www.dash.org/brand-guidelines/), licensed CC BY 4.0. Use of the mark identifies the Dash network currently addressed by those tools and does not imply endorsement.

## External runtime services (not bundled dependencies)

The connected Wallet Activity Viewer calls DashScan (`pshenmic/dashscan`, API package MIT) for Dash Core L1 history and Dash Platform Explorer (`pshenmic/platform-explorer`, API package MIT) for Platform address history. The Wallet Discovery Scanner calls DashScan for batched Core address state and Dash Platform DAPI through Evo SDK for proof-verified Platform address, identity, and encrypted-note state. No code from either external server repository is copied or bundled into the artifacts; only typed client adapters for public responses are original project code. Service availability, indexing, privacy, and trust limitations are documented in README and SECURITY_AUDIT.

## Rust/WASM direct and official git dependencies

| Package | Exact version/revision | Source repository | License | Purpose |
| --- | --- | --- | --- | --- |
| `orchard` | 0.14.0, tag `dashified-0.14.1`, commit `38ac9c19a2df7bf3eeadc22ab23053e8fd538828` | `dashpay/orchard` | MIT OR Apache-2.0 | Official Dash Orchard/ZIP32 key and address logic |
| `zcash_note_encryption` | 0.4.1, revision `9f7e93d42cef839d02b9d75918117941d453f8cb` | `dashpay/zcash_note_encryption` | MIT OR Apache-2.0 | Locked Orchard transitive dependency |
| `wasm-bindgen` | 0.2.100 | `rustwasm/wasm-bindgen` / crates.io | MIT OR Apache-2.0 | Browser WASM ABI |
| `zip32` | 0.2.0 | `zcash/librustzcash` / crates.io | MIT OR Apache-2.0 | ZIP32 account identifier/types |
| `hex` | 0.4.3 | `KokaKiwi/rust-hex` / crates.io | MIT OR Apache-2.0 | Raw boundary serialization |
| `bech32` (test only) | 0.11.0 | `rust-bitcoin/rust-bech32` / crates.io | MIT | Independent Rust display-vector encoding |
| `rand_core` (test only) | 0.6.4 | `rust-random/rand_core` / crates.io | MIT OR Apache-2.0 | Real encrypted-note scanner round-trip fixture |

The Orchard MIT notice identifies The Electric Coin Company (2020–2025) and Zcash Open Development Lab (2026). wasm-bindgen's MIT notice identifies Alex Crichton (2014). Their upstream distributions also contain Apache-2.0 texts where dual licensed.

## JavaScript build and independent-test dependencies

These packages are not imported by production source except esbuild/TypeScript during the build.

| Package | Exact version | Source repository | License | Use |
| --- | --- | --- | --- | --- |
| `@dashincubator/secp256k1` | 1.7.1-5 | `dashhive/secp256k1` | MIT | Dash verification dependency |
| `dashhd` | 3.3.3 | `dashhive/dashhd.js` | MIT | Independent Dash Core cross-check |
| `dashkeys` | 1.1.3 | `dashhive/dashkeys.js` | MIT | DashHD test closure |
| `ethers` | 6.17.0 | `ethers-io/ethers.js` | MIT | Independent Ethereum cross-check |
| `esbuild` | 0.28.2 | `evanw/esbuild` | MIT | Browser bundle and CSS minification |
| `typescript` | 7.0.2 | `microsoft/TypeScript` | Apache-2.0 | Static type checking |
| `vitest` | 4.1.11 | `vitest-dev/vitest` | MIT | JS/TS tests |

## Complete locked Rust metadata closure

The following is the complete Cargo metadata package set. Registry packages come from crates.io; the two non-registry git sources are pinned above. Duplicate names represent simultaneously locked major versions.

### MIT OR Apache-2.0 family

```text
aead 0.5.2                      aes 0.8.4
arrayvec 0.7.8                  atomic-polyfill 1.0.3
autocfg 1.5.1                   base16ct 0.2.0
bls12_381 0.8.0                 bumpalo 3.20.3
cbc 0.1.2                       cfg-if 1.0.4
chacha20 0.9.1                  chacha20poly1305 0.10.1
cipher 0.4.4                    cobs 0.3.0
corez 0.1.1                     cpufeatures 0.2.17
critical-section 1.2.0          crypto-common 0.1.7
dash-shielded-wasm 1.0.0        document-features 0.2.12
either 1.18.0                   embedded-io 0.4.0
embedded-io 0.6.1               ff 0.13.1
fpe 0.6.1                       frost-core 3.0.0
frost-rerandomized 3.0.0        group 0.13.0
halo2_poseidon 0.1.0            hash32 0.2.1
heapless 0.7.17                 hex 0.4.3
incrementalmerkletree 0.8.2     inout 0.1.4
itertools 0.14.0                jubjub 0.10.0
lazy_static 1.5.0               libc 0.2.189
litrs 1.0.0                     lock_api 0.4.14
memuse 0.2.2                    num-bigint 0.4.8
num-integer 0.1.47              num-traits 0.2.19
once_cell 1.21.4                opaque-debug 0.3.1
orchard 0.14.0                  pasta_curves 0.5.2
pin-project-lite 0.2.17         poly1305 0.8.0
postcard 1.1.3                  proc-macro2 1.0.107
quote 1.0.47                    rand 0.8.8
rand_core 0.6.4                 reddsa 0.5.2
rustc_version 0.4.1             rustversion 1.0.23
scopeguard 1.2.0                semver 1.0.28
serde 1.0.229                   serde_core 1.0.229
serde_derive 1.0.229            serdect 0.2.0
sinsemilla 0.1.0               stable_deref_trait 1.2.1
static_assertions 1.1.0         syn 2.0.119
syn 3.0.4                       thiserror 2.0.20
thiserror-impl 2.0.20           typenum 1.20.1
universal-hash 0.5.1            version_check 0.9.5
wasm-bindgen 0.2.100            wasm-bindgen-backend 0.2.100
wasm-bindgen-macro 0.2.100      wasm-bindgen-macro-support 0.2.100
wasm-bindgen-shared 0.2.100     zcash_note_encryption 0.4.1
zcash_spec 0.2.1                zeroize 1.9.0
zeroize_derive 1.5.0            zip32 0.2.0
```

`bls12_381`, `ff`, `fpe`, `group`, `jubjub`, `memuse`, and `version_check` spell the dual expression as `MIT/Apache-2.0`; the others use `MIT OR Apache-2.0` or its reversed equivalent.

### MIT and other permissive licenses

```text
bech32 0.11.0                   bitvec 1.1.1                  MIT
blake2b_simd 1.0.5             const-crc32-nostd 1.3.1      MIT
derive-getters 0.5.0           funty 2.0.0                   MIT
generic-array 0.14.7           getrandom 0.2.17             MIT OR Apache-2.0
getset 0.1.7                  MIT
libm 0.2.16                    log 0.4.34                    MIT
nonempty 0.11.0                radium 0.7.0                  MIT
spin 0.9.9                     tap 1.0.1                     MIT
tracing 0.1.44                 tracing-core 0.1.36           MIT
wyz 0.5.1                                                     MIT
byteorder 1.5.0                                               Unlicense OR MIT
constant_time_eq 0.4.2                                        CC0-1.0 OR MIT-0 OR Apache-2.0
subtle 2.6.1                                                  BSD-3-Clause
unicode-ident 1.0.24                                          (MIT OR Apache-2.0) AND Unicode-3.0
visibility 0.1.1                                             Zlib OR MIT OR Apache-2.0
wasi 0.11.1+wasi-snapshot-preview1                           Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT
```

## Lock and artifact policy

- `package.json` uses exact dependency versions; pnpm's lockfile pins the npm closure and integrity hashes.
- `Cargo.toml` uses exact registry versions and one exact audited Orchard tag; `Cargo.lock` pins all transitive versions and git commits.
- The build validates Cargo 1.85.1, wasm-bindgen-cli 0.2.100, and the Orchard lock source before compiling.
- `apps/key-derivation/src/index.html` contains a human-readable embedded production-dependency notice so the standalone artifact retains provenance when copied alone.
- `apps/activity-viewer/src/index.html` separately identifies its embedded Evo SDK/Orchard versions, external DashScan/Platform Explorer data sources, and its online security boundary.
- `apps/discovery-scanner/src/index.html` identifies its embedded Evo SDK/Orchard versions, DashScan/DAPI sources, mnemonic-bearing online boundary, and independent-audit warning.
- Original project code is licensed under MIT as declared in the root `LICENSE` and `package.json`. Third-party components retain the licenses and notices listed above.
