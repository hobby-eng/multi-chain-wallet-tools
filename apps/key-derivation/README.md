# Wallet Key Derivation Tool

Offline, standalone BIP39/BIP32/ZIP-32 derivation for Bitcoin, Ethereum, Dash Core, Dash Platform and Dash Orchard. Build output: `dist/key-derivation/Wallet_Key_Derivation_Tool.html`.

The Release passport contains the self-test result, deterministic build identity, checksum sidecar name, and embedded dependency versions/licenses. The former duplicate expandable dependency footer has been removed.

This independent tool uses the official open-source Dash Orchard fork and Dash Platform specifications without claiming authorship or endorsement. See the repository [attribution](../../ATTRIBUTION.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).

Original project code is released under the repository's [MIT License](../../LICENSE); embedded dependencies retain their separately listed licenses.

The main UI loads protocol metadata only. All runtime key derivation and the single Orchard WASM instance execute in a disposable Blob worker. The final HTML has `connect-src 'none'`, no external assets, no storage APIs and no runtime install requirement.

Bitcoin Legacy, Nested SegWit, Native SegWit and Taproot plus Dash Core can optionally derive the standard internal/change branch `/1` alongside the receive branch `/0`. Receive and Change are separate result tabs with independent row selection, paging, copy/download state and branch-specific Bitcoin watch-only descriptors. Ethereum keeps its explicit address-branch selector pending the separate custom-path/preset work; Dash Platform key classes and Orchard diversifiers are not mislabeled as change branches.

The **Also generate change addresses** checkbox appears only for adapters that explicitly declare the standard two-branch model. It is off by default. When enabled, the same account, network, start index and result count are derived once under `/0` and once under `/1`; the first tab remains **Receive addresses** and the second tab contains **Change addresses**. Automatic derivation, manual derivation, cancellation, known-address search, Basic/Advanced display, secret reveal, selection, copy and download all respect the active branch. Disabling the checkbox discards the change result rather than silently mixing it with receive rows.

Build only this artifact after generated WASM is already verified:

```bash
pnpm build:quick
node apps/key-derivation/scripts/verify-key-derivation-artifact.mjs
```

For a release, use the root `pnpm verify` command instead. Read [SECURITY.md](SECURITY.md) before handling valuable material and the root [extension guide](../../EXTENDING.md) before adding a coin.
