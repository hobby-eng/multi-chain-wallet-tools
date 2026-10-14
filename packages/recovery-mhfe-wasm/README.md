# MHFE browser package

This directory holds the browser package of MHFE 0.6.0 from
[`hobby-eng/mhfe`](https://github.com/hobby-eng/mhfe), unchanged: suites
`MHFE-BIP39-256-EXPERIMENTAL-3` for 24-word containers and `MHFE-BIP39-LP-EXPERIMENTAL-4` for
containers as long as a 12- to 21-word phrase, and every other operation of the mhfe program.

**Signed release.** `generated/modules.json` identifies version 0.6.0 and build ID
`4f5000f4290fa5eb`: the browser package of the signed
[v0.6.0 release](https://github.com/hobby-eng/mhfe/releases/tag/v0.6.0), tag on commit
`66f142566464255e331763966b00ea1681c2dabd`. Its archive `mhfe-v0.6.0-browser.tar.gz` (SHA-256
`e7f97d481a62726fffd625dbac0f6b9ee4c941d1073e812f8fb54fa4f265e998`) is listed in the release's
`SHA256SUMS`, which the owner's OpenPGP key `28FC51B1DB80DF2101128CB30EDD4814591DD095` signs; every
vendored file equals the archive's. The archive's notices, licences and README are not copied, nor is
the Python fast-mode launcher, which the executable Deriver replaces. The pinned manifest SHA-256 is
`31a81f5b7ce8a07fe38fd61abfd923302071d3a81f9757eceb5a59e49a39ca1a`; its per-file hashes identify the
package actually used.

The package is a set of independent module classes over one WebAssembly. The Key Derivation Tool
compiles the WebAssembly once, passes it with the worker script to each class, and embeds the worker
and both Argon2 builds as text. Every operation runs in a disposable Worker.

| Folder       | Files                                                      | What it is                                                                         |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `runtime/`   | `runtime.js`, `runtime.d.ts`, `mhfe.wasm`, `worker.js`     | The WebAssembly with every module, the worker script, errors and secret handling   |
| `core/`      | `client.js`, `client.d.ts`, `argon2-mt.js`, `argon2-st.js` | Encryption, recovery, the rehearsal check, rekey, hidden wallets and the self-test |
| `repair/`    | `repair.js`, `repair.d.ts`                                 | Repair words of a container (MHFE-REPAIR-1) and the repair of a damaged plate      |
| `passwords/` | `passwords.js`, `passwords.d.ts`                           | The check word review (MHFE-PASSWORD-CHECK-1), strength and new passwords          |
| `wallet/`    | `wallet.js`, `wallet.d.ts`                                 | The wallet check, master key fingerprints, address searches and new phrases        |

The Argon2 builds are the reference Argon2 C code compiled with Emscripten 6.0.10, threaded and
single-threaded. `modules.json` gives the package version and every file with its SHA-256; the
provenance check pins `modules.json` itself and checks each file against it. Every file carries the
package's build ID (`buildId` in `modules.json`), and the worker refuses files of different builds
(`PACKAGE_MISMATCH`), so the package is always replaced whole, both Argon2 builds included. Each
class checks itself before its first operation (`startupCheck()`), and `fullCheck()` and
`selfTest()` are the page's self-tests. The package's Python
fast-mode launcher `core/mhfe-fast-mode.py` is left out, because the executable Key Derivation Tool
(`apps/key-derivation/launcher`) replaces it.

MHFE is MIT licensed (`LICENSE-MHFE`). The Argon2 builds contain the reference C implementation of
Argon2, used under Apache-2.0 (`LICENSE-ARGON2`). The WebAssembly contains the EFF large wordlist by
the Electronic Frontier Foundation, under CC BY 4.0. The package's own notices come with it unchanged
in `notices/THIRD_PARTY_NOTICES.md`: the Argon2 code, the EFF wordlist, the Emscripten runtime, musl
and the wasm-bindgen JavaScript glue, then the licence of every Rust crate compiled into the
WebAssembly.
