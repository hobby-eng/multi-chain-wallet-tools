# Next release notes — draft

No new version or release date has been assigned. Include the following security notice in the next Multi-Chain and Dash Community release notes before publishing either edition.

## MnemoCode module

Added MnemoCode 0.1.0 to the Deriver's offline **Recover & Back Up** workspace. The optional `mnemocode` build feature supports Encode and Decode for Direct, checksum-valid Seedshift, exact legacy Seedshift, and legacy valid-final-word recovery across all five MnemoCode representations and every standard BIP39 word count. Decode also includes bounded word recovery: one `?` placeholder returns every checksum-valid replacement with its BIP39 word number and exact checksum bits. A separate exact-legacy option accepts the complete old shifted phrase even when its checksum is invalid, enumerates every checksum-valid final-word replacement, and marks the one that preserves the old word's entropy-bearing bits. Color Unicode now uses visible four-digit code-point text while retaining support for earlier literal Private Use symbols. MNC1 records download as reveal-gated local text files instead of duplicating the raw payload on screen. The module reuses existing BIP39, QR, and download support; no npm package, Rust crate, storage API, or network behavior was added.

## JavaScript toolchain

Updated the supported and reproducible JavaScript toolchain to Node.js 26.10.0 and Vitest 5.0.2. CI, the canonical container and the lockfile use the same versions.

## CKD Shamir removed

Removed the CKD Shamir module and the `shamir` build feature. Its custom Raw and Words share formats duplicated the standard Shamir shares of SSKR and could be read only by this project. The SSKR tab is now named **Shamir shares (SSKR)**. Cards created with CKD Shamir can still be restored with release v0.1.5 or earlier.

The MnemoCode module now compiles the unmodified upstream core, vendored from its Git repository at a pinned commit with per-file SHA-256 values, instead of a separate port. See [MnemoCode source](../MNEMOCODE_SOURCE.md).

Added the optional `mnemocode-cards` feature: the MnemoCode panel can save the color codes of a phrase as printable cards, with a choice of template, page size, orientation, file format and optional QR code. PDF is the default. PNG images are drawn by the page itself at 300 dpi; the corners outside the rounded edge of a separate card are transparent. It uses the MnemoCode renderers themselves and adds `pdf-lib`, `@pdf-lib/fontkit` and `@pdf-lib/upng` at the versions pinned by MnemoCode.

A MnemoCode date needs a four-digit year: `23-09-26` was read as the year 23 and is now an error. Dates are ignored in Direct mode. An error about an unknown BIP39 word names its position, not the word.

## MHFE 0.4.0 and fast mode

The MHFE panel embeds the MHFE 0.4.0 browser package, suite `MHFE-BIP39-256-EXPERIMENTAL-3`: twelve rounds of Argon2id with 2 GiB each, PIM 0–1023, and passwords in any Unicode text except line breaks. Suite 2 containers are not readable with this version; recover them with release v0.1.5 or earlier and encrypt the phrase again. The final-word mode of suite 2 is removed.

Every encryption decrypts the new container once more. The container appears after the first twelve rounds, clearly marked as not yet verified, and is marked verified only when it turns back into the original phrase; a failed check says the container must not be used. Before encrypting, the page warns in the rare case (about one phrase in four billion) that automatic length detection would not give the phrase back on its own.

Opened as a file, the page runs Argon2 on one thread, because browsers allow shared memory between threads only on cross-origin isolated pages, which a file cannot be. The panel says so and points to the executable version.

## Executable Deriver

The Deriver also comes as one program per platform: `Wallet_Key_Derivation_Tool-linux-x86_64`, `-linux-aarch64`, `-windows-x86_64.exe`, `-macos-aarch64` and `-macos-x86_64`. Each carries the release's HTML page, checks it against its SHA-256 when it starts, and serves it to this computer only with the headers that let MHFE use four threads, about three times faster. It answers nothing but the page and never sees what is typed. Closing it does not close a tab that already shows the page. The Linux and Windows programs are built in the pinned container, the macOS programs on GitHub's macOS runners; all are listed in `SHA256SUMS` and attested. The macOS programs are not signed by Apple. They replace the Python launcher `mhfe-fast-mode.py`, which is no longer shipped.
