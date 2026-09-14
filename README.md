# Multi-Chain Wallet Tools

[![Source and artifact checks](https://github.com/hobby-eng/multi-chain-wallet-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/hobby-eng/multi-chain-wallet-tools/actions/workflows/ci.yml)

This documentation describes **v0.1.4**, released on 2026-09-13. Both editions are built from the same tagged source revision.

Multi-Chain Wallet Tools is a set of four portable wallet utilities delivered as standalone HTML files. Download the tool you need, verify its checksum, and open it in a current browser. No installation or server is required.

The same source tree produces two editions:

- **Multi-Chain Edition** is the universal and extensible edition. It currently supports Bitcoin, Ethereum, and Dash.
- **Dash Community Edition** contains only Dash Core, Platform Payments, Identity, and Orchard features. Its visual design follows the official Dash BrandBook and Brand Guidelines.

This is an independent hobby project. It is not an official Dash product or a replacement for a hardware or standard wallet.

## Choose a tool

| Tool | Works | Use it to |
| --- | --- | --- |
| **Wallet Key Derivation Tool** | Offline | Generate or enter a 12-, 15-, 18-, 21-, or 24-word English BIP39 phrase, then derive addresses, public keys, account descriptors, and reveal-gated private material |
| **Wallet Activity Viewer** | Connected | Inspect public address, Identity, or Orchard viewing activity without spending authority |
| **Wallet Discovery Scanner** | Connected, with an isolated Secret Vault | Find supported accounts and previously used addresses from BIP39 candidates or watch-only public keys/descriptors |
| **PSBT & Multisig Inspector** | Offline | Inspect PSBTs, scripts, descriptors, and test multisig policies without signing or broadcasting |

### Wallet Key Derivation Tool

Use the Deriver on a trusted offline computer whenever real seed phrases or private keys are involved.

- Derives Bitcoin Legacy, Nested SegWit, Native SegWit and Taproot addresses; Ethereum EOAs; and supported Dash Core, Platform Payment, Identity, multisig-cosigner, and Orchard material.
- Checks the entered phrase locally with Seed Diagnostic: word count, English BIP39 membership, checksum, NFKD normalization, entropy/checksum sizes, typo suggestions, and the passphrase-sensitive BIP32 master fingerprint.
- Shows receive and optional change/internal results in separate tabs with paging, selection, copy, and download controls.
- Creates QR codes locally for public payment addresses only. Secret keys, phrases, paths, and metadata never receive QR actions.
- Includes optional local signing of any message with the derived Bitcoin or Dash key, using pinned and tested cryptographic libraries without importing the key into a wallet. Transaction signing and broadcasting are not implemented, which keeps spending operations outside the tool’s security boundary.
- Exports public or private Bitcoin/Dash Core account descriptors. Public descriptors are watch-only; private descriptors grant account spending access.
- Offers BIP38 encryption for supported compressed Bitcoin/Dash P2PKH private keys.
- In Multi-Chain, derives BIP85 child BIP39 phrases, WIFs, XPRVs, and hex entropy. A child phrase can be opened immediately as a temporary child-wallet context, with a visible path back to the parent, so its addresses can be reviewed without another page or window.
- In Multi-Chain, derives BIP352 Silent Payment addresses and their scan/spend paths. It does not scan the blockchain for Silent Payments.

The input is BIP39; native Electrum seed phrases are not supported. The path follows the selected standard scheme. Account, branch, start index, and result count remain editable where that scheme defines them, while arbitrary custom path templates are deliberately excluded from the Deriver.

[Detailed Deriver instructions](apps/key-derivation/README.md)

### Wallet Activity Viewer

The Viewer accepts public or watch-only input and retrieves fresh public state without storing a wallet secret.

- Multi-Chain views Bitcoin and Ethereum public addresses plus Dash Core, Platform Payments, Identity, and Orchard records. Dash Community contains the same Dash workflows without other coins.
- Single and Batch modes show current balance/state, confirmed history, transaction counts, lifetime totals, and first/last activity when complete provider data is available.
- Dash Auto mode recognizes unambiguous Core, Platform, Identity, and Orchard formats; Advanced mode lets the user specify the record type.
- Identity results organize proof-verified state, names, registered keys and their actual roles, activity, documents, contracts, withdrawals, and tokens.
- Orchard FVK, IVK, and OVK modes decrypt the corresponding view of proof-verified encrypted-note pages locally. Viewing keys remain privacy-sensitive even though they cannot spend.
- Dash reports export to CSV, XLSX, or structured JSON without the supplied Orchard viewing key. Exact large integer amounts remain text-safe.
- Incomplete histories and provider disagreements stay visible; the application does not turn a failed lookup into a zero balance.

Public lookups reveal the queried identifier and source IP to the selected provider. The Viewer rejects mnemonic, WIF, extended-private-key, raw-private-key, and structured private-material patterns before opening a request.

[Detailed Viewer instructions](apps/activity-viewer/README.md)

### Wallet Discovery Scanner

The Scanner searches supported standard wallet paths from one or many BIP39 candidates, public keys, or descriptors.

- Scans Bitcoin Legacy, Nested SegWit, Native SegWit, and Taproot receive/change chains; three common Ethereum EOA layouts; and independently selected Dash Core, Platform Payment, Identity, and Orchard families.
- Includes previously used addresses whose current balance is zero and continues through the configured post-use gap.
- Provides Single and Batch modes for both seed phrases and public keys. It refuses to guess the coin when extended-key encodings are shared.
- The automatic candidate workflow checks a prepared list of BIP39 candidates across selected coins and summarizes which candidate/coin combinations contain funds or prior activity.
- An optional custom-path editor supports a fully editable path and inclusive account range for advanced recovery cases.
- Accepts supported Bitcoin and Dash Core public descriptors and labelled Dash legacy scan keys.
- Loads history details through coin adapters, displays incomplete coverage explicitly, and exports public findings as CSV or JSON without phrases, passphrases, extended public keys, or Orchard viewing keys.
- Every explicit scan requests fresh provider state; prior balance/history results are not reused as a cache.

Seed derivation runs in a network-denied Secret Vault. Only validated public lookup material crosses to the Network Worker. A public key covers only paths reachable below that key; a seed phrase and its passphrase provide the broadest supported search. The Scanner never creates, signs, or broadcasts transactions.

[Detailed Scanner instructions](apps/discovery-scanner/README.md)

### PSBT & Multisig Inspector

The Inspector is an offline review and test-policy utility for Bitcoin and Dash Core.

- Decodes supported Bitcoin PSBT v0/v2 and Dash PSBT v0 fields, unknown/proprietary records, transactions, scripts, supplied input values, and fees when the required UTXOs are present.
- Shows a per-input verification matrix so structural checks are distinguishable from relationships the utility has not proven.
- Decodes raw Script, common descriptors, and supported Bitcoin Miniscript/Tapscript constructions into inspectable operations and policy summaries.
- Builds concrete or ranged public-key-only multisig/watch-only policies, addresses, scripts, checksummed descriptors, and Core import data for supported Bitcoin/Dash cases.
- Supports timelock, hashlock, staged recovery, Taproot script-path, and MuSig2 inspection/construction only within the explicitly documented Bitcoin scope.
- Verifies supported Bitcoin BIP322 and Dash compact-message proofs.
- Locally decrypts supported BIP38 keys in batches; recovered private material stays masked until revealed.

It does not sign, finalize, fund, query UTXOs, persist data, or broadcast transactions. This is the newest and most experimental tool. Use valueless examples or testnet funds until the complete wallet workflow and recovery procedure have been independently verified.

[Detailed Inspector instructions](apps/psbt-inspector/README.md)

## Safety boundaries

- Keep the Deriver and Inspector offline. Their Content Security Policy blocks runtime network access.
- The Viewer accepts public/watch-only material and rejects private-material patterns before lookup.
- The Scanner is connected, but its Secret Vault cannot access the network. A compromised host or browser still remains outside this isolation boundary.
- None of the tools restores funds, signs recovery transactions, or broadcasts them. Verify findings and imports in a standard wallet.
- Exports containing private descriptors or private keys grant spending access. Treat them like the seed phrase.

The project has extensive automated checks but has not received an independent cryptography-specialist audit. See the [security model and current limitations](SECURITY_AUDIT.md).

For source reviewers, the applications depend on shared packages with one-way responsibilities: `crypto-core` and `coin-protocols` own cryptographic primitives and derivation; `secret-boundary`, `secret-vault`, and `network-boundary` own the connected-tool trust boundaries; `public-data-providers` owns Bitcoin/Ethereum public reads; and `wallet-recovery` owns reusable watch-only detection and bounded recovery searches. Build checks reject cross-app imports, package-to-application imports, package dependency cycles, and non-allowlisted modules in Dash Community artifacts. See [Architecture](docs/ARCHITECTURE.md) for the complete dependency and execution model.

## Supported standard derivation defaults

These are the main defaults, not an exhaustive list of every optional recovery family or descriptor form.

| Protocol | Default receive path or model | Result |
| --- | --- | --- |
| Bitcoin Legacy | `m/44'/0'/account'/0/index` | P2PKH |
| Bitcoin Nested SegWit | `m/49'/0'/account'/0/index` | P2SH-P2WPKH |
| Bitcoin Native SegWit | `m/84'/0'/account'/0/index` | P2WPKH |
| Bitcoin Taproot | `m/86'/0'/account'/0/index` | BIP86 P2TR |
| Ethereum EOA | `m/44'/60'/account'/branch/index` | EIP-55 address |
| Dash Core | `m/44'/5'/account'/0/index` | P2PKH |
| Dash legacy mobile Core | `m/account'/0/index` | P2PKH |
| Dash Mobile CoinJoin | `m/9'/5'/4'/0'/0/index` | DIP9 P2PKH |
| Dash Platform Payment | `m/9'/5'/17'/account'/0'/index` | DIP17/DIP18 receive address |
| Dash Identity candidate | `m/9'/5'/5'/0'/0'/identity_index'/key_id'` | DIP13 registration key profile |
| Dash Orchard | `m/32'/5'/account'` plus diversifier index | Shielded address and key material |

For Bitcoin and Dash Core, change normally uses branch `/1`. Dash Platform's optional internal/change-like results use the separate hardened key class `1'`. Testnet changes the applicable coin type and network encoding. Advanced Dash recovery families, exact semantics, and authoritative references are documented in [How Dash support works](docs/DASH.md) and the [detailed Dash reference](docs/reference/DASH_IMPLEMENTATION.md).

## Download and verify

Download Multi-Chain HTML files and their `.sha256` sidecars from [GitHub Releases](https://github.com/hobby-eng/multi-chain-wallet-tools/releases). [Dash Community releases](https://github.com/hobby-eng/dash-wallet-tools/releases) are built from this same canonical source tree and distributed separately.

On Linux, verify the Multi-Chain files you downloaded:

```bash
sha256sum -c Wallet_Key_Derivation_Tool.html.sha256
sha256sum -c Wallet_Activity_Viewer.html.sha256
sha256sum -c Wallet_Discovery_Scanner.html.sha256
sha256sum -c PSBT_Multisig_Inspector.html.sha256
```

`SHA256SUMS` covers the complete release asset set. The **Source/build fingerprint** inside an HTML Release passport identifies its source and embedded build inputs; it is not that HTML file's checksum. Release provenance attestations and `verification-record.json` connect the GitHub Actions build to its source revision and artifact hashes.

## Documentation map

Start with the document that matches what you need:

- [How Dash support works](docs/DASH.md) explains the four Dash resource models, tool roles, and data flow without implementation-level detail.
- [Dash implementation and verification reference](docs/reference/DASH_IMPLEMENTATION.md) records exact paths, encodings, upstream pins, trust boundaries, protocol behavior, and verification fixtures.
- [Architecture](docs/ARCHITECTURE.md) describes application/package ownership and the Scanner's Secret Vault boundary.
- [Account descriptor guide](docs/ACCOUNT_DESCRIPTORS.md) explains Bitcoin and Dash Core descriptor scope and import requirements.
- [Verification map](docs/VERIFICATION.md) lists the checks run locally and in CI.
- [Security audit](SECURITY_AUDIT.md), [audit records](docs/audits/README.md), and [roadmap](docs/ROADMAP.md) document reviewed risks, evidence, and planned work.
- [Third-party notices](THIRD_PARTY_NOTICES.md) and [attribution](ATTRIBUTION.md) identify dependencies and upstream work.
- Developers can use [EXTENDING.md](EXTENDING.md) and [RELEASING.md](RELEASING.md).

## Build from source

The canonical release build uses a pinned Linux/amd64 Docker environment and runs the complete verification suite before copying artifacts to `dist/`:

```bash
./tooling/build-reproducible.sh
```

Use `./tooling/build-reproducible.sh --wasm` only when intentionally regenerating the committed Dash Orchard browser WASM. Native development requires Node.js 24+, pnpm 11.25.0, Rust/Cargo 1.98.1 with `wasm32-unknown-unknown`, and `wasm-bindgen-cli` 0.2.128:

```bash
pnpm install --frozen-lockfile
RUSTUP_TOOLCHAIN=1.98.1 pnpm verify
```

Generated editions appear under `dist/multi-chain-edition/` and `dist/dash-community-edition/`. Exact commands, toolchain rules, release contents, and GitHub provenance steps are documented in [RELEASING.md](RELEASING.md).

## Data sources and limitations

Connected Bitcoin workflows use public address/index services, Ethereum uses public JSON-RPC and indexed history providers, and Dash uses DashScan, proof-verified Dash Platform DAPI, compatible indexed metadata, and the pinned Dash Orchard implementation. Provider failures are reported explicitly rather than converted into a false zero balance.

Providers and protocols can evolve. Exact supported behavior and pins live in the detailed reference documents, tests, and lockfiles. Test with an empty wallet first and independently verify valuable-wallet results in a standard wallet.

## License

Original project code is released under the [MIT License](LICENSE), copyright (c) 2026 hobby-eng. Third-party components retain their own licenses and copyright notices.
