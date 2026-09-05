# Dash Platform and Shielded implementation report

Research and implementation review date: 2026-09-05.

Original integration code is licensed under the repository's MIT License. Dash Core, Platform, Orchard, brand materials, and all other upstream components retain their respective authorship and licenses documented in `ATTRIBUTION.md` and `THIRD_PARTY_NOTICES.md`.

## Official target

- Dash Platform stable release: **v4.1.1**, published 2026-08-18.
- Platform release commit: `bfc80249b9257d775d1e5260b8bda47f6fcc8674`.
- Platform repository/license: `dashpay/platform`, MIT.
- Platform payments: current official DIP17 and DIP18 documents, both presently marked **Proposed**.
- Shielded implementation: `dashpay/orchard`, tag `dashified-0.14.1`, commit `38ac9c19a2df7bf3eeadc22ab23053e8fd538828`, MIT OR Apache-2.0.
- Orchard transitive Dash note-encryption fork: `dashpay/zcash_note_encryption`, revision `9f7e93d42cef839d02b9d75918117941d453f8cb`, locked by Cargo.

`Cargo.lock` is authoritative for the complete Rust closure. The WASM build refuses an Orchard lock entry other than the audited tag and commit.
Weekly upstream monitoring compares the pinned `zcash_note_encryption` revision with that dedicated repository's default-branch head. A differing head produces a review-required signal when the GitHub comparison changes `src/`, `Cargo.toml`, `Cargo.lock`, or `build.rs`; documentation and CI-only commits are reported as outside the reviewed cryptographic surface. A comparison at GitHub's 300-file response limit also fails closed for review. The checker never updates this dependency automatically.

## Dash Core

Mainnet uses coin type 5, P2PKH prefix 76, P2SH prefix 16, WIF 204, and current Bitcoin-compatible xpub/xprv version bytes. Testnet uses coin type 1, P2PKH 140, P2SH 19, WIF 239, and tpub/tprv version bytes. These values were checked against current Dash Core `chainparams.cpp`. Derivation is BIP44 `m/44'/coin_type'/account'/branch/index`, where branch `0` is external/receive and branch `1` is internal/change.

The offline Wallet Key Derivation Tool always derives receive rows and can optionally derive the matching change rows into a separate tab. Both tabs use the same account, network, start index and count and expose equivalent address/public/private-key fields. The connected Wallet Discovery Scanner is intentionally different: recovery always scans both Core branches regardless of the offline tool's opt-in display setting, because unspent wallet value may reside on change addresses.

## Platform payments

DIP17 defines one compressed secp256k1 payment key at:

```text
m/9'/coin_type'/17'/account'/key_class'/index
```

Purpose, coin type, feature, account, and key class are hardened. The leaf index is non-hardened and limited to `2^31 - 1`. There is no BIP44 change level. Default receive key class is `0'`; `1'` is reserved for internal/change-like segregation.

DIP18 P2PKH display is exactly `type 0xb0 || HASH160(compressed_public_key)`, converted 8-to-5 bits with padding and encoded using Bech32m. HRP is `dash` for mainnet and `tdash` for test networks. The internal storage variant is `0x00 || HASH160`; both payloads are exposed only in advanced mode.

The implementation uses Scure BIP32, Noble secp256k1/hash functions, and Scure Bech32m rather than importing the much larger online Platform SDK. This path is fully specified by the normative DIPs and matches every published DIP17/DIP18 vector. It introduces no hand-written primitive. Platform's SDK/WASM is optimized for network protocol/state transitions and would add substantial unrelated surface to a transport-free offline key derivation tool.

DIP17's normative result is a raw private scalar; it does not define a Platform-specific WIF. Therefore basic mode exposes raw 32-byte private-key hex. Advanced mode provides a clearly qualified Dash-compatible WIF transport encoding because the secret is the same secp256k1 scalar, but warns that WIF carries no Platform address/path metadata.

## Platform Identity keys

The offline derivation tool exposes the official Platform Wallet v4.1.1 default Identity registration profile through DIP13:

```text
m/9'/coin_type'/5'/0'/0'/identity_index'/0'  MASTER / AUTHENTICATION
m/9'/coin_type'/5'/0'/0'/identity_index'/1'  CRITICAL / AUTHENTICATION
m/9'/coin_type'/5'/0'/0'/identity_index'/2'  HIGH / AUTHENTICATION
m/9'/coin_type'/5'/0'/0'/identity_index'/3'  CRITICAL / TRANSFER
```

