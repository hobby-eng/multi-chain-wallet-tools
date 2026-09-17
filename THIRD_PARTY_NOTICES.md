# Dependency and third-party license report

Initial provenance review: 2026-09-08, using exact package manifests, `pnpm-lock.yaml`, `Cargo.lock`, and locked Cargo metadata. Direct JavaScript versions were reconciled with the current manifest again on 2026-09-12; this does not renew the upstream source or license review. This is dependency provenance information, not legal advice. The upstream license files remain authoritative.

Original project code is licensed under the repository's [MIT License](LICENSE), copyright (c) 2026 hobby-eng. The tables below describe separately licensed third-party components and do not transfer their authorship or trademarks to this project.

## JavaScript production dependencies

| Package                    | Exact version | Source repository                            | License           | Purpose                                                                                                                           |
| -------------------------- | ------------- | -------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `@bitcoinerlab/miniscript` | 2.0.0         | `bitcoinerlab/miniscript`                    | MIT               | Local Bitcoin Miniscript parsing, safety analysis, and Script ASM compilation                                                     |
| `bip68`                    | 1.0.4         | `bitcoinjs/bip68`                            | ISC               | Relative-locktime handling used by the Miniscript analyzer                                                                        |
| `@scure/btc-signer`        | 2.4.1         | `paulmillr/scure-btc-signer`                 | MIT               | Local BIP-327 MuSig2 key aggregation, BIP-328 derivation, Taproot output construction, and BIP-373 field definitions              |
| `btcutil-js`               | 0.4.1         | `guggero/btcutil-js`                         | MIT               | Offline BIP-322 legacy/simple/full/proof-of-funds verification using a btcd-derived Bitcoin Script engine compiled to WebAssembly |
| `micro-packed`             | 0.11.1        | `paulmillr/micro-packed`                     | MIT               | Binary codecs used by Scure BTC Signer                                                                                            |
| `@noble/curves`            | 2.4.0         | `paulmillr/noble-curves`                     | MIT               | secp256k1, BIP340/Schnorr utilities                                                                                               |
| `@noble/ciphers`           | 2.4.0         | `paulmillr/noble-ciphers`                    | MIT               | AES-256-ECB primitive used only for BIP38 compatibility; padding is disabled as required by BIP38                                 |
| `@noble/hashes`            | 2.4.0         | `paulmillr/noble-hashes`                     | MIT               | SHA-2, RIPEMD160, Keccak, byte utilities                                                                                          |
| `@scure/base`              | 2.4.0         | `paulmillr/scure-base`                       | MIT               | Base58Check, Bech32, Bech32m                                                                                                      |
| `@scure/bip32`             | 2.4.0         | `paulmillr/scure-bip32`                      | MIT               | BIP32 HD key derivation/serialization                                                                                             |
| `@scure/bip39`             | 2.4.0         | `paulmillr/scure-bip39`                      | MIT               | BIP39 validation, PBKDF2 seed, English list                                                                                       |
| `@dashevo/evo-sdk`         | 4.1.1         | `dashpay/platform` (`packages/js-evo-sdk`)   | MIT               | Connected Viewer/Recovery facades and trusted DAPI queries                                                                        |
| `@dashevo/wasm-sdk`        | 4.1.1         | `dashpay/platform` (`packages/wasm-sdk`)     | MIT               | Embedded proof-verifying DAPI transport for connected artifacts                                                                   |
| `write-excel-file`         | 4.1.1         | `gitlab.com/catamphetamine/write-excel-file` | MIT               | Local XLSX workbook generation for Activity Viewer exports                                                                        |
| `fflate`                   | 0.8.3         | `101arrowz/fflate`                           | MIT               | ZIP container generation for local XLSX exports                                                                                   |
| `uqr`                      | 0.1.3         | `unjs/uqr`                                   | MIT               | Offline QR matrix encoding for public payment addresses                                                                           |
| `qr`                       | 0.7.0         | `paulmillr/qr`                               | MIT OR Apache-2.0 | Offline QR image decoding for SeedQR and recovery-share imports                                                                   |

