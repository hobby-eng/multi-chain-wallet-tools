# Selective build modules

Standalone HTML builds have independent coin and feature selections. With no selection flags, each edition builds its complete reviewed default. Custom builds are written below `dist/custom-builds/` and never replace canonical release artifacts.

## Security composition rules

- Key Derivation is itself an offline secret workspace: its document CSP denies network access and only its embedded derivation Worker receives mutable seed bytes. It does not need the connected-tool iframe/channel package.
- Discovery Scanner always keeps an opaque-origin, network-denied iframe boundary. Seed modes call it the Secret Vault and include the thin `secret-vault` lifecycle plus BIP39/secret derivation modules. A watch-only-only build calls it the Public Input Boundary and physically excludes mnemonic, seed-worker and `secret-vault` modules while preserving the sandbox and `connect-src 'none'` boundary.
- Mnemonics, seeds, xprvs and private keys never cross a network boundary.
- Xpubs and descriptors are privacy-sensitive public material. Networked tools derive addresses locally and send providers only the concrete addresses or identifiers required for the current bounded request.
- Orchard viewing material remains local; network workers receive only public chain-query parameters and return public chain data.
- Connected builds without Dash pin every fixed Bitcoin/Ethereum provider origin in CSP. Dash Platform discovers quorum endpoints at runtime, so a build containing Dash retains an HTTPS-scheme connection boundary while application code and request protocols still expose no arbitrary URL input.
- Network protocols use discriminated request allowlists, reject secret/private-material field names and arbitrary URLs, and minimize every request payload. The build generates an operation allowlist and dispatcher from the selected coins. The Worker validates exact envelope and payload keys, network names, public-token shape, request IDs and per-operation batch/range ceilings before dispatch; operations for excluded coins are absent from its code and rejected by construction.
- PSBT Inspector and Key Derivation remain offline regardless of selected features.
- Generated Rust modules must report the exact crates.io `wasm-bindgen 0.2.128` producer. Source-built CLIs that append Git metadata are rejected before generation, and committed WASM metadata is checked independently before verification.

## Coin bundles and application modules

`--coins` selects protocol support, not a visual edition. A selected coin contributes the complete base capability that is meaningful for that application. Internal files remain separate so their responsibilities can be reviewed and tested independently; users do not select those required pieces one by one.

Dash is one shared protocol stack, not four copied implementations. Shared address, derivation, Platform, Identity, Orchard and network primitives live in `packages/coin-protocols`, `packages/dash-network` and `packages/dash-shielded-wasm`. Each application adds only its own orchestration and presentation:

| Application       | Dash modules included by `--coins dash`                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Key Derivation    | Core, Purpose48 multisig, legacy mobile, CoinJoin, Platform payments, Identity and Orchard derivation adapters                        |
| Activity Viewer   | Core address activity plus separate Platform address, Identity and Orchard query runtimes                                             |
| Discovery Scanner | Seed/watch adapters for the enabled source modes and the complete supported Core, Platform, Identity and Orchard discovery scopes     |
| PSBT Inspector    | Dash Core parsing/formatting within every selected Inspector workflow that supports Dash; Platform and Orchard are not PSBT protocols |

Bitcoin and Ethereum follow the same rule. Optional workflows remain controlled by `--features`/`--exclude`; removing one deletes its marked HTML fragment and prevents its UI, worker and WASM entrypoints from entering the bundle graph.

## Key Derivation

Coins: `bitcoin`, `dash`, `ethereum`. Selecting Dash includes every supported Dash derivation family: Core, Purpose48 multisig, legacy mobile, CoinJoin, Platform payments, Identity and Orchard.

| Feature           | Purpose                                                                                  | Coin dependency   |
| ----------------- | ---------------------------------------------------------------------------------------- | ----------------- |
| `derive`          | Generate addresses, public keys and private keys for selected coins. Required.           | Any selected coin |
| `bip85`           | Derive child mnemonics/application secrets and open a child-wallet derivation workspace. | Any selected coin |
| `silent-payments` | Derive Bitcoin BIP352 reusable addresses and scan/spend material.                        | Bitcoin           |
| `bip38-encrypt`   | Password-encrypt compatible derived P2PKH private keys.                                  | Bitcoin or Dash   |
| `message-signing` | Sign messages using formats supported by the selected coin and address type.             | Bitcoin or Dash   |
| `wallet-matcher`  | Match known addresses against candidate mnemonics, accounts, branches and indices.       | Any selected coin |
| `seedqr`          | Encode/decode Standard SeedQR and CompactSeedQR, including QR image import/export.       | Coin-independent  |
| `slip39`          | Create and restore SLIP-39 mnemonic shares.                                              | Coin-independent  |
| `shamir`          | Create and restore versioned CKD Shamir Raw and Words shares with a share-set digest.    | Coin-independent  |
| `codex32`         | Encode and decode Codex32 BIP39-entropy or BIP32-seed records.                           | Coin-independent  |