All seven path levels are hardened and all four default keys use compressed ECDSA/secp256k1 public-key data. The final key ID does not cryptographically encode its purpose or security level. Those values are explicit `IdentityPublicKey` metadata assigned by the registration transition; a custom valid registration can use different IDs or role assignments. The UI therefore labels this mapping as the official wallet default profile rather than a universal DIP13 rule.

One result and selection unit is an Identity candidate containing all four key slots. Basic mode shows each slot's HASH160 discovery fingerprint, compressed public key, and Dash-compatible WIF transport encoding. Advanced mode adds key ID, purpose, security level, key type, full path, raw private scalar, public-key size, hardened status, `readOnly`, and contract-bound metadata. Public-key HASH160 is neither a payment address nor an Identity ID.

Identity IDs are created from registration funding inputs, not from the recovery phrase or DIP13 path. Consequently the offline tool does not fabricate an ID, registration status, balance, or DPNS name. It derives candidate registration keys only; the connected Discovery Scanner separately uses the first MASTER key's HASH160 to locate an Identity that has already been registered.

## Public address viewing

The separate network-enabled viewer has four modes and deliberately keeps their trust models distinct:

- Dash Core L1 address history uses the open-source DashScan Mainnet/Testnet API. The provider must report `ok`; the viewer also records the latest indexed Core height/time. Balances and lifetime flows are parsed as exact duffs, and each transaction is reconstructed relative to the queried address from its inputs and outputs.
- Dash Platform address current state uses Evo SDK 4.1.1 trusted quorum discovery and `addresses.getWithProof`. Address-indexed lifetime totals and transitions come from the open-source Dash Platform Explorer Mainnet/Testnet API only after its index reports `synced`. Explorer balance/nonce are compared with the DAPI proof; DAPI wins on any disagreement.
- Dash Platform Identity lookup accepts a Base58 Identity ID, an explicitly labelled `idhex:<64-hex Identity ID>`, an explicitly labelled `tx:<64-hex registration transition>`, the HASH160 fingerprint of a public key registered to the Identity, a compressed ECDSA/BLS public key, or a DPNS name with or without `.dash`. Bare 64-hex input remains blocked because an identifier or transition hash is indistinguishable from a raw private key without an explicit prefix. Public keys are hashed locally before lookup. A registration-transaction lookup accepts only an Identity creation transition, verifies its hash against the indexed raw bytes, decodes its owner locally with the pinned Evo SDK, and then requests the resulting Identity from proof-verified DAPI. DAPI proofs provide current balance, revision, nonce, every registered public key with its actual purpose/security metadata, and the Identity's DPNS names. A DPNS forward resolution is accepted only after the resolved Identity's proof-verified username set confirms the requested name. Explorer registration metadata, aliases and history remain explicitly auxiliary; registration time/hash are selected from the actual Identity creation transition, and the pinned Evo SDK locally decodes the Core asset-lock outpoint for classic registrations. Address-funded and shielded-pool registrations are labelled separately. Owner transactions and transfer legs are grouped by transaction hash into one ledger event without losing multiple transfer legs.
- Dash Orchard activity uses viewing-key recovery described below and does not query either public-address index.

All public lookup modes reject and erase mnemonic, WIF, extended-private-key, raw-private-key and structured private-material patterns before opening a network connection. The public indexes are behind small provider interfaces, so endpoint replacement does not require renderer or validation changes. Live Mainnet/Testnet smoke tests exercise CORS, index status, current tip metadata, pagination, and real records. The Platform smoke additionally requires Explorer balance/nonce to equal proof-verified DAPI for the same address. Platform Explorer exposes lifetime aggregate amounts but not the amount attributable to an individual address on every returned transition, so the viewer leaves that per-transition field unavailable.

Viewer results use a mode-tagged export boundary in `apps/activity-viewer/src/export.ts`. CSV v2 emits one summary row per queried resource plus compact typed record rows, retaining only the resource identifier needed to relate those rows instead of repeating the full verified/indexed summary. Less common typed values use readable `key=value` metadata rather than nested JSON inside a CSV cell, and every string cell is protected from spreadsheet formula execution. JSON v2 is object-oriented: each Identity owns its state, keys, registration, indexed history and explicitly grouped proof metadata without a separate snapshot/history join. Exact integer duffs, credits, heights, positions, nonces, and nullifiers are serialized without numeric precision loss. The input viewing key is deliberately absent from the export state.

## Mnemonic recovery scanner