The two Dash SDK packages are bundled into both editions of the Wallet Activity Viewer and scan-only Wallet Discovery Scanner, never into either Wallet Key Derivation Tool. Their pnpm integrity pins are `sha512-DsfHXlLByyhvAerDknozg0HT4KHNsYP6rEy949aj/KGLLydb9bwJBHOWyn5oDsNR016tvr3oeT/jCkjMA4qoCA==` and `sha512-/be0D7qohZc9fHgYjbtzOg8KOajarzo0NtKCNybv4Z1xeV617Wo0CusnsxCzwbV7C/jDgPJiGel0KtcSTzQcfQ==`. Copyright notices embedded by Noble/Scure identify Paul Miller and, for Scure BIP32/BIP39, Patricio Palladino. esbuild preserves inline legal comments in the standalone JavaScript.

The MIT provenance for `@dashevo/evo-sdk` and `@dashevo/wasm-sdk` is based explicitly on `dashpay/platform` v4.1.1 at commit `69b85c81af8e000e8506edaa13406d1f6274af5a` and that repository's root `LICENSE.md`. The published npm package manifests and tarballs omit license metadata, so the upstream tagged source is the authoritative license reference for these two packages.

All four Dash Community Edition headers embed the official “Dash D Circle” SVG from the [Dash Brand Guidelines](https://www.dash.org/brand-guidelines/), licensed CC BY 4.0. Their color and geometric treatment is based on the official [Dash BrandBook](https://www.figma.com/design/cCpB1W2IAmoEGXBbGqGsfD/Dash-BrandBook?node-id=219-108&p=f) and the palette recorded in the primary [Dash documentation](https://docs.dash.org/en/stable/docs/user/marketing.html). Multi-Chain Edition headers do not display the Dash-only mark. Use of the mark and palette identifies the Dash-only Community Edition and does not imply endorsement.

## External runtime services (not bundled dependencies)

The connected Multi-Chain applications use Blockchain.com, BlockCypher, Blockstream.info, and Mempool.space for Bitcoin public-address state or confirmed history; PublicNode for Ethereum JSON-RPC state; and Blockscout for confirmed native-ETH and internal-transfer history. Dash queries use DashScan (`pshenmic/dashscan`, API package MIT) for Core L1 state/history, Dash Platform Explorer (`pshenmic/platform-explorer`, API package MIT) for Platform address and Identity history, and Dash Platform DAPI through Evo SDK for proof-verified Platform address, Identity, and encrypted-note state. No external service implementation is copied or bundled into the artifacts; only typed clients and response validators are project code. Service availability, indexing, privacy, and trust limitations are documented in README and SECURITY_AUDIT.

## Rust/WASM direct and official git dependencies

| Package                 | Exact version/revision                                                            | Source repository                      | License             | Purpose                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `orchard`               | 0.14.0, tag `dashified-0.14.1`, commit `38ac9c19a2df7bf3eeadc22ab23053e8fd538828` | `dashpay/orchard`                      | MIT OR Apache-2.0   | Official Dash Orchard/ZIP32 key and address logic                                                                 |
| `zcash_note_encryption` | 0.4.1, revision `9f7e93d42cef839d02b9d75918117941d453f8cb`                        | `dashpay/zcash_note_encryption`        | MIT OR Apache-2.0   | Locked Orchard transitive dependency                                                                              |
| `wasm-bindgen`          | 0.2.128                                                                           | `rustwasm/wasm-bindgen` / crates.io    | MIT OR Apache-2.0   | Browser WASM ABI                                                                                                  |
| `sharks`                | 0.5.0                                                                             | `c0dearm/sharks` / crates.io           | MIT OR Apache-2.0   | GF(256) Shamir Secret Sharing used by the CKD Raw/Words backup formats; default ambient-RNG features are disabled |
| `codex32`               | 0.1.0                                                                             | `apoelstra/rust-codex32` / crates.io   | CC0-1.0             | BIP93 Codex32 checksum, master-seed encoding, and GF(32) share interpolation                                      |
| `sskr`                  | 0.12.0                                                                            | `BlockchainCommons/bc-sskr-rust`       | BSD-2-Clause-Patent | Standard grouped SSKR share creation and recovery with `ur:sskr` transport                                        |
| `bc-envelope`           | 0.43.0                                                                            | `BlockchainCommons/bc-envelope-rust`   | BSD-2-Clause-Patent | Gordian Seed Envelope encoding, encryption, password/recipient permits, and SSKR permits                          |
| `bc-components`         | 0.31.1                                                                            | `BlockchainCommons/bc-components-rust` | BSD-2-Clause-Patent | X25519 recipient keys, symmetric content keys, SSKR specs, and standard Blockchain Commons key derivation         |
| `rand_chacha`           | 0.3.1                                                                             | `rust-random/rand` / crates.io         | MIT OR Apache-2.0   | Deterministic expansion of the explicit 256-bit WebCrypto seed passed to the Shamir WASM boundary                 |
| `rand_core`             | 0.6.4                                                                             | `rust-random/rand` / crates.io         | MIT OR Apache-2.0   | RNG trait used without OS/browser entropy acquisition inside the Shamir WASM module                               |
| `zeroize`               | 1.8.2                                                                             | `RustCrypto/utils` / crates.io         | MIT OR Apache-2.0   | Rust recovery-boundary secret-buffer clearing                                                                     |
| `zip32`                 | 0.2.1                                                                             | `zcash/librustzcash` / crates.io       | MIT OR Apache-2.0   | ZIP32 account identifier/types                                                                                    |
| `hex`                   | 0.4.3                                                                             | `KokaKiwi/rust-hex` / crates.io        | MIT OR Apache-2.0   | Raw boundary serialization                                                                                        |
| `serde`                 | 1.0.229                                                                           | `serde-rs/serde` / crates.io           | MIT OR Apache-2.0   | Typed Rust boundary serialization                                                                                 |
| `serde_json`            | 1.0.151                                                                           | `serde-rs/json` / crates.io            | MIT OR Apache-2.0   | Escaped JSON boundary encoding and fixture parsing                                                                |
| `bech32` (test only)    | 0.12.0                                                                            | `rust-bitcoin/rust-bech32` / crates.io | MIT                 | Independent Rust display-vector encoding                                                                          |
| `rand_core` (test only) | 0.6.4                                                                             | `rust-random/rand_core` / crates.io    | MIT OR Apache-2.0   | Real encrypted-note scanner round-trip fixture                                                                    |

The TypeScript SLIP-39 implementation is a project-local port of the current MIT-licensed Trezor `python-shamir-mnemonic` reference implementation and includes its official recovery vectors and 1024-word list. The Codex32 tests use vectors published in BIP93 and the CC0 Rust reference implementation. No Python interpreter or Python package is bundled into a browser artifact or required at runtime.

The fixed scanner fixture is output from the MIT-licensed official stable `dashpay/platform` v4.1.1 wallet source at commit `69b85c81af8e000e8506edaa13406d1f6274af5a`; no upstream source code is copied into the fixture. The Orchard MIT notice identifies The Electric Coin Company (2020–2025) and Zcash Open Development Lab (2026). wasm-bindgen's MIT notice identifies Alex Crichton (2014). Their upstream distributions also contain Apache-2.0 texts where dual licensed.

## JavaScript build and independent-test dependencies

These packages are not imported by production source except esbuild/TypeScript during the build.

| Package                    | Exact version | Source repository      | License    | Use                                                           |
| -------------------------- | ------------- | ---------------------- | ---------- | ------------------------------------------------------------- |
| `@dashincubator/secp256k1` | 1.7.1-5       | `dashhive/secp256k1`   | MIT        | Dash verification dependency                                  |
| `dashhd`                   | 3.3.3         | `dashhive/dashhd.js`   | MIT        | Independent Dash Core cross-check                             |
| `dashkeys`                 | 1.1.5         | `dashhive/dashkeys.js` | MIT        | DashHD test closure                                           |
| `ethers`                   | 6.17.0        | `ethers-io/ethers.js`  | MIT        | Independent Ethereum cross-check                              |
| `esbuild`                  | 0.28.2        | `evanw/esbuild`        | MIT        | Browser bundle and CSS minification                           |
| `typescript`               | 7.0.2         | `microsoft/TypeScript` | Apache-2.0 | Static type checking                                          |
| `vitest`                   | 5.0.0         | `vitest-dev/vitest`    | MIT        | JS/TS tests                                                   |
| `playwright`               | 1.63.0        | `microsoft/playwright` | Apache-2.0 | Chromium/Firefox standalone-file and browser-regression tests |

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
dash-shielded-wasm 0.1.5
recovery-shamir-wasm 0.1.5
recovery-codex32-wasm 0.1.5
recovery-sskr-wasm 0.1.5
recovery-envelope-wasm 0.1.5
document-features 0.2.12
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
quote 1.0.47                    rand 0.8.8                     rand_chacha 0.3.1
rand_core 0.6.4                 reddsa 0.5.2
rustc_version 0.4.1             rustversion 1.0.23
scopeguard 1.2.0                semver 1.0.28
sharks 0.5.0
serde 1.0.229                   serde_core 1.0.229
serde_derive 1.0.229            serdect 0.2.0
sinsemilla 0.1.0               stable_deref_trait 1.2.1
static_assertions 1.1.0         syn 2.0.119
syn 3.0.4                       thiserror 2.0.20
thiserror-impl 2.0.20           typenum 1.20.1
universal-hash 0.5.1            version_check 0.9.5
wasm-bindgen 0.2.128            wasm-bindgen-macro 0.2.128
wasm-bindgen-macro-support 0.2.128
wasm-bindgen-shared 0.2.128     zcash_note_encryption 0.4.1
zcash_spec 0.2.1                zeroize 1.9.0
zeroize_derive 1.5.0            zip32 0.2.1
itoa 1.0.18                     serde_json 1.0.151
```

`bls12_381`, `ff`, `fpe`, `group`, `jubjub`, `memuse`, and `version_check` spell the dual expression as `MIT/Apache-2.0`; the others use `MIT OR Apache-2.0` or its reversed equivalent.

### MIT and other permissive licenses

```text
bech32 0.11.1 / 0.12.0          bitvec 1.1.1                  MIT
blake2b_simd 1.0.5             const-crc32-nostd 1.3.1      MIT
derive-getters 0.5.0           funty 2.0.0                   MIT
generic-array 0.14.7           getrandom 0.2.17             MIT OR Apache-2.0
getset 0.1.7                  MIT
libm 0.2.16                                                    MIT
nonempty 0.11.0                radium 0.7.0                  MIT
spin 0.9.9                     tap 1.0.1                     MIT
tracing 0.1.44                 tracing-core 0.1.36           MIT
wyz 0.5.1                                                     MIT
zmij 1.0.23                                                   MIT
byteorder 1.5.0                                               Unlicense OR MIT
memchr 2.8.3                                                  Unlicense OR MIT
codex32 0.1.0                                                CC0-1.0
constant_time_eq 0.4.2                                        CC0-1.0 OR MIT-0 OR Apache-2.0
subtle 2.6.1                                                  BSD-3-Clause
unicode-ident 1.0.24                                          (MIT OR Apache-2.0) AND Unicode-3.0
visibility 0.1.1                                             Zlib OR MIT OR Apache-2.0
wasi 0.11.1+wasi-snapshot-preview1                           Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT
```

### Additional Blockchain Commons WASM dependency closure

The two new WASM modules add the following exact locked package/version/license entries beyond the closure listed above. Cargo archive SHA-256 values remain authoritative in their checked-in lockfiles.

```text
adler2 2.0.1                                     0BSD OR MIT OR Apache-2.0
android_system_properties 0.1.6                  MIT OR Apache-2.0
argon2 0.5.3                                     MIT OR Apache-2.0
base64ct 1.8.3                                   Apache-2.0 OR MIT
bc-components 0.31.1                             BSD-2-Clause-Patent
bc-crypto 0.14.0                                 BSD-2-Clause-Patent
bc-envelope 0.43.0                               BSD-2-Clause-Patent
bc-rand 0.5.0                                    BSD-2-Clause-Patent
bc-shamir 0.13.0                                 BSD-2-Clause-Patent
bc-tags 0.12.0                                   BSD-2-Clause-Patent
bc-ur 0.19.2                                     BSD-2-Clause-Patent
bitcoin-consensus-encoding 1.2.0                 CC0-1.0
bitcoin-internals 0.6.0                          CC0-1.0
bitcoin-io 0.1.101                               CC0-1.0
bitcoin-private 0.1.0                            CC0-1.0
bitcoin_hashes 0.12.0                            CC0-1.0
bitcoin_hashes 0.14.101                          CC0-1.0
blake2 0.10.6                                    MIT OR Apache-2.0
block-buffer 0.10.4                              MIT OR Apache-2.0
bytes 1.12.1                                     MIT
cc 1.4.6                                         MIT OR Apache-2.0
chrono 0.4.45                                    MIT OR Apache-2.0
const-oid 0.9.6                                  Apache-2.0 OR MIT
core-foundation-sys 0.8.7                        MIT OR Apache-2.0
crc 3.4.0                                        MIT OR Apache-2.0
crc-catalog 2.5.0                                MIT OR Apache-2.0
crc32fast 1.5.2                                  MIT OR Apache-2.0
crunchy 0.2.4                                    MIT
curve25519-dalek 4.1.3                           BSD-3-Clause
curve25519-dalek-derive 0.1.1                    MIT/Apache-2.0
dcbor 0.25.2                                     BSD-2-Clause-Patent
der 0.7.10                                       Apache-2.0 OR MIT
digest 0.10.7                                    MIT OR Apache-2.0
displaydoc 0.2.7                                 MIT OR Apache-2.0
ed25519 2.2.3                                    Apache-2.0 OR MIT
ed25519-dalek 2.2.0                              BSD-3-Clause
fiat-crypto 0.2.9                                MIT OR Apache-2.0 OR BSD-1-Clause
find-msvc-tools 0.1.12                           MIT OR Apache-2.0
form_urlencoded 1.2.2                            MIT OR Apache-2.0
futures-core 0.3.34                              MIT OR Apache-2.0
futures-task 0.3.34                              MIT OR Apache-2.0
futures-util 0.3.34                              MIT OR Apache-2.0
getrandom 0.3.4                                  MIT OR Apache-2.0
half 2.7.1                                       MIT OR Apache-2.0
hex-conservative 0.2.3                           CC0-1.0
hex-conservative 1.3.0                           CC0-1.0
hkdf 0.12.4                                      MIT OR Apache-2.0
hmac 0.12.1                                      MIT OR Apache-2.0
iana-time-zone 0.1.65                            MIT OR Apache-2.0
iana-time-zone-haiku 0.1.2                       MIT OR Apache-2.0
icu_collections 2.3.0                            Unicode-3.0
icu_locale_core 2.3.0                            Unicode-3.0
icu_normalizer 2.3.0                             Unicode-3.0
icu_normalizer_data 2.3.0                        Unicode-3.0
icu_properties 2.3.0                             Unicode-3.0
icu_properties_data 2.3.0                        Unicode-3.0
icu_provider 2.3.1                               Unicode-3.0
idna 1.1.0                                       MIT OR Apache-2.0
idna_adapter 1.2.2                               Apache-2.0 OR MIT
js-sys 0.3.105                                   MIT OR Apache-2.0
known-values 0.15.5                              BSD-2-Clause-Patent
litemap 0.8.3                                    Unicode-3.0
log 0.4.34                                       MIT OR Apache-2.0
minicbor 0.19.1                                  BlueOak-1.0.0
minicbor-derive 0.13.0                           BlueOak-1.0.0
miniz_oxide 0.8.9                                MIT OR Zlib OR Apache-2.0
password-hash 0.5.0                              MIT OR Apache-2.0
paste 1.0.15                                     MIT OR Apache-2.0
pbkdf2 0.12.2                                    MIT OR Apache-2.0
percent-encoding 2.3.2                           MIT OR Apache-2.0
phf 0.11.3                                       MIT
phf_generator 0.11.3                             MIT
phf_macros 0.11.3                                MIT
phf_shared 0.11.3                                MIT
pkcs8 0.10.2                                     Apache-2.0 OR MIT
potential_utf 0.1.6                              Unicode-3.0
ppv-lite86 0.2.21                                MIT OR Apache-2.0
r-efi 5.3.0                                      MIT OR Apache-2.0 OR LGPL-2.1-or-later
rand 0.9.5                                       MIT OR Apache-2.0
rand_chacha 0.9.0                                MIT OR Apache-2.0
rand_core 0.9.3                                  MIT OR Apache-2.0
rand_core 0.9.5                                  MIT OR Apache-2.0
rand_xoshiro 0.6.0                               MIT OR Apache-2.0
rand_xoshiro 0.7.0                               MIT OR Apache-2.0
salsa20 0.10.2                                   MIT OR Apache-2.0
scrypt 0.11.0                                    MIT OR Apache-2.0
secp256k1 0.31.1                                 CC0-1.0
secp256k1-sys 0.11.0                             CC0-1.0
serde_json 1.0.149                               MIT OR Apache-2.0
sha2 0.10.9                                      MIT OR Apache-2.0
shlex 2.0.1                                      MIT OR Apache-2.0
signature 2.2.0                                  Apache-2.0 OR MIT
siphasher 1.0.3                                  MIT/Apache-2.0
slab 0.4.12                                      MIT
smallvec 1.16.1                                  MIT OR Apache-2.0
spki 0.7.3                                       Apache-2.0 OR MIT
sskr 0.12.0                                      BSD-2-Clause-Patent
syn 1.0.109                                      MIT OR Apache-2.0
syn 3.0.5                                        MIT OR Apache-2.0
synstructure 0.14.0                              MIT
tinystr 0.8.4                                    Unicode-3.0
tinyvec 1.13.3                                   Zlib OR Apache-2.0 OR MIT
unicode-normalization 0.1.25                     MIT OR Apache-2.0
ur 0.4.1                                         MIT
url 2.5.8                                        MIT OR Apache-2.0
utf8_iter 1.0.4                                  Apache-2.0 OR MIT
wasip2 1.0.4+wasi-0.2.12                         Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT
windows-core 0.62.2                              MIT OR Apache-2.0
windows-implement 0.60.2                         MIT OR Apache-2.0
windows-interface 0.59.3                         MIT OR Apache-2.0
windows-link 0.2.1                               MIT OR Apache-2.0
windows-result 0.4.1                             MIT OR Apache-2.0
windows-strings 0.5.1                            MIT OR Apache-2.0
wit-bindgen 0.57.1                               Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT
writeable 0.6.4                                  Unicode-3.0
x25519-dalek 2.0.1                               BSD-3-Clause
yoke 0.8.3                                       Unicode-3.0
yoke-derive 0.8.3                                Unicode-3.0
zerocopy 0.8.57                                  BSD-2-Clause OR Apache-2.0 OR MIT
zerocopy-derive 0.8.57                           BSD-2-Clause OR Apache-2.0 OR MIT
zerofrom 0.1.8                                   Unicode-3.0
zerofrom-derive 0.1.8                            Unicode-3.0
zeroize 1.8.2                                    Apache-2.0 OR MIT
zerotrie 0.2.5                                   Unicode-3.0
zerovec 0.11.8                                   Unicode-3.0
zerovec-derive 0.11.6                            Unicode-3.0
```

## Reproduced notices for Recovery and QR components

These notices accompany the standalone binary HTML distributions. The release bundler copies this file and `ATTRIBUTION.md` beside every artifact and includes both files in `SHA256SUMS`.

### Blockchain Commons BSD-2-Clause-Patent notice

This notice applies to the bundled `sskr`, `bc-envelope`, `bc-components`, and the Blockchain Commons transitive crates listed above.

```text
Copyright © 2023 Blockchain Commons, LLC

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice,
    this list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation
    and/or other materials provided with the distribution.

Subject to the terms and conditions of this license, each copyright holder and
contributor hereby grants to those receiving rights under this license a
perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable
(except for failure to satisfy the conditions of this license) patent license to
make, have made, use, offer to sell, sell, import, and otherwise transfer this
software, where such license applies only to those patent claims, already
acquired or hereafter acquired, licensable by such copyright holder or
contributor that are necessarily infringed by:

    (a) their Contribution(s) (the licensed copyrights of copyright holders and
    non-copyrightable additions of contributors, in source or binary form)
    alone; or

    (b) combination of their Contribution(s) with the work of authorship to
    which such Contribution(s) was added by such copyright holder or
    contributor, if, at the time the Contribution is added, such addition causes
    such combination to be necessarily infringed. The patent license shall not
    apply to any other combinations which include the Contribution.

Except as expressly stated above, no rights or licenses from any copyright
holder or contributor is granted under this license, whether expressly, by
implication, estoppel or otherwise.

DISCLAIMER

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### MIT notices

The following Recovery and QR sources are distributed or adapted under the MIT License. The common MIT terms below apply to every listed copyright notice:

```text
Copyright 2019 SatoshiLabs
python-shamir-mnemonic — SLIP-39 reference implementation, wordlist, and vectors

Copyright (c) 2021 SeedSigner
SeedSigner — SeedQR specification and vectors

Copyright (c) 2020 Aitor Ruano Miralles
sharks — GF(256) Shamir implementation

Copyright (c) Project Nayuki
Copyright (c) 2023 Anthony Fu <https://github.com/antfu>
uqr — QR encoder

Copyright (c) 2023 Paul Miller (https://paulmillr.com)
qr — QR decoder; distributed here under its MIT option

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Codex32

`codex32` 0.1.0 and its BIP93 vectors are dedicated under CC0-1.0. CC0 does not require preservation of a copyright notice; the source and license identifier remain recorded here and in `ATTRIBUTION.md` for provenance.

## Lock and artifact policy

- `package.json` uses exact dependency versions; pnpm's lockfile pins the npm closure and integrity hashes.
- `Cargo.toml` uses exact registry versions and one exact audited Orchard tag; `Cargo.lock` pins all transitive versions and git commits.
- Every supported build validates SHA-512 integrity entries for the complete pnpm package closure, SHA-256 checksums for every crates.io package, and full commit pins for Cargo git sources before compiling.
- Exact GitHub revisions are recorded for Orchard, note encryption, sharks, rust-codex32, the SLIP-39 reference, SeedSigner SeedQR, Blockchain Commons SSKR, Gordian Envelope, and bc-components. If GitHub is reachable, a differing revision fails the build. If it is unavailable, the build prints a conspicuous warning while the mandatory local/package-manager hash checks still apply.
- The verification record also carries SHA-256 hashes for the local SeedQR, SLIP-39, CKD Shamir, Codex32, SSKR, Gordian Seed Envelope, QR rendering, and QR decoding sources.
- `apps/key-derivation/src/index.html` contains a human-readable embedded production-dependency notice so the standalone artifact retains provenance when copied alone.
- `apps/activity-viewer/src/index.html` identifies its embedded Evo SDK/Orchard versions and online security boundary; the current Bitcoin, Ethereum, and Dash runtime providers are documented in its application README and the root security audit.
- `apps/discovery-scanner/src/index.html` identifies its embedded Evo SDK/Orchard versions and mnemonic-bearing online boundary; its current Bitcoin, Ethereum, and Dash providers are documented in its application README and the root security audit.
- `apps/psbt-inspector/src/index.html` identifies its embedded BitcoinerLab Miniscript compiler/analyzer and Scure BTC Signer MuSig2 inspection dependency. The pinned dependency remains unmodified; the standalone esbuild bundle may tree-shake signing APIs that this inspect/derive-only application does not import.
- Original project code is licensed under MIT as declared in the root `LICENSE` and `package.json`. Third-party components retain the licenses and notices listed above.
