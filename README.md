# Multi-Chain Wallet Tools

[![Source and artifact checks](https://github.com/hobby-eng/multi-chain-wallet-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/hobby-eng/multi-chain-wallet-tools/actions/workflows/ci.yml)

Three portable wallet utilities built as standalone HTML files. Download a file, verify its SHA-256 checksum, and open it in a current browser—no installation or server required.

Dash is the first fully integrated ecosystem. The key derivation tool also supports Bitcoin and Ethereum, and the project is structured so more chains can be added later.

This is an independent hobby project, not an official Dash product and not a replacement for a hardware or standard wallet. It has extensive automated checks but has not received an independent cryptography-specialist audit.

## The three tools

### Wallet Key Derivation Tool

An offline tool for deriving wallet addresses and keys from a BIP39 seed phrase.

- Supports Bitcoin Legacy, Nested SegWit, Native SegWit and Taproot; Ethereum EOA; Dash Core, Platform and Orchard Shielded.
- Shows standard derivation paths and accepts custom paths where the protocol permits them.
- Can generate receive and change addresses for Bitcoin, Ethereum, Dash Core, also receive addresses for Dash Platform, Dash Orchard Pool.
- Displays basic results or detailed protocol-specific data, with selectable clipboard and file exports.
- Runs derivation in a disposable Web Worker and has runtime network access blocked by CSP and build verification.

Use this application on a trusted offline computer whenever real seed phrases or private keys are involved.

### Wallet Activity Viewer

A connected, read-only viewer for one Dash Core, Platform public address or Orchard viewing key.

- Looks up Dash Core address balances, history and transaction details.
- Looks up Dash Platform payment-address balances and activity.
- Scans the Dash Orchard pool with FVK, IVK or OVK viewing capability without requiring a spending key.
- Exports the loaded activity as CSV or JSON.

Public-address lookups reveal the queried address and source IP to the provider. Orchard viewing keys cannot spend funds, but they reveal privacy-sensitive wallet activity.

### Wallet Discovery Scanner

A connected recovery scanner that searches for Dash resources belonging to one or several BIP39 seed phrases.

- Lets the user independently enable Dash Core, Platform payment addresses, Platform identities and Orchard scanning.
- Scans Core receive/change branches and continues 20 addresses past the last used address.
- Supports large ranges through bounded batches with progress and cancellation.
- Shows funded resources by default; historical zero-balance activity is optional.
- Exports component-aware CSV and JSON reports containing only relevant fields and no seed phrase or private key.
- Never creates, signs or broadcasts transactions. Recover found funds with a standard Dash wallet.

The scanner isolates mnemonic-based derivation inside a sandboxed, network-denied Secret Vault. Only validated public addresses, public-key hashes and Orchard pool ranges cross the typed boundary to the separate network worker.

## Download and verify

Download the three HTML files and their `.sha256` sidecars from [GitHub Releases](https://github.com/hobby-eng/multi-chain-wallet-tools/releases). `SHA256SUMS` covers the complete release asset set.

The SHA-256 value labelled **Source/build fingerprint** inside each file's Release passport is not the checksum of that HTML file. It identifies the source and embedded build inputs used to create it. Verify the downloaded HTML itself with its external `.sha256` sidecar or the release `SHA256SUMS` file.

On Linux:

```bash
sha256sum -c Wallet_Key_Derivation_Tool.html.sha256
sha256sum -c Wallet_Activity_Viewer.html.sha256
sha256sum -c Wallet_Discovery_Scanner.html.sha256
```

The key derivation tool is designed for direct `file://` use on an offline machine. The viewer and scanner require network access for blockchain data.

Official release checksums refer to artifacts produced by the repository's pinned Linux/amd64 Docker build. A native rebuild on another operating system can pass the same cryptographic and artifact tests yet still have different byte-level WASM, passport fingerprint and final HTML checksum. Use the canonical container when exact release-byte reproduction is required.

## Supported derivation defaults

| Protocol | Default receive path / model | Main result |
| --- | --- | --- |
| Bitcoin Legacy | `m/44'/0'/0'/0/i` | P2PKH |
| Bitcoin Nested SegWit | `m/49'/0'/0'/0/i` | P2SH-P2WPKH |
| Bitcoin Native SegWit | `m/84'/0'/0'/0/i` | P2WPKH |
| Bitcoin Taproot | `m/86'/0'/0'/0/i` | BIP86 P2TR |
| Ethereum EOA | `m/44'/60'/0'/0/i` | EIP-55 address |
| Dash Core | `m/44'/5'/0'/0/i` | P2PKH |
| Dash Platform | `m/9'/5'/17'/0'/0'/i` | DIP17/DIP18 address |
| Dash Identity | `m/9'/5'/5'/0'/0'/i'/0'` | DIP13 authentication key |
| Dash Orchard | `m/32'/5'/account'` + diversifier index | Shielded address and viewing/spending material |

Bitcoin and Dash support mainnet/testnet separation. Optional change generation uses branch `/1` for Bitcoin and Dash Core. Exact protocol choices and pinned upstream references are documented in [DASH_IMPLEMENTATION.md](DASH_IMPLEMENTATION.md).

## Security and verification

Every release is built from locked npm and Cargo dependency graphs. Startup remains fail-closed until deterministic cryptographic tests pass. Coverage includes BIP39/BIP32, Bitcoin BIP49/BIP86, Ethereum EIP-55, Dash Core BIP44, Platform DIP17/DIP18, Identity DIP13, and Dash Orchard ZIP32 on mainnet and testnet.

The release pipeline also runs TypeScript tests, independent derivation comparisons, native Rust tests, generated-WASM boundary tests, CSP/static checks, secret-egress tests, reproducible HTML builds, checksum verification and artifact provenance attestation. GitHub Actions and local release builds use the same pinned Docker toolchain.

These checks greatly reduce integration and packaging risk; they do not prove that browsers, operating systems or this project are free of vulnerabilities. Test with an empty wallet first and independently verify valuable-wallet findings in a standard wallet.

See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for the threat model and known limitations, and [Architecture](docs/ARCHITECTURE.md) for the Secret Vault/network boundary and package ownership.

## Build from source

### Canonical reproducible build

Docker is used to make the release bytes independent of the developer's Linux distribution and locally installed compiler versions. The image is based on Ubuntu 24.04, pinned by immutable digest, and installs exact Node.js, pnpm, Rust and wasm-bindgen versions. Downloaded tool installers are checksum-verified. Dependencies are fetched in an earlier image layer; the final complete verification and build run with network access disabled.

Requirement: Docker Engine or Docker Desktop with BuildKit. Node.js, pnpm, Rust and Cargo are installed only inside the image.

```bash
./tooling/build-reproducible.sh
```

This builds and tests the complete project inside the canonical Linux/amd64 container and copies the verified files to `dist/`. The first run downloads the base image and toolchains and can be slow; Docker reuses them from its local cache afterward. No Docker image or cache is committed to Git or included in a release.

Developers who already have Node.js and pnpm can use the equivalent convenience command `pnpm build:reproducible`. Pass `--wasm` to the shell script, or run `pnpm build:reproducible:wasm`, when intentionally regenerating the committed browser WASM.

If the pinned Rust source is intentionally changed, run `./tooling/build-reproducible.sh --wasm`, inspect and commit the resulting `packages/dash-shielded-wasm/generated/` diff, and then run `./tooling/build-reproducible.sh`. An unexpected WASM difference makes the normal canonical build fail.

### Native development build

A native build is useful for fast development and runs the same functional, cryptographic and artifact checks. Its generated binary bytes are not the canonical release identity because linkers and system libraries can vary by host.

Requirements:

- Node.js 24+
- pnpm 11.25.0
- Rust/Cargo 1.98.1 with `wasm32-unknown-unknown` (the Rust crate retains MSRV 1.85.1)
- `wasm-bindgen-cli` 0.2.127

```bash
pnpm install --frozen-lockfile
rustup toolchain install 1.98.1
rustup target add wasm32-unknown-unknown --toolchain 1.98.1
cargo +1.98.1 install wasm-bindgen-cli --version 0.2.127 --locked
pnpm verify
```

Generated files are written to:

```text
dist/key-derivation/Wallet_Key_Derivation_Tool.html
dist/activity-viewer/Wallet_Activity_Viewer.html
dist/discovery-scanner/Wallet_Discovery_Scanner.html
dist/SHA256SUMS
```

For individual application instructions, see:

- [Wallet Key Derivation Tool](apps/key-derivation/README.md)
- [Wallet Activity Viewer](apps/activity-viewer/README.md)
- [Wallet Discovery Scanner](apps/discovery-scanner/README.md)

Contributor references: [EXTENDING.md](EXTENDING.md), [RELEASING.md](RELEASING.md), [architecture](docs/ARCHITECTURE.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## Project status and data sources

The connected tools currently use DashScan for Dash Core history, proof-verified Dash Platform DAPI for authoritative Platform state, Platform Explorer for compatible historical metadata, and the pinned official Dash Orchard fork for shielded derivation/scanning. Provider failures are reported explicitly and never converted into a false zero balance.

Network providers and protocol dependencies may evolve. Their exact versions, licenses and upstream projects are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [ATTRIBUTION.md](ATTRIBUTION.md).

## License

Original project code is released under the [MIT License](LICENSE), copyright (c) 2026 hobby-eng. Third-party components retain their own licenses and copyright notices.
