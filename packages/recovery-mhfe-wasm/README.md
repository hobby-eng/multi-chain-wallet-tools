# MHFE browser package

This directory holds the browser package of MHFE 0.8.0 from
[`hobby-eng/mhfe`](https://github.com/hobby-eng/mhfe), unchanged: suites
`MHFE-BIP39-256-EXPERIMENTAL-3` for 24-word containers and `MHFE-BIP39-LP-EXPERIMENTAL-4` for
containers as long as a 12- to 21-word phrase, and every other operation of the mhfe program. From
0.8.0, MHFE draws no new phrases: the Deriver's own generator does, with MHFE's wallet check of the
phrase drawn (`MhfeWallet.walletCheck`).

**Development build of 0.8.0, not yet released.** It is MHFE's verified build of its uncommitted
0.8.0 tree on v0.7.0 (commit `8a15bed9f181cf78c5880558cc88d0d90ee4a72f`; `git diff 8a15bed` of the
tree without `docs/audits/README.md` has SHA-256
`f5b7c6394c2bb54ab0f8fbdec1dcce25fb83503755a0a079a5ffe59b02c1754e`, the tree that MHFE's AUD-048
verified), taken from MHFE's canonical Docker browser archive `mhfe-v0.8.0-browser.tar.gz`, SHA-256
`553e8d30c1af463e30839ed7c3e43f9cbb7707b637646bc656745fe3b9167a90`, whose 17 package files equal
those of MHFE's `dist/` byte for byte. `generated/modules.json` identifies version 0.8.0 and build
ID `19de50ce492d1e35`; its SHA-256 is
`897d0e5b11efbb1e3a817acb2a51da6e85d0a5187b4b62c9c3d899aefaa6f69e`. [source.json](source.json)
records the base commit, a SHA-256 of its `git archive`, the archive, the whole package's
fingerprint and the hash of every vendored file, and says that the build is unreleased. The
release of these tools waits for MHFE's signed v0.8.0, whose archive will differ only in
`BUILD-INFO.txt`. Every vendored runtime file is unchanged. The Python fast-mode launcher is
omitted here because the executable Deriver replaces it.

The package is a set of independent module classes over one WebAssembly. The Key Derivation Tool
compiles the WebAssembly once, passes it with the worker script to each class, and embeds the worker
and both Argon2 builds as text. Every operation runs in a disposable Worker.

| Folder       | Files                                                      | What it is                                                                         |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `runtime/`   | `runtime.js`, `runtime.d.ts`, `mhfe.wasm`, `worker.js`     | The WebAssembly with every module, the worker script, errors and secret handling   |
| `core/`      | `client.js`, `client.d.ts`, `argon2-mt.js`, `argon2-st.js` | Encryption, recovery, the rehearsal check, rekey, hidden wallets and the self-test |
| `repair/`    | `repair.js`, `repair.d.ts`                                 | Repair words of a container (MHFE-REPAIR-1) and the repair of a damaged plate      |
| `passwords/` | `passwords.js`, `passwords.d.ts`                           | The check word review (MHFE-PASSWORD-CHECK-1), strength and new passwords          |
| `wallet/`    | `wallet.js`, `wallet.d.ts`                                 | The wallet check, master key fingerprints and address searches                     |

The Argon2 builds are the reference Argon2 C code compiled with Emscripten 6.0.12, threaded and
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

## Host contracts

Check preserves three outcomes: `matches`, `not verified` and `does not match`. Where only the
wallet without the typed BIP39 passphrase matched (`withoutPassphrase`), the page lists the match
without a passphrase and says that the passphrase is not confirmed, as `mhfe check` says it. An
address reference leaves its coin to MHFE, which reads it from the address, unless the person
chooses one; the Dash edition names Dash. The original
phrase's own checks that passed (`builtInCheck`, every other length in `otherLengths`, and
`walletCheck`) remain visible; a wallet check alone is not proof of recovery. A long operation
that Cancel stopped resolves to `CANCELLED`, which the page treats as a stop, not an error. The
owner's confirmation of a rekey answers yes or no; the page derives the rehearsal of the new
container from the fingerprint the owner confirmed. MHFE's browser package publishes no input
limit, so the page admits a phrase, container or repair-word field to MHFE's typed line, 8,192
UTF-8 bytes, before it keeps a copy. Repair words and word-count notes stay apart from the
container where the package's keep list says so. The host never appends arbitrary RNG or Argon2
startup exception text.
