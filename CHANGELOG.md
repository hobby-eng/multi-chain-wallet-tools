# Changelog

## Unreleased

### Security and dependencies

- Updated the JavaScript toolchain to Node.js 26.10.0 and Vitest 5.0.2. The canonical container, browser CI jobs, release workflow, vector workflow and lockfile now use the same reviewed toolchain.

- **Removed CKD Shamir.** The custom Raw and Words share formats duplicated what the standard Shamir shares of SSKR already provide, and only this project could read them. The module, its WASM build and its `blahaj` dependency are gone, and `shamir` is no longer a build feature. Use **Shamir shares (SSKR)** or SLIP-39 for new backups. Cards created with CKD Shamir can still be restored with release v0.1.5 or earlier; restore them there and create a new backup.

- **MnemoCode cards.** The MnemoCode panel saves the color codes of a phrase as printable cards: one A6 or A4 sheet, or separate numbered business cards, as PDF or as PNG images. See [the release draft](docs/releases/unreleased.md).
- A MnemoCode date needs a four-digit year. An error about an unknown BIP39 word names its position, not the word.
- **MHFE 0.4.0.** The MHFE panel now uses suite `MHFE-BIP39-256-EXPERIMENTAL-3` (2 GiB of Argon2id, PIM 0–1023, Unicode passwords) instead of suite 2. Every new container is decrypted again and marked verified before it is relied on. The final-word mode of suite 2 is gone. A page opened as a file explains that it runs on one thread and that the executable version is about three times faster.
- **Executable Deriver.** The Deriver also comes as one program per platform (Linux x86-64 and ARM64, Windows x86-64, macOS ARM64 and x86-64) that carries the release page, checks its SHA-256 and serves it to this computer only, so that MHFE runs in fast mode. It replaces the Python fast-mode launcher. Containers made with suite 2 need release v0.1.5 or earlier. See [the release draft](docs/releases/unreleased.md).

These entries describe changes after v0.1.5, not an already published release. Carry them into the next release notes for both editions; see [the release draft](docs/releases/unreleased.md) and [the release procedure](RELEASING.md).

## Published releases

Historical release notes are retained under [docs/releases](docs/releases/). Do not rewrite them to imply that a later dependency replacement was present in an earlier release.