## Activity Viewer

Coin selection is the primary composition boundary. Single and batch queries are both part of the required base viewer. Selecting Dash includes Core, Platform, Identity and Orchard activity.

Future optional modules are tracked in `ROADMAP.md`: watch-only activity, transaction details, snapshot comparison, address labels, Ethereum token activity, advanced activity export and wallet summary.

## Discovery Scanner

| Feature                | Purpose                                                                           | Secret Vault                              |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| `seed-discovery`       | Discover used wallet structures from one or many mnemonics.                       | Required                                  |
| `watch-only-discovery` | Discover activity from xpubs, descriptors and other non-spending public material. | Public Input Boundary; no seed/Vault code |
| `wallet-matcher`       | Reuse the shared matcher to locate known addresses across candidate wallets.      | Required                                  |
| `custom-paths`         | Add explicit derivation templates to selected source modes.                       | Inherits its host mode                    |

Batch processing, progress, cancellation and base export are always included.

## PSBT Inspector

Coins: `bitcoin`, `dash`. At least one workflow feature is required.

| Feature                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `psbt-decoder`         | Decode PSBT maps, transactions, UTXOs and signing commitments.       |
| `script-decoder`       | Decode raw Script and classify recognized output/spending forms.     |
| `descriptor-decoder`   | Parse descriptors, checksums, keys and policy structure.             |
| `policy-builder`       | Construct supported multisig, hashlock and timelock output policies. |
| `multisig-wallet`      | Build concrete or ranged watch-only multisig wallet artifacts.       |
| `message-verification` | Verify supported Bitcoin or Dash signed-message formats.             |
| `bip38-decrypt`        | Decrypt and validate BIP38 private keys locally.                     |

The current policy builder does not create a PSBT. A future real PSBT constructor will use the separate feature id `psbt-builder`.

## Command-line composition

With no selection flags, the canonical build contains every module allowed by its edition. `--features` and `--coins` form an inclusion list; `--exclude` and `--exclude-coins` remove items from the default or from that inclusion list. The two forms may be combined.

```sh
# Complete canonical builds for both editions
pnpm build:html

# General-design Deriver with Bitcoin and Dash, without backup codecs
pnpm build:html -- --profile multi-chain --tool key-derivation \
  --coins bitcoin,dash --exclude seedqr,slip39,shamir,codex32

# Watch-only Bitcoin/Ethereum Discovery, with no mnemonic or seed modules
pnpm build:html -- --profile multi-chain --tool discovery-scanner \
  --coins bitcoin,ethereum --features watch-only-discovery

# Bitcoin PSBT and descriptor inspection only
pnpm build:html -- --profile multi-chain --tool psbt-inspector \
  --coins bitcoin --features psbt-decoder,descriptor-decoder
```

Selective artifacts are written below `dist/custom-builds/` unless `--output path/to/file.html` is supplied. `--output` rejects every path inside either canonical edition directory; canonical release artifacts can only be written by complete profile builds. Invalid combinations fail before bundling; for example, `wallet-matcher` requires `seed-discovery`, and an Inspector build requires at least one workflow.

## Exhaustive build matrix

The matrix uses the same builders and validation rules as ordinary standalone HTML generation:

```sh
# Print the exact number of valid variants without building them
pnpm build:matrix:plan

# Print or compile the bounded representative smoke matrix
pnpm build:matrix:smoke:plan
pnpm build:matrix:smoke

# Compile every valid variant into a temporary directory, then delete it
pnpm build:matrix:check

# Keep every variant and a JSON index
pnpm build:matrix
```

The smoke matrix covers every canonical full build, every supported coin alone and every optional feature in a minimal valid composition. It is a fast regression gate, not proof of every feature interaction. The reproducible Docker build runs this bounded matrix after the canonical verification cycle, without retaining its temporary artifacts.

Saved variants use `dist/build-matrix/<profile>/<tool>/<coins>/<features>.html`. The generated `matrix-index.json` records each composition, path, byte size and SHA-256 digest. `--profile` and `--tool` may constrain any matrix command. Exhaustive mode is intentionally expensive because all optional-feature subsets are distinct builds.
