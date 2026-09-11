# Account descriptor exports

The Key Derivation Tool's **Account export** panel exports the selected account and address profile. It is not a complete seed backup. The xprv is the account key, not the master key. The origin `[fingerprint/path]` describes where that key came from; it must not be applied again to the account key.

| Profile | Descriptor expression | Account origin on mainnet |
| --- | --- | --- |
| Bitcoin Legacy | `pkh(KEY)` | `m/44'/0'/account'` |
| Bitcoin Nested SegWit | `sh(wpkh(KEY))` | `m/49'/0'/account'` |
| Bitcoin Native SegWit | `wpkh(KEY)` | `m/84'/0'/account'` |
| Bitcoin Taproot | `tr(KEY)` | `m/86'/0'/account'` |
| Dash Core | `pkh(KEY)` | `m/44'/5'/account'` |
| Dash legacy mobile | `pkh(KEY)` | `m/account'` |
| Dash Mobile CoinJoin | `pkh(KEY)` | `m/9'/5'/4'/account'` |

Testnet uses coin type `1'` where a coin-type segment exists and tpub/tprv version bytes. Legacy mobile has no coin-type segment. Taproot exports the untweaked BIP32 account key; `tr()` applies the required output-key construction. Dash exports do not describe Platform, Identity or Orchard resources.

Raw descriptor exports contain exactly two descriptors with BIP380 checksums: `/0/*` receive and `/1/*` change. This avoids requiring multipath `/<0;1>/*` support. The pair covers future child indices too, not just the rows displayed in the tool. Another account or address profile requires its own export.

**Public descriptors** contain xpub/tpub only. **Private descriptors** contain unencrypted xprv/tprv and permit spending from that account. The checksum detects transcription errors; it provides no encryption. Private descriptors are available only through explicit private copy/download actions after revealing sensitive values. No descriptor secret is placed in DOM attributes or displayed automatically by the export panel.

## Non-default accounts

Only change the default scheme or account when you know the source wallet’s derivation path. A different account produces different keys and addresses; other wallets may not discover its funds automatically. Exports preserve the selected account, including a nonzero account number. The deriver supports the selected scheme’s account controls, not arbitrary custom path templates.

## Core import

Use a descriptor-enabled wallet on the correct coin and network. Public descriptors require a wallet with private keys disabled; importing private descriptors requires a wallet that accepts private keys. Dash documents `importdescriptors` starting with Core 21.0.0. Bitcoin Taproot additionally requires a Core version supporting `tr()` and descriptor wallets.

The default export is a one-line `importdescriptors` console command containing both descriptors, with `internal: false` for receive and `internal: true` for change. Copy it into the selected wallet’s Core console, or open the downloaded `.core-import.txt` file and copy its contents. It is not a GUI wallet-backup import file. The command uses `timestamp: 0` and `active: true` for both branches, and omits `range` and `next_index`. Core chooses its initial keypool range and can extend active branches as addresses are used or requested. This is not an exhaustive search of every possible index: activity beyond a large unused gap may require an explicitly larger range and another rescan. A default-keypool-range warning is expected when Core reports it. Activating an imported descriptor replaces the active descriptor for that output type and branch; use a separate wallet to preserve another account's active address generation. The `/*` descriptors themselves remain capable of deriving later indices and are independent of displayed rows.

Set `timestamp` to a time preceding the wallet's activity, or `0` for a full historical rescan. `"now"` skips old history and is appropriate only for known-unused outputs. Rescan availability also depends on available blockchain data. Check the RPC result for both descriptors and compare derived addresses against the tool before relying on the import.

A public key cannot prove its complete hardened ancestry or uniquely identify a coin: Bitcoin and Dash share extended-key version bytes. Choose the intended coin/network rather than inferring it solely from the xpub prefix.

## Scanner handoff

Select **Raw descriptors · Scanner / other wallets**, then **Copy public descriptors** to copy both receive and change descriptors. Open **Account export** to access copy and download actions. Scanner also accepts the two public Dash descriptor lines when Dash is selected, or with `dash-descriptor:` before each line. Each descriptor covers only its declared branch; multipath `/<0;1>/*` is not supported. Paste into Scanner's public-key tab. Private descriptor files are for the destination signing wallet; Scanner's public-key tab rejects them.

## Verification and references

Automated tests compare exported account descendants on both networks with independent ethers HD derivation, check both branches and a later index, retain existing Bitcoin address vectors, and verify the published Dash descriptor checksum example. These checks are not a claim that a live Core RPC import was executed.

- [Bitcoin Core descriptor language](https://github.com/bitcoin/bitcoin/blob/master/doc/descriptors.md)
- [Dash descriptor utilities and xpub/xprv syntax](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-util.html#deriveaddresses)
- [Dash importdescriptors and listdescriptors](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-wallet.html#importdescriptors)
- [BIP380 checksum specification](https://github.com/bitcoin/bips/blob/master/bip-0380.mediawiki)
- [Upstream follow-up checklist](ROADMAP.md#dash-address-and-descriptor-evolution)

### Descriptor files are not PSBT files

A PSBT contains a transaction for signing. A descriptor describes wallet scripts and keys. Renaming a descriptor text file to `.psbt` does not convert it and causes an invalid PSBT magic bytes error. Use the wallet’s `importdescriptors` RPC for descriptor imports, not its PSBT transaction loading action.
