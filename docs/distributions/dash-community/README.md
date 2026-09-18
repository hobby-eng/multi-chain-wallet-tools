# Dash Community Wallet Tools

**Current canonical source version: {{VERSION}}** (source metadata date: {{RELEASE_DATE}}). This documentation describes the current code, not necessarily the latest published HTML release. Download published files from [Dash releases](https://github.com/hobby-eng/dash-wallet-tools/releases).

Dash Community Edition contains four standalone HTML tools for Dash. Open downloaded files in a current browser; no installation or server is required. Application code lives in [multi-chain-wallet-tools](https://github.com/hobby-eng/multi-chain-wallet-tools), and this repository distributes the Dash releases.

## Choose a tool

- **Key Derivation Tool:** generate or enter a BIP39 recovery phrase and derive Dash Core addresses, Platform payment addresses, Identity keys, multisig cosigner keys, and Orchard material. Receive and supported change/internal results are separate. BIP85 creates child wallet phrases; private results stay masked until revealed.
- **Activity Viewer:** check public addresses, identities, and Orchard viewing data with online providers. Single and batch results can be exported as CSV, JSON, or XLSX.
- **Discovery Scanner:** find supported accounts and used addresses from recovery-phrase candidates or watch-only public keys/descriptors. Both input modes support single and batch scans. Results are grouped by recovery type and can be exported as public recovery reports.
- **PSBT & Multisig Inspector:** inspect Dash PSBTs, scripts, and descriptors, build supported public multisig/watch-only policies, verify Dash messages, and decrypt supported BIP38 keys locally. It does not sign or broadcast transactions.

## Protect and restore a backup

The Deriver's **Recover & Back Up** tab lets you prepare backups offline:

- **Wallet Matcher** checks the phrase/passphrase candidates you provide against known addresses and selected search ranges.
- **SLIP-39** creates word cards so, for example, any two of three cards can restore the original BIP39 phrase in this tool. Importing those cards directly into a native SLIP-39 wallet may derive a different wallet.
- **CKD Shamir** splits the phrase into custom cards shown as words or compact text. Use a compatible CKD decoder to restore them; they are not ordinary wallet phrases or standard SLIP-39 cards.
- **SSKR** uses Blockchain Commons' standard secret-sharing format, including groups with separate card thresholds. Choose compact UR text for QR transfer or full Bytewords for transcription.
- **Gordian Seed Envelope** encrypts a backup container. Configure alternative access through a password, recipient private key, or enough SSKR cards. You can also include the BIP39 passphrase, placing both wallet secrets in one backup. A key derived from the same phrase cannot recover the backup if that phrase is lost.
- **Codex32** stores a checksummed phrase backup or a BIP32 master-seed backup, optionally split into shares. Master-seed mode cannot restore the original words or passphrase. Encoding alone is not encryption.
- **SeedQR** encodes the phrase as a QR code for offline transfer or printing. It does not encrypt the secret.

Each backup card or record can have a QR code saved as PNG. Restore tabs read QR image files offline, avoiding manual transcription. Treat each QR image like the secret it contains. SLIP-39, CKD Shamir, and standalone SSKR preserve phrase entropy; keep its separate BIP39 passphrase safe too.

The original phrase or a BIP85 child phrase can be used directly in the backup tabs without copying it to the clipboard.

## Modular builds

Version 0.1.5 introduced a major modular refactoring. Build from the canonical source with `--profile dash-community`; use `--features` and `--exclude` to select optional modules. The Dash edition contains only Dash support. See [build choices and commands](https://github.com/hobby-eng/multi-chain-wallet-tools/blob/{{SOURCE_SHA}}/docs/BUILD_MODULES.md).

The available modules below are generated from the actual build configuration:

{{MODULE_TABLE}}

## Verify a download

Download the release files into one directory and run:

```sh
sha256sum -c SHA256SUMS
```

Release bundles include `verification-record.json`, `LICENSE`, `ATTRIBUTION.md`, and `THIRD_PARTY_NOTICES.md`. Verify GitHub build-provenance attestations with:

```sh
gh attestation verify Dash_Community_Key_Derivation_Tool.html -R hobby-eng/dash-wallet-tools
```

## Safety and provenance

Use a trusted offline device for the Deriver and Inspector. The Viewer is connected and accepts public/watch-only inputs. The Scanner is connected, but secret derivation runs in a network-disabled isolated vault and sends public lookups to the network worker. A compromised browser or operating system can still steal secrets. See [SECURITY.md](https://github.com/hobby-eng/dash-wallet-tools/blob/main/SECURITY.md).

This is an independent hobby project, not an official Dash product. Ready-made open-source cryptographic libraries do not establish the safety of their integration. See [attribution](https://github.com/hobby-eng/dash-wallet-tools/blob/main/ATTRIBUTION.md) and [third-party licenses](https://github.com/hobby-eng/dash-wallet-tools/blob/main/THIRD_PARTY_NOTICES.md).

## Releases and documentation updates

After a stable release is published in the canonical repository, **Build and publish Dash Community release** detects it automatically on its 15-minute schedule. It skips tags already present here, rebuilds the same canonical tag, verifies the Dash-only bundle and checksums, creates attestations, and publishes the Dash release. GitHub scheduling may add delay. Maintainers can also run it manually with `source_ref` and `release_tag` both set to the same canonical tag. No cross-repository write token is required.

**Sync canonical documentation** automatically refreshes these documents every hour from canonical `main`; it can also be run manually. It updates documentation only and does not publish HTML or change existing releases. Edit the templates and notices in the canonical repository, rather than editing generated copies here.

Documentation source: [{{SOURCE_SHA}}](https://github.com/hobby-eng/multi-chain-wallet-tools/blob/{{SOURCE_SHA}}). The machine-readable origin and file hashes are recorded in [documentation-source.json](https://github.com/hobby-eng/dash-wallet-tools/blob/main/documentation-source.json).
