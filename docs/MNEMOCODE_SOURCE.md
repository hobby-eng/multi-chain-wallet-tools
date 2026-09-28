# MnemoCode core source

The `mnemocode` build feature does not contain a separate implementation of MnemoCode. Its transformations, representations and MNC1 record format are the unmodified upstream sources from [hobby-eng/mnemocode](https://github.com/hobby-eng/mnemocode), stored in `packages/recovery-mnemocode/source/`. `packages/recovery-backup/src/mnemocode.ts` is a thin browser adapter that adds this project's input limits, BIP39 validation and result shapes.

## What is imported

Only the dependency-free core: `src/core.ts`, the seven modules in `src/core/`, `src/record.ts`, and the upstream `LICENSE` and `NOTICE`. The command-line program, SSKR bridge and WASM, QR reader and writer, PDF and image export, fonts and artwork are never imported, because this project already has its own SSKR, QR and BIP39 components.

The core imports a single package, `@scure/bip39`, which resolves to the copy already pinned by this project. The synchronization command refuses any other import and refuses an upstream revision whose `@scure/bip39` version differs from the local pin, so no dependency is added or duplicated.

## Updating

```sh
pnpm sync:mnemocode                 # highest vMAJOR.MINOR.PATCH tag, or main when no tag exists
pnpm sync:mnemocode -- --ref v0.2.0 # a specific tag, branch or full commit
pnpm verify:mnemocode               # offline check of the committed files
```

The command resolves the reference to a full commit, downloads the listed files at that exact commit, checks their imports, and writes `packages/recovery-mnemocode/source.json` with the repository, reference, commit, version and SHA-256 of every file. Published release archives are not used. Review and commit the result together with any adapter change.

## Builds stay offline

Synchronization is a deliberate developer action. Ordinary and reproducible builds never contact GitHub for MnemoCode: they compile the committed files, and `pnpm verify:provenance` fails if a vendored file differs from its pinned hash, if the file set changes, or if the shared dependency version drifts. When GitHub is reachable, the pinned commit is also confirmed to exist upstream.

`--exclude mnemocode` removes the adapter and the vendored core from the bundle; the composition gate checks that no module under `packages/recovery-mnemocode/source/` remains.