`Wallet_Discovery_Scanner.html` is a third, separate, network-enabled scan-only artifact. Its Dash adapter is divided into four protocol scanners so future Bitcoin and Ethereum adapters can reuse the same source-input, progress, result, export and isolated-network framework. Although distributed as one HTML, it runs two realms: an opaque-origin, CSP network-denied Secret Vault owns mnemonic/BIP39/derivation/FVK state; an outer Network Worker owns Evo SDK and all HTTPS. Their `MessagePort` protocol exposes only fixed public read operations and no arbitrary URL or secret-bearing generic request.

Core recovery derives both standard BIP44 branches locally:

```text
m/44'/coin_type'/account'/0/index    receive
m/44'/coin_type'/account'/1/index    change
```

It sends only the exact public P2PKH addresses through fixed RPC to the Worker's DashScan `/addresses/info` client in batches of 50, after requiring `/status` to report `ok` and recording the indexed Core tip. DashScan is the sole Core source in this build; the result is explicitly marked single-source and must be independently verified in a standard wallet. The user count is a minimum: every balance-bearing or historically used Core address moves that branch endpoint to at least 20 following positions. Platform-payment recovery derives DIP17 key class `0'` addresses in the vault and requests Evo SDK `addresses.getManyWithProof` through fixed RPC batches of 100; balance or outgoing nonce produces the same post-use gap extension. The v4.1.1 multi-address result Map is keyed by the internal storage payload `00 || HASH160(public_key)`, not by the DIP18 Bech32m display string; recovery therefore retains both encodings and performs the lookup with the canonical storage key. Monetary values remain exact integer duffs or credits throughout.

Core/Platform findings are funded-only by default. Opting into historical empty addresses changes presentation and export, not discovery: those addresses always count as used for the 20-address gap. The Core opt-in loads DashScan's per-address lifetime received/sent and first/last-seen summary through the bounded network scheduler. Exact input/output occurrence counts are not part of `/addresses/info` or `/address/:address`; reconstructing them would require the complete paginated transaction history and is not done by the recovery scan.

Identity recovery follows the path used by the current Dash Platform wallet for its first authentication key:

```text
m/9'/coin_type'/5'/0'/0'/identity_index'/0'
```

Only `HASH160(compressed_public_key)` is passed to `byPublicKeyHashWithProof` and, on a miss, `byNonUniquePublicKeyHashWithProof`. Up to five proof lookups are in flight, but completed batches are committed in index order before the empty-gap state changes. The scanner stops when its configurable consecutive-empty gap is reached or the configured attempt count is exhausted. A scan stopped by the attempt count before satisfying the gap is marked partial.

Orchard recovery derives the account FVK inside the Secret Vault through the pinned Dash Orchard WASM, registers it with the per-wallet RPC guard and the scan-end export guard, and performs the same proof-verified encrypted-note scan and local nullifier matching described below. Only public pool positions/counts cross to the Network Worker; DAPI and Evo SDK never receive the FVK. DAPI start positions are advanced in required 2,048-action-aligned chunks rather than by a short page's returned count. Completion requires two proof-verified empty reads at the terminal cursor; the 4,096-page ceiling produces a partial result. Each Orchard note value is a Platform-credit integer at the WASM boundary. That unit is cross-checked against official `dashpay/platform` commit `1c128acaf92e68a147086f9b87810dae5cc21993`, where funding APIs document `1 DASH = 1e11` credits and the official shielded wallet test feeds `value_credits` directly to `NoteValue::from_raw`.

There is no arbitrary address-count cap. Provider work remains bounded to 50 Core or 100 Platform public addresses per request, while user minimums and automatic gap extension may continue through the valid non-hardened BIP32 range. For example, 100,000 Core addresses become at least approximately 2,000 requests for one selected branch and are reported progressively. Batch wallets run sequentially by default; optional concurrency remains capped by one shared abort-aware five-operation semaphore. SDK connections are isolated and cached by network plus purpose (`addresses`, `identity`, `shielded`), with a 10-second proof deadline, no nested SDK retries, and at most two explicit fresh-connection retries separated by bounded backoff; invalid arguments fail immediately. Per-wallet cryptographic and accounting state is isolated; result slots are keyed by original input order. This affects availability and privacy, not derivation semantics: cancellation is checked in the request queue and between batches, and a provider can observe the source IP, timing, and derived public-address sequence.

The recovery artifact intentionally exports public recovery metadata only and does not create, sign, prove, or broadcast spend transactions. In particular, an Orchard spend requires correct transaction construction and proving support beyond viewing-key recovery. Funds should be restored and moved with a standard Dash wallet after independently verifying the reported address/path/index.

## Shielded payments

Shielded derivation is not BIP44/secp256k1. The account key uses ZIP32:

```text
m/32'/coin_type'/account'
```

The Rust adapter calls official APIs only:

```text
SpendingKey::from_zip32_seed
FullViewingKey::from
FullViewingKey::to_ivk(Scope::External)
FullViewingKey::to_ovk(Scope::External)
FullViewingKey::address_at(index, Scope::External)
```

It serializes official raw bytes across a narrow JSON boundary. TypeScript validates exact sizes: SpendingKey 32, FullViewingKey 96, IncomingViewingKey 64, OutgoingViewingKey 32, and raw payment address 43 bytes. It then displays `0x10 || raw_address` using network-specific Dash Bech32m. The raw address is the 11-byte diversifier plus 32-byte diversified transmission key. No Zcash Unified Address or F4Jumble wrapper is applied because Dash v4.1.1 specifies the direct Dash encoding.

The adapter deliberately does not implement Orchard, ZIP32, Pallas/Vesta, Halo2, RedPallas, note encryption, or address generation. Generated wasm-bindgen glue is reduced to the synchronous local initializer before bundling; any remaining fetch/import-meta/async-loader marker fails the build.

## Viewing-key scanner

Shielded history cannot be obtained from an address or viewing key alone while offline. The separate `Wallet_Activity_Viewer.html` uses official Evo SDK 4.1.1 trusted mode to request proof-verified encrypted-note pages from Dash Platform DAPI. Raw viewing keys never enter an SDK call; DAPI receives only public pool range queries. A 96-byte FVK enables the complete watch-only view, while 64-byte IVK and 32-byte OVK modes expose only incoming or outgoing recovery respectively.

Each returned action has `cmx(32)`, `nullifier(32)`, `cv_net(32)`, and `encrypted_note(216)`, where the latter is `epk(32) || enc_ciphertext(104) || out_ciphertext(80)`. The Rust scanner follows the official Platform wallet implementation:

```text
FullViewingKey::from_bytes
FullViewingKey::to_ivk(Scope::External).prepare
try_note_decryption                    incoming note, amount, address, memo
FullViewingKey::to_ovk(Scope::External)
try_output_recovery_with_ovk           sender's outgoing output
Note::nullifier(&full_viewing_key)      owned-note spend detection
```

The scan walks from position zero in ascending order. When a later action's public nullifier equals a previously recovered owned-note nullifier, that owned note is marked spent. An output that opens under both IVK and OVK is the wallet's own/self/change output and is excluded from external-sent totals. This yields view-only note activity and an unspent balance without spending authority or a proving key.

The encrypted-note endpoint does not attach an exact state-transition hash or creation timestamp to each note. Pool position is canonical ordering; response proof height is verification metadata, not claimed as the note's creation height. Fees and transition types are not reconstructed from encrypted outputs alone.

## Fixed verification pins

The Rust suite pins a 64-byte `0x42` seed at test coin type 1/account 0/index 0 to:

```text
incoming viewing key:
fae18cbcf032c37f646b0e3f211bda62dc79535f5276abbf274f46ba1d28d571946102f72db50fd672aadddc8346c513221c82e3fbc0c62058a2effb9669f228

