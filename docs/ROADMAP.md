# Roadmap

This file tracks planned capabilities and upstream changes that require follow-up before support can be claimed.

## Dash Platform asset-lock funding

- [ ] Add independent discovery of unused Identity registration/top-up asset-lock credits when Dash Platform and Evo SDK expose a proof-verifiable query for locating the relevant asset-lock outputs and determining their consumed state.

The current scanner only enriches a Dash Platform Identity that was already discovered. When Platform Explorer reports its Core funding transaction, the scanner loads that transaction and compares its asset-lock credit-key hash with locally derived registration funding keys. It does not currently claim that an empty Identity result proves there are no unused asset-lock credits.

Acceptance requires a regression fixture in which the funding resource exists without a discoverable Identity, plus an authoritative consumed/unconsumed result. Scanning an ordinary P2PKH address balance is insufficient because asset-lock credits are represented by the transaction payload and Platform state rather than by an unspent payment-address balance alone.

## Native Electrum seeds

- [ ] Consider a separate native Electrum seed-format mode with explicit seed-version detection, independent derivation vectors and clearly stated wallet/path coverage. Do not add it implicitly to BIP39 input. No native Electrum seed support is claimed today.

## Shared address-history modules

- [ ] Move the network/history modules currently imported by Multi-Chain Activity Viewer from Discovery Scanner into a shared package, preserving existing security and edition-isolation tests.

## Dash address and descriptor evolution

- [ ] Monitor Dash Core releases, DIPs and descriptor/RPC documentation for new address/script types and corresponding descriptor expressions. Current account descriptor exports cover Core L1 P2PKH via `pkh(...)` only (BIP44, legacy mobile and mobile DIP9 CoinJoin paths). Do not assume a new Platform or Orchard address format is a Core descriptor.
- [ ] When upstream support is specified and available, verify mainnet/testnet address and key encodings, derivation paths, public/private descriptor syntax, checksum rules and minimum Core version. Add independent vectors and Core import/derive-address tests before enabling generation, scanner detection or export.

References: [Dash Core releases](https://github.com/dashpay/dash/releases), [DIPs](https://github.com/dashpay/dips), [descriptor utilities](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-util.html#deriveaddresses), [importdescriptors](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-wallet.html#importdescriptors).

## September 2026 audit follow-up

See [the detailed review](audits/2026-09-12-03-followup-audit.md) for public reproductions and priorities.

- [x] Fix MuSig descriptor multipath validation before branch substitution, preserving original grammar and origins through script-tree parsing. Add valid aggregate and invalid participant/aggregate combinations.
- [x] Validate BIP174 hash-preimage field widths and commitments; define which remaining known fields are structurally or semantically verified.
- [x] Cover valid legacy uncompressed `sh(pkh(KEY))` compilation and distinguish recognized-only descriptor forms from validated forms.
- [x] Recover missing earlier pagination/network/copy-out regression cases against current modules; add Docker failure-cleanup simulation without invoking Docker.
- [x] Replace the premature Blob Worker teardown with one shared readiness contract, keep controls in an explicit cryptography-initialisation state, and cover immediate Clear, Cancel, and protocol changes in Chromium and Firefox. Keep the Inspector badge explicitly limited to parser boundary checks rather than implying a cryptographic startup self-test.
- [ ] Consolidate descriptor checksum and grammar helpers, then split Inspector workflows and Deriver BIP85/BIP38/signing controllers along their existing state boundaries. Preserve compile-time edition isolation.
