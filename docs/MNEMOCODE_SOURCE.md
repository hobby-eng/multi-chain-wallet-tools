# MnemoCode source

The `mnemocode` and `mnemocode-cards` build features contain no separate implementation of MnemoCode. They compile the unmodified sources of [hobby-eng/mnemocode](https://github.com/hobby-eng/mnemocode), stored in `packages/recovery-mnemocode/source/`.

| Feature           | Imported from MnemoCode                                     | Added by this project                                                             |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `mnemocode`       | Transformations, representations and the MNC1 record format | Input limits, BIP39 validation and result shapes                                  |
| `mnemocode-cards` | Card templates and renderers with their font and artwork    | Random source, QR matrix, PNG coding, ZIP file, PNG images of the cards, the form |

The command-line program, file output, the share engine with its WASM, and the QR and PNG libraries of MnemoCode are never imported. MnemoCode makes images with a separate program that a browser does not have, so this project draws the finished PDF page on a canvas; see `packages/recovery-backup/src/mnemocode-card-drawing.ts`. The renderers ask their host for those services, and this project supplies them from components it already has.

## Shared packages

The imported files use three packages, each resolved to the version pinned by this project: `@scure/bip39`, `pdf-lib` and `@pdf-lib/fontkit`. The synchronization command refuses any other import and refuses a MnemoCode revision that pins a different version of these packages.

## Updating

```sh
pnpm sync:mnemocode                 # highest vMAJOR.MINOR.PATCH tag, or main when no tag exists
pnpm sync:mnemocode -- --ref v0.2.0 # a specific tag, branch or full commit
pnpm verify:mnemocode               # offline check of the committed files
```

A signed or annotated tag is resolved to the commit behind it. A full commit is accepted only when the `main` branch of MnemoCode contains it, because GitHub also serves commits that exist only in a fork.

The command resolves the reference to a full commit, downloads the listed files at that commit, checks their imports, and writes `packages/recovery-mnemocode/source.json` with the repository, reference, commit, version and SHA-256 of every file. Review and commit the result together with any adapter change.

## Builds stay offline

Synchronization is a deliberate developer action. Builds never contact GitHub for MnemoCode: they compile the committed files, and `pnpm verify:provenance` fails if a file differs from its pinned hash, if the file set changes, or if a shared package version drifts.

`--exclude mnemocode-cards` removes card export, the PDF libraries, the font and the artwork. `--exclude mnemocode` removes both features. The composition gate checks that nothing of an excluded feature remains in the bundle.

## Build-time adjustments for the PDF libraries

The artifact gate rejects the non-cryptographic random function and any web address outside the reviewed links. The PDF libraries contain one such call in a font-program interpreter that the bundled font never uses, and three web addresses in message text. The build redirects the call to the system random source and replaces the three strings; see `tooling/bundled-library-text.mjs`. The gate itself is unchanged.
