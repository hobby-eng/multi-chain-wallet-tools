# Changelog

## Unreleased

### Security and dependencies

- Updated the JavaScript toolchain to Node.js 26.10.0 and Vitest 5.0.2. The canonical container, browser CI jobs, release workflow, vector workflow and lockfile now use the same reviewed toolchain.

- **Removed CKD Shamir.** The custom Raw and Words share formats duplicated what the standard Shamir shares of SSKR already provide, and only this project could read them. The module, its WASM build and its `blahaj` dependency are gone, and `shamir` is no longer a build feature. Use **Shamir shares (SSKR)** or SLIP-39 for new backups. Cards created with CKD Shamir can still be restored with release v0.1.5 or earlier; restore them there and create a new backup.

- **MnemoCode cards.** The MnemoCode panel saves the color codes of a phrase as printable cards: one A6 or A4 sheet, or separate numbered business cards, as PDF or as PNG images. See [the release draft](docs/releases/unreleased.md).
- A MnemoCode date needs a four-digit year. An error about an unknown BIP39 word names its position, not the word.

These entries describe changes after v0.1.5, not an already published release. Carry them into the next release notes for both editions; see [the release draft](docs/releases/unreleased.md) and [the release procedure](RELEASING.md).

## Published releases

Historical release notes are retained under [docs/releases](docs/releases/). Do not rewrite them to imply that a later dependency replacement was present in an earlier release.
