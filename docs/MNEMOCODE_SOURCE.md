# MnemoCode source

The Deriver's `mnemocode` and `mnemocode-cards` build features and the candidate-list import of the Discovery Scanner contain no implementation of MnemoCode's rules. They run MnemoCode's own WebAssembly, built from [hobby-eng/mnemocode](https://github.com/hobby-eng/mnemocode) (the Rust version) and vendored byte for byte in `packages/recovery-mnemocode-wasm/`. The pages stay TypeScript; MnemoCode is their backend.

## One file for each page

MnemoCode builds one WebAssembly file for each page (its ADR 0007, from its `wasm-profiles.json`), so that a page embeds only the modules it uses:

| Profile                         | Used by                                | Holds                                                                                                                         |
| ------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `multi-chain/key-derivation`    | The Multi-Chain Deriver                | Every module (phrase, wallet, QR, candidates, SSKR, recovery, cards, embroidery, stego), the 13 card designs and the 12 coins |
| `dash-community/key-derivation` | The Dash Community Deriver             | Every module, the 13 card designs and Dash only                                                                               |
| `multi-chain/discovery-scanner` | The Discovery Scanner of both editions | Candidate lists only, with no coin                                                                                            |

Each profile folder holds `mnemocode.wasm`, the wasm-bindgen glue `mnemocode.js`, its types `mnemocode.d.ts` and `modules.json` (the version, modules, units and file hashes). `tooling/mnemocode-wasm-plugin.mjs` resolves `@ckd/mnemocode-wasm/*` to the page's own profile when a page is built; `tsconfig.json` maps the same names to the multi-chain Deriver's types, which hold every module, for type checking and tests.

A selective build (`--coins`, `--features`) still embeds the whole file of its page: the file is one upstream unit. The composition gates check what this project's own modules reach; `--exclude mnemocode` removes MnemoCode from the Deriver entirely, and `--exclude mnemocode-cards` removes the card and heir-sheet controls, while the Deriver's file keeps MnemoCode's card module.

## What this project adds

- The wrappers in `packages/recovery-backup/src/mnemocode*.ts`: loading (`mnemocode-module.ts`, `mnemocode-engine.ts`), encode and decode (`mnemocode.ts`), searches (`mnemocode-search.ts`), shares (`mnemocode-shares.ts`), wallet evidence (`mnemocode-wallet.ts`), re-encoding, marked codes, backup checks, the word table, cards, the heirs' sheet, cross-stitch patterns (`mnemocode-stitch.ts`), steganography (`mnemocode-stego.ts`, with the page's words in `mnemocode-stego-words.ts`), QR codes with a hidden record (`mnemocode-hidden-qr.ts`) and the self-test. They translate between the binding and the page; MnemoCode makes every decision.
- The facts the binding does not export, in `mnemocode-facts.ts`: the modes and forms in MnemoCode's order, the share forms and their names, which forms MnemoCode writes only masked, and the texts the page shows beside results.
- The names and address forms of the coins whose addresses the wallet question compares (`mnemocode-offered-coins.ts`); MnemoCode reads the coin from the address, and the page names the coins it was read as. A build with fewer coins, and the Dash Community Edition, get a generated module with only their own coins, so that they neither offer nor name another coin; the page narrows an address to the build's own coins.
- Two BIP39 facts that need no MnemoCode: the hints below a seed phrase being typed (`packages/crypto-core/src/bip39-word-hints.ts`), so that chosen words have hints in every build, and the checksum bits of a word candidate's last word in the candidate tables.
- The page: its tabs, fields, workers, downloads and ZIP files (`fflate`).

## Loading and lifetime

The startup checks compile the page's file once and instantiate it in the page. A search, restore or repair runs in a worker of its own, which is given the compiled module with the job, and the page's BIP39 English list before its script; Cancel terminates the worker and with it everything it held.

Secret text crosses into the binding as JavaScript strings, which MnemoCode copies into memory it wipes. Refusals are errors with a read-only `code`. After a `WebAssembly.RuntimeError` an instance must not be used again; the glue keeps one instance for each page, so `mnemocode-engine.ts` guards every export and turns MnemoCode off until the page is loaded again.

Long searches are stepped as MnemoCode's command line steps them: a timed pace sample, then a plan that asks first where the person's limit is exceeded or the search would take more than twelve hours, then steps until it ends.

## Cards and the heirs' sheet

MnemoCode draws the cards and the heirs' sheet itself, as PDF, PNG and JPEG. The page keeps MnemoCode's card session for the working session, so that the details MnemoCode invents stay the same, and keeps the plan of a backup's cards, decoys included, while the same backup is saved again in the same design, so that its PDF and its images show the same cards. Source changes, Clear and page departure forget both.

## Cross-stitch patterns

