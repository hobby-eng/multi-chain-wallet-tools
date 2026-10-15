# SSKR bridge dependency notices

This report covers only the packages pinned in `rust/Cargo.lock`. Versions and
license expressions below were retained from the supplied dependency report and
filtered against that lockfile; they are not a new upstream license audit. Some
entries are build-time or platform-specific and need not appear in the WASM binary.
Crate sources and their license files remain authoritative.

The bridge source is included in `rust/src/lib.rs`, with its manifest and lockfile.
The MIT copyright and license for the bridge are retained in [LICENSE](LICENSE).
`integrity.json` pins the source, manifests and generated JS/WASM files.

## Locked packages

| Package | Version | Recorded license |
| --- | --- | --- |
| `aead` | 0.5.2 | MIT OR Apache-2.0 |
| `android_system_properties` | 0.1.6 | MIT OR Apache-2.0 |
| `argon2` | 0.5.3 | MIT OR Apache-2.0 |
| `arrayvec` | 0.7.8 | MIT OR Apache-2.0 |
| `autocfg` | 1.5.1 | MIT OR Apache-2.0 |
| `base64ct` | 1.8.3 | Apache-2.0 OR MIT |
| `bc-crypto` | 0.14.0 | BSD-2-Clause-Patent |
| `bc-rand` | 0.5.0 | BSD-2-Clause-Patent |
| `bc-shamir` | 0.13.0 | BSD-2-Clause-Patent |
| `bc-tags` | 0.12.0 | BSD-2-Clause-Patent |
| `bc-ur` | 0.19.2 | BSD-2-Clause-Patent |
| `bitcoin-consensus-encoding` | 1.3.0 | CC0-1.0 |
| `bitcoin-internals` | 0.7.0 | CC0-1.0 |
| `bitcoin-io` | 0.1.101 | CC0-1.0 |
| `bitcoin-private` | 0.1.0 | CC0-1.0 |
| `bitcoin_hashes` | 0.12.0 | CC0-1.0 |
| `bitcoin_hashes` | 0.14.101 | CC0-1.0 |
| `blake2` | 0.10.6 | MIT OR Apache-2.0 |
| `block-buffer` | 0.10.4 | MIT OR Apache-2.0 |
| `bumpalo` | 3.20.3 | MIT OR Apache-2.0 |
| `cc` | 1.6.0 | MIT OR Apache-2.0 |
| `cfg-if` | 1.0.5 | MIT OR Apache-2.0 |
| `chacha20` | 0.9.1 | MIT OR Apache-2.0 |
| `chacha20poly1305` | 0.10.1 | MIT OR Apache-2.0 |
| `chrono` | 0.4.45 | MIT OR Apache-2.0 |
| `cipher` | 0.4.4 | MIT OR Apache-2.0 |
| `const-oid` | 0.9.6 | Apache-2.0 OR MIT |
| `core-foundation-sys` | 0.8.7 | MIT OR Apache-2.0 |
| `cpufeatures` | 0.2.17 | MIT OR Apache-2.0 |
| `crc` | 3.4.0 | MIT OR Apache-2.0 |
| `crc-catalog` | 2.5.0 | MIT OR Apache-2.0 |
| `crc32fast` | 1.5.2 | MIT OR Apache-2.0 |
| `crunchy` | 0.2.4 | MIT |
| `crypto-common` | 0.1.7 | MIT OR Apache-2.0 |
| `curve25519-dalek` | 4.1.3 | BSD-3-Clause |
| `curve25519-dalek-derive` | 0.1.1 | MIT/Apache-2.0 |
| `dcbor` | 0.25.2 | BSD-2-Clause-Patent |
| `der` | 0.7.10 | Apache-2.0 OR MIT |
| `digest` | 0.10.7 | MIT OR Apache-2.0 |
| `ed25519` | 2.2.3 | Apache-2.0 OR MIT |
| `ed25519-dalek` | 2.2.0 | BSD-3-Clause |
| `fiat-crypto` | 0.2.9 | MIT OR Apache-2.0 OR BSD-1-Clause |
| `find-msvc-tools` | 0.1.14 | MIT OR Apache-2.0 |
| `futures-core` | 0.3.34 | MIT OR Apache-2.0 |
| `futures-task` | 0.3.34 | MIT OR Apache-2.0 |
| `futures-util` | 0.3.34 | MIT OR Apache-2.0 |
| `generic-array` | 0.14.7 | MIT OR Apache-2.0 |
| `getrandom` | 0.2.17 | MIT OR Apache-2.0 |
| `getrandom` | 0.3.4 | MIT OR Apache-2.0 |
| `half` | 2.7.1 | MIT OR Apache-2.0 |
| `hex` | 0.4.3 | MIT OR Apache-2.0 |
| `hex-conservative` | 0.2.3 | CC0-1.0 |
| `hex-conservative` | 1.3.0 | CC0-1.0 |
| `hkdf` | 0.12.4 | MIT OR Apache-2.0 |
| `hmac` | 0.12.1 | MIT OR Apache-2.0 |
| `iana-time-zone` | 0.1.65 | MIT OR Apache-2.0 |
| `iana-time-zone-haiku` | 0.1.2 | MIT OR Apache-2.0 |
| `inout` | 0.1.4 | MIT OR Apache-2.0 |
| `js-sys` | 0.3.106 | MIT OR Apache-2.0 |
| `lazy_static` | 1.5.1 | MIT OR Apache-2.0 |
| `libc` | 0.2.190 | MIT OR Apache-2.0 |
| `log` | 0.4.34 | MIT OR Apache-2.0 |
| `minicbor` | 0.19.1 | BlueOak-1.0.0 |
| `minicbor-derive` | 0.13.0 | BlueOak-1.0.0 |
| `num-traits` | 0.2.19 | MIT OR Apache-2.0 |
| `once_cell` | 1.21.4 | MIT OR Apache-2.0 |
| `opaque-debug` | 0.3.1 | MIT OR Apache-2.0 |
| `password-hash` | 0.5.0 | MIT OR Apache-2.0 |
| `paste` | 1.0.15 | MIT OR Apache-2.0 |
| `pbkdf2` | 0.12.2 | MIT OR Apache-2.0 |
| `phf` | 0.11.3 | MIT |
| `phf_generator` | 0.11.3 | MIT |
| `phf_macros` | 0.11.3 | MIT |
| `phf_shared` | 0.11.3 | MIT |
| `pin-project-lite` | 0.2.17 | MIT OR Apache-2.0 |
| `pkcs8` | 0.10.2 | Apache-2.0 OR MIT |
| `poly1305` | 0.8.0 | MIT OR Apache-2.0 |
| `ppv-lite86` | 0.2.21 | MIT OR Apache-2.0 |
| `proc-macro2` | 1.0.107 | MIT OR Apache-2.0 |
| `quote` | 1.0.47 | MIT OR Apache-2.0 |
| `r-efi` | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| `rand` | 0.8.8 | MIT OR Apache-2.0 |
| `rand` | 0.9.5 | MIT OR Apache-2.0 |
| `rand_chacha` | 0.9.0 | MIT OR Apache-2.0 |
| `rand_core` | 0.6.4 | MIT OR Apache-2.0 |
| `rand_core` | 0.9.5 | MIT OR Apache-2.0 |
| `rand_xoshiro` | 0.6.0 | MIT OR Apache-2.0 |
| `rand_xoshiro` | 0.7.0 | MIT OR Apache-2.0 |
| `recovery-sskr-wasm` | 0.1.7 | MIT OR Apache-2.0 (MIT text included in LICENSE) |
| `rustc_version` | 0.4.1 | MIT OR Apache-2.0 |
| `rustversion` | 1.0.23 | MIT OR Apache-2.0 |
| `salsa20` | 0.10.2 | MIT OR Apache-2.0 |
| `scrypt` | 0.11.0 | MIT OR Apache-2.0 |
| `secp256k1` | 0.31.1 | CC0-1.0 |
| `secp256k1-sys` | 0.11.0 | CC0-1.0 |
| `semver` | 1.0.28 | MIT OR Apache-2.0 |
| `serde` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_core` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_derive` | 1.0.229 | MIT OR Apache-2.0 |
| `sha2` | 0.10.9 | MIT OR Apache-2.0 |
| `shlex` | 2.0.1 | MIT OR Apache-2.0 |
| `signature` | 2.2.0 | Apache-2.0 OR MIT |
| `siphasher` | 1.0.4 | MIT OR Apache-2.0 |
| `slab` | 0.4.12 | MIT |
| `spki` | 0.7.3 | Apache-2.0 OR MIT |
| `sskr` | 0.12.0 | BSD-2-Clause-Patent |
| `subtle` | 2.6.1 | BSD-3-Clause |
| `syn` | 1.0.109 | MIT OR Apache-2.0 |
| `syn` | 2.0.119 | MIT OR Apache-2.0 |
| `syn` | 3.0.6 | MIT OR Apache-2.0 |
| `thiserror` | 2.0.21 | MIT OR Apache-2.0 |
| `thiserror-impl` | 2.0.21 | MIT OR Apache-2.0 |
| `tinyvec` | 1.13.3 | Zlib OR Apache-2.0 OR MIT |
| `typenum` | 1.20.1 | MIT OR Apache-2.0 |
| `unicode-ident` | 1.0.26 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| `unicode-normalization` | 0.1.25 | MIT OR Apache-2.0 |
| `universal-hash` | 0.5.1 | MIT OR Apache-2.0 |
| `ur` | 0.4.1 | MIT |
| `version_check` | 0.9.5 | MIT OR Apache-2.0 |
| `wasi` | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| `wasip2` | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| `wasm-bindgen` | 0.2.129 | MIT OR Apache-2.0 |
| `wasm-bindgen-macro` | 0.2.129 | MIT OR Apache-2.0 |
| `wasm-bindgen-macro-support` | 0.2.129 | MIT OR Apache-2.0 |
| `wasm-bindgen-shared` | 0.2.129 | MIT OR Apache-2.0 |
| `windows-core` | 0.62.2 | MIT OR Apache-2.0 |
| `windows-implement` | 0.60.2 | MIT OR Apache-2.0 |
| `windows-interface` | 0.59.3 | MIT OR Apache-2.0 |
| `windows-link` | 0.2.1 | MIT OR Apache-2.0 |
| `windows-result` | 0.4.1 | MIT OR Apache-2.0 |
| `windows-strings` | 0.5.1 | MIT OR Apache-2.0 |
| `wit-bindgen` | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| `x25519-dalek` | 2.0.1 | BSD-3-Clause |
| `zerocopy` | 0.8.62 | BSD-2-Clause OR Apache-2.0 OR MIT |
| `zerocopy-derive` | 0.8.62 | BSD-2-Clause OR Apache-2.0 OR MIT |
| `zeroize` | 1.9.1 | Apache-2.0 OR MIT |
| `zeroize_derive` | 1.5.0 | MIT OR Apache-2.0 |

## Blockchain Commons BSD-2-Clause-Patent notice

This notice applies to `sskr`, `bc-shamir`, `bc-rand`, `bc-crypto`, `bc-ur`,
`bc-tags`, and `dcbor`. Their versions are listed above.

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
