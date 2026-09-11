# Wallet Key Derivation Tool

The derivation form displays the fixed purpose, coin type and selected scheme from the same adapter that defines the standard path. The path is read-only: account, address branch controls, start index and result count remain editable where supported. Receive/change generation retains its existing checkbox. Identity has no account control; Orchard labels its diversifier index explicitly. Legacy mobile paths do not display nonexistent purpose/coin levels. There is no arbitrary-path mode in this tool.


Offline, standalone BIP39/BIP32/ZIP-32 derivation. The extensible Multi-Chain edition currently includes Bitcoin, Ethereum, and Dash (Core BIP44, legacy mobile Core, Platform payments, Platform Identity keys, and Orchard). Dash Community is Dash-only and compiles only those five Dash adapters. Build outputs: `dist/multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html` and `dist/dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html`.

The Release passport contains the self-test result, deterministic build identity, checksum sidecar name, and embedded dependency versions/licenses. The former duplicate expandable dependency footer has been removed.

This independent tool uses the official open-source Dash Orchard fork and Dash Platform specifications without claiming authorship or endorsement. See the repository [attribution](../../ATTRIBUTION.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).

Original project code is released under the repository's [MIT License](../../LICENSE); embedded dependencies retain their separately listed licenses.

The main UI loads protocol metadata only. All runtime key derivation and the single Orchard WASM instance execute in a disposable Blob worker. The final HTML has `connect-src 'none'`, no external assets, no storage APIs and no runtime install requirement.

Bitcoin Legacy, Nested SegWit, Native SegWit and Taproot plus Dash Core can optionally derive the standard internal/change branch `/1` alongside the receive branch `/0`. Dash legacy mobile exposes the historical `m/account'/0/i` receive and `m/account'/1/i` change paths through the same two result tabs. Receive and Change have independent row selection, paging, copy/download state and branch-specific Bitcoin watch-only descriptors. Ethereum keeps its explicit address-branch selector pending the separate custom-path/preset work; Dash Platform uses the same Receive/Change result tabs for DIP17's hardened receive class `0'` and optional internal/change class `1'`; Orchard diversifiers retain their own controls.

Every derived public payment address has an on-demand offline QR preview beside its copy action. Bitcoin, Ethereum, and Dash Core use their canonical address-only URI schemes; Platform and Orchard encode the exact address because no broader payment-URI mapping is assumed. Mnemonics, private/public keys, descriptors, viewing keys, Identity keys, paths, fingerprints, and metadata never receive QR actions.

The **Also generate change addresses** checkbox appears only for adapters that explicitly declare receive/internal address selectors. It is off by default. When enabled, the same account, network, start index and result count are derived once for each selector: `/0` and `/1` for Core/BIP44, or hardened `0'` and `1'` classes for Dash Platform; the first tab remains **Receive addresses** and the second tab contains **Change addresses**. Automatic derivation, manual derivation, cancellation, known-address search, Basic/Advanced display, secret reveal, selection, copy and download all respect the active branch. Disabling the checkbox discards the change result rather than silently mixing it with receive rows.

Build only this artifact after generated WASM is already verified:

```bash
pnpm build:quick
node apps/key-derivation/scripts/verify-key-derivation-artifact.mjs
```

For a release, use the root `pnpm verify` command instead. Read [SECURITY.md](SECURITY.md) before handling valuable material and the root [extension guide](../../EXTENDING.md) before adding a coin.

For Dash Platform, leave **Also generate change addresses** off to derive receive addresses, or enable it for both receive and internal/change addresses. The advanced numeric Key class input is replaced by this standard choice; the underlying derivation library still accepts explicit classes. A receive-class xpub cannot derive the separate hardened internal class, so each result tab exposes its own xpub.

Legacy mobile Account selects the hardened root `m/account'`; zero remains the historical default. This matches [DashSync’s BIP32 account implementation](https://github.com/dashevo/dashsync-iOS/blob/master/DashSync/shared/Models/Derivation%20Paths/DSFundsDerivationPath.m). Discovery uses the selected account for both receive and change chains, on mainnet and testnet.

Legacy mobile results include **Copy public scan key** and a text-file export for the active branch. Paste the `dash-legacy-xpub:` export into Discovery Scanner; it covers that branch without revealing private keys.