MnemoCode's SeedStitch (its `docs/SEEDSTITCH.md`) hides a phrase masked with MnemoCode Seedshift, or with Direct the phrase itself, in the legend of a cross-stitch pattern made from a picture. Encode's "Cross-stitch pattern" takes the phrase, the mode and the dates of Encode, a PNG, JPEG or WebP picture, the fabric of MnemoCode's menu and a size: the sheets from A6 to A2 that hold the picture, as MnemoCode's `StitchSizes` gives them with their stitches and centimetres, or a width typed in centimetres or stitches. MnemoCode makes the pattern and its PDF for that fabric in the worker, as it makes searches. As at MnemoCode's terminal, a picture that cannot be used or cannot hold the phrase is answered with another picture or size while the phrase and dates stay typed. Decode, Re-encode and Forgotten's date search take a legend line wherever they take codes, and Decode and Re-encode also open the pattern's PDF, whose key page keeps the legend line (`readStitchPdf`); a PDF that another program saved again keeps none, and the legend is then typed from the key. MnemoCode reads the line into the record of the phrase, corrects one mistyped row, and the page names that row so that it is checked on the paper.

## Photos and MP3 files

MnemoCode's steganography (its `docs/STEGANOGRAPHY.md`) runs in the Photo or MP3 tab, in MnemoCode's worker: Argon2id takes one blocking 128 MiB step. The page asks MnemoCode to admit the sizes of the files before it reads any (`checkStegoFileSizes`, `checkStegoMessageSize`). Hiding analyses the new password, and for a decoy both passwords after MnemoCode's similarity check of the pair (`compareDecoyPassword`), and shows the guaranteed space at every density; only densities that take the contents are offered. The page counts a backup record at its compact size for 24 words, the most (MnemoCode's `steganography-format.md`). MnemoCode then writes the new file or set of files; the worker makes the Blob that the page saves, reads its bytes back and has MnemoCode open them with every password (`verifySaved`) before the page offers it. Opening collects the members of a set (`StegoRecoverySet`) until its quorum recovers the contents. The metadata conditions MnemoCode reports are shown in its words. Encode's records and a pattern's legend line are handed to the tab, and what it opens goes on to Decode or Re-encode. Once a new file is saved, the page shows MnemoCode's notice to keep each source private (its `docs/LIBRARY.md`, "Password-protected carrier records") and keeps it in view while that result stands.

## QR codes with a hidden record

MnemoCode's hidden QR (its `docs/HIDDEN_QR.md`) shows a public text to ordinary scanners and keeps an exact record after the QR's terminator. A card sheet's QR keeps the record behind the printed contact (`CardExport.setHiddenQr`), and the page then offers no QR image of its own for that sheet. Every MnemoCode QR image import tries `readHiddenQrPng` on a PNG first and reads the image as an ordinary QR only when MnemoCode finds no hidden record.

## In the Discovery Scanner

The Scanner's `seed-discovery` feature opens the candidate lists that MnemoCode and the Deriver save (`apps/discovery-scanner/src/candidate-list-import.ts`) with the Scanner's MnemoCode file. The Secret Vault forbids workers (`worker-src 'none'`), so a list encrypted with a passphrase is opened on the page itself. An explicit plaintext-list checkbox also admits an unencrypted MNCL list. The Scanner's composition gate fails a build without `seed-discovery` that still holds the list import.

## SSKR

The standalone SSKR panel keeps `packages/recovery-sskr-wasm`, MnemoCode's SSKR engine with its own Rust closure and notices, and its own copy of MnemoCode's bridge checks (`packages/recovery-backup/src/sskr-bridge.ts`). MnemoCode's own shares (split, restore, repair) run in MnemoCode's WebAssembly.

## Not offered by the binding

The TypeScript version of MnemoCode offered some things that MnemoCode's binding does not: a JSON export of a backup, hints while shares are typed (MnemoCode's command line has them, its binding does not export them), and the kind of a word hint. The page leaves them out rather than rebuild MnemoCode's rules.

## Updating

```sh
pnpm sync:mnemocode --archive <mnemocode-X.Y.Z-wasm.tar> --source <mnemocode checkout> [--unreleased <why>]
pnpm verify:mnemocode # offline check of the vendored files against source.json
```

The archive is MnemoCode's canonical WASM archive of the checkout's commit, from its release check. The command refuses a checkout with uncommitted changes, and a commit without a release tag unless `--unreleased` says why. It writes the three profiles, MnemoCode's licence, notice and third-party notices, and `source.json`, which records the commit, the version, the archive's SHA-256 and the SHA-256 of every file.

## Builds and the network

Every supported build first runs `pnpm verify:provenance`:

- Local integrity, mandatory and offline: the build stops if a vendored file differs from `source.json`, if the file set changes, or if a profile's `modules.json` names another version.
- Commit availability, best effort: the command asks `api.github.com` whether the pinned MnemoCode commit exists. The request carries only the public repository name and commit, never wallet data. If GitHub names a different commit, the build stops; if it does not answer, the build continues on the local hashes with a warning.

An intake marked unreleased is refused in CI and in the reproducible container: a tagged MnemoCode release is required before these tools are released. The files vendored now are such an intake: MnemoCode's own `cargo xtask wasm` build of its uncommitted working tree on commit `b22affc` (steganography, hidden QR records and the embroidery's fabrics and sizes, after its AUD-005), recorded in `source.json` with the same layout and hashes; the command above refuses an uncommitted checkout, so it was vendored by hand and checked with `pnpm verify:mnemocode`. The canonical archive of a committed, tagged 0.2.0 replaces it before a release. [RELEASING.md](../RELEASING.md) describes the provenance check for every reviewed upstream.
