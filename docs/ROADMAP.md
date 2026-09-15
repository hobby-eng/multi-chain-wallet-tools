# Roadmap

This file tracks planned capabilities and upstream changes that require follow-up before support can be claimed.

## Dash Platform asset-lock funding

- [ ] Add independent discovery of unused Identity registration/top-up asset-lock credits when Dash Platform and Evo SDK expose a proof-verifiable query for locating the relevant asset-lock outputs and determining their consumed state.

The current scanner only enriches a Dash Platform Identity that was already discovered. When Platform Explorer reports its Core funding transaction, the scanner loads that transaction and compares its asset-lock credit-key hash with locally derived registration funding keys. It does not currently claim that an empty Identity result proves there are no unused asset-lock credits.

Acceptance requires a regression fixture in which the funding resource exists without a discoverable Identity, plus an authoritative consumed/unconsumed result. Scanning an ordinary P2PKH address balance is insufficient because asset-lock credits are represented by the transaction payload and Platform state rather than by an unspent payment-address balance alone.

## Native Electrum seeds

- [ ] Consider a separate native Electrum seed-format mode with explicit seed-version detection, independent derivation vectors and clearly stated wallet/path coverage. Do not add it implicitly to BIP39 input. No native Electrum seed support is claimed today.

## Modular Activity Viewer extensions

These are future opt-in build modules. Single-address and batch queries remain part of the base Activity Viewer rather than separate features.

- [ ] **Watch-only activity (`watch-only-activity`).** Accept an xpub or descriptor and aggregate wallet activity without accepting a seed phrase or spending key. Reuse the public-input guard and watch-only detection packages, and keep the network boundary limited to derived public addresses.
- [ ] **Transaction details (`transaction-details`).** Expand discovered transactions into inputs, outputs, fees, confirmation state and coin-specific metadata, with exact integer amounts and links back to the queried address or wallet.
- [ ] **Snapshot comparison (`snapshot-compare`).** Export a public, versioned activity snapshot and compare it with a later snapshot locally to show new transactions, balance changes and confirmation changes without storing secrets.
- [ ] **Address labels (`address-labels`).** Let users attach local labels to public addresses and group results. Keep labels local to the page/export and never send them to providers.
- [ ] **Ethereum token activity (`ethereum-tokens`).** Add ERC-20 balances and transfer history behind the Ethereum coin module, with contract-address validation, token decimals and explicit provider completeness limits.
- [ ] **Advanced activity export (`activity-export-advanced`).** Add optional detailed CSV/JSON/ledger exports if transaction-level records outgrow the base export, preserving amount units, provenance and completeness metadata.
- [ ] **Wallet summary (`wallet-summary`).** Combine multiple public addresses or watch-only branches into one deduplicated balance and history summary while retaining per-address evidence and avoiding double-counted transactions.

Each module requires its own UI fragment, entrypoint, tests and artifact markers so an excluded module contributes no button, handler, provider code or dependency to a feature-selective HTML build. Coin selection remains independent: choosing Dash includes all currently supported Dash address and activity types in the base viewer.

## Shared address-history modules

- [ ] Move the network/history modules currently imported by Multi-Chain Activity Viewer from Discovery Scanner into a shared package, preserving existing security and edition-isolation tests.

## Dash address and descriptor evolution

- [ ] Monitor Dash Core releases, DIPs and descriptor/RPC documentation for new address/script types and corresponding descriptor expressions. Current account descriptor exports cover Core L1 P2PKH via `pkh(...)` only (BIP44, legacy mobile and mobile DIP9 CoinJoin paths). Do not assume a new Platform or Orchard address format is a Core descriptor.
- [ ] When upstream support is specified and available, verify mainnet/testnet address and key encodings, derivation paths, public/private descriptor syntax, checksum rules and minimum Core version. Add independent vectors and Core import/derive-address tests before enabling generation, scanner detection or export.

References: [Dash Core releases](https://github.com/dashpay/dash/releases), [DIPs](https://github.com/dashpay/dips), [descriptor utilities](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-util.html#deriveaddresses), [importdescriptors](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-wallet.html#importdescriptors).

## September 2026 audit follow-up

See [the detailed review](audits/audit-06-2026-09-12.md) for public reproductions and priorities.

- [x] Fix MuSig descriptor multipath validation before branch substitution, preserving original grammar and origins through script-tree parsing. Add valid aggregate and invalid participant/aggregate combinations.
- [x] Validate BIP174 hash-preimage field widths and commitments; define which remaining known fields are structurally or semantically verified.
- [x] Cover valid legacy uncompressed `sh(pkh(KEY))` compilation and distinguish recognized-only descriptor forms from validated forms.
- [x] Recover missing earlier pagination/network/copy-out regression cases against current modules; add Docker failure-cleanup simulation without invoking Docker.
- [x] Replace the premature Blob Worker teardown with one shared readiness contract, keep controls in an explicit cryptography-initialisation state, and cover immediate Clear, Cancel, and protocol changes in Chromium and Firefox. Keep the Inspector badge explicitly limited to parser boundary checks rather than implying a cryptographic startup self-test.
- [ ] Consolidate descriptor checksum and grammar helpers, then split Inspector workflows and Deriver BIP85/BIP38/signing controllers along their existing state boundaries. Preserve compile-time edition isolation.