raw address:
ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8

display address:
tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq
```

An upstream component vector separately constructs an Orchard SpendingKey from fixed bytes and checks its IVK, OVK, and address. The same fixed-seed pin is run through the generated browser WASM, so a native-only success cannot hide glue or serialization errors. The scanner also consumes the fixed full-wire fixture in `packages/dash-shielded-wasm/rust/fixtures/official-platform-wallet-note.json`. Its `cmx`, action nullifier, `cv_net`, and 216-byte encrypted note were generated outside this repository by the official stable `dashpay/platform` v4.1.1 wallet's `build_shield_transition` path at commit `69b85c81af8e000e8506edaa13406d1f6274af5a`; the test independently pins FVK incoming recovery and OVK outgoing recovery to the wallet's expected value, raw address, and Dash memo. Fixture provenance and the extraction procedure are recorded beside the fixture. Runtime scanner tests remain complementary: they build a fresh real Dash-memo Orchard note, exercise FVK/IVK/OVK capabilities, reject a foreign FVK and malformed batches, and confirm the generated WASM zeroes its copied key buffers. Live protocol-version-13 smoke tests have verified a full 2,048-action testnet page and a complete mainnet cold scan at their recorded test times; mutable live pool sizes are intentionally not treated as fixed vectors.

## Upgrade rule

Do not change only the version label. For a Dash release/DIP update, re-audit release notes, DIPs, chain parameters, Orchard and note-encryption revisions, licenses, browser compatibility, raw lengths, type bytes/HRPs, path rules, and official vectors. Update all pins and regenerate/re-run native and WASM tests before accepting new output.
