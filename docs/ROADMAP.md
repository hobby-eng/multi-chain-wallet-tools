# Roadmap

This file tracks planned capabilities and upstream changes that require follow-up before support can be claimed.

## Next after MnemoCode: BIP39 generation with one chosen word

Requested on 2026-09-23. Queue this immediately after the current MnemoCode work is finished; record the request now, without implementing the generator yet.

- [ ] Add an optional mnemonic-generation mode accepting a supported BIP39 word count, one word from the English BIP39 list, and its one-based position. Only one word/position constraint is in scope; other occurrences of that word need not be excluded.
- [ ] Generate fresh entropy with the platform cryptographic random-number generator, produce a checksum-valid BIP39 mnemonic using the existing shared implementation, and accept it only when the requested position matches. Never edit an existing recovery phrase or silently repair it into a different wallet.
- [ ] Keep generation local; provide cancellation and attempt progress if needed, without logging discarded candidates. Use the resulting phrase in the existing generation/diagnostic flow rather than duplicating BIP39 code.
- [ ] Explain the entropy tradeoff: fixing a non-final word removes exactly 11 random entropy bits; constraining the final word has approximately the same reduction under the usual SHA-256 checksum model. A 12-word phrase then has about 117 bits of entropy and a 24-word phrase about 245 bits. Do not describe this as unchanged security or imply a categorical safety threshold between one and two fixed words.
- [ ] Verify membership, position bounds, supported lengths, checksum validity and the final-word case with fast tests. Straight rejection sampling requires about 2,048 candidate mnemonics on average for one specified word at one position; wallet derivation and memory-hard encryption are not part of this search.

## Dash Platform asset-lock funding

- [ ] Add independent discovery of unused Identity registration/top-up asset-lock credits when Dash Platform and Evo SDK expose a proof-verifiable query for locating the relevant asset-lock outputs and determining their consumed state.

The current scanner only enriches a Dash Platform Identity that was already discovered. When Platform Explorer reports its Core funding transaction, the scanner loads that transaction and compares its asset-lock credit-key hash with locally derived registration funding keys. It does not currently claim that an empty Identity result proves there are no unused asset-lock credits.

Acceptance requires a regression fixture in which the funding resource exists without a discoverable Identity, plus an authoritative consumed/unconsumed result. Scanning an ordinary P2PKH address balance is insufficient because asset-lock credits are represented by the transaction payload and Platform state rather than by an unspent payment-address balance alone.

## Native Electrum seeds

- [ ] Consider a separate native Electrum seed-format mode with explicit seed-version detection, independent derivation vectors and clearly stated wallet/path coverage. Do not add it implicitly to BIP39 input. No native Electrum seed support is claimed today.

## Palette backup and recovery pipeline

- [ ] Add an optional, removable palette-backup module inspired by the open-source BIP39 Colors project. Preserve an explicitly labelled upstream-compatible BIP39 Colors mode, and define any broader CKD format separately rather than presenting an extension as the upstream format.
- [ ] Accept typed inputs from BIP39 mnemonics, raw BIP39 entropy, word-encoded entropy, SLIP-39, SSKR, Codex32 and Gordian Envelope. Preserve the exact source-format identifier, version, checksum and share boundaries so decoding can return the original records without ambiguity.
- [ ] Offer an optional password-protection stage before palette encoding. Treat encryption and palette representation as separate pipeline stages, use a reviewed authenticated-encryption container with a memory-hard KDF, and retain an unencrypted compatibility mode.
- [ ] Export exact textual `#RRGGBB` records as the authoritative recovery data, with colors as a visual representation rather than the sole copy. Provide several inconspicuous printable designs resembling interior, paint, textile or brand palettes, plus an optional QR representation and a plain emergency export.
- [ ] Add a one-button typed pipeline builder and reversible recipes such as `BIP39 -> encrypted container -> palette` and `secret -> SLIP-39/Codex32/SSKR -> generic palette transport`. Reject incompatible stage combinations instead of coercing unrelated formats.
- [ ] Document that palette output is obfuscation, not encryption; password protection is a distinct layer. Add deterministic upstream vectors, CKD format vectors, tamper and wrong-password rejection, print/transcription tests, complete encode/decode round trips for every accepted input type, dependency provenance and CC BY attribution where upstream BIP39 Colors material is used.

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

- [x] Public Bitcoin/Ethereum history providers now live in `packages/public-data-providers`; Activity Viewer no longer imports Discovery Scanner application code.

## Own decentralized block explorer with batch queries and GroveDB proofs

Idea recorded on 2026-10-05. Today the Discovery Scanner and Activity Viewer depend on free public explorers, which limit requests per IP address and can block or ban an address that sends too many. The plan is a block explorer built for these tools.

- [ ] Cover all popular coins, not only the ones the tools support today.
- [ ] Answer for single addresses and in batches of 50, 100, 200, 500 or 1,000 addresses per request.
- [ ] Return every answer with a cryptographic proof based on GroveDB, including proof that an address is absent: no balance and no history. GroveDB already proves the absence of a key and of further keys within a queried range, also on secondary indexes.
- [ ] Run as a decentralized network of independent nodes with different endpoints and addresses, so there is no single choke point for rate limits or denial of service.
- [ ] Make indexing deterministic, so that independent nodes reach the same GroveDB root hash at the same block height and a client can trust a proof by comparing that root across several nodes. A proof by itself only shows consistency with the root of the node that produced it.
- [ ] Open questions: who runs and pays for the nodes, and privacy, since a node that answers a batch learns that its addresses belong together.

## Dash address and descriptor evolution

- [ ] Monitor Dash Core releases, DIPs and descriptor/RPC documentation for new address/script types and corresponding descriptor expressions. Current account descriptor exports cover Core L1 P2PKH via `pkh(...)` only (BIP44, legacy mobile and mobile DIP9 CoinJoin paths). Do not assume a new Platform or Orchard address format is a Core descriptor.
- [ ] When upstream support is specified and available, verify mainnet/testnet address and key encodings, derivation paths, public/private descriptor syntax, checksum rules and minimum Core version. Add independent vectors and Core import/derive-address tests before enabling generation, scanner detection or export.

References: [Dash Core releases](https://github.com/dashpay/dash/releases), [DIPs](https://github.com/dashpay/dips), [descriptor utilities](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-util.html#deriveaddresses), [importdescriptors](https://docs.dash.org/en/stable/docs/core/api/remote-procedure-calls-wallet.html#importdescriptors).

## Bitcoin P2MR addresses (BIP-360)

Pay-to-Merkle-Root is a proposed segwit version 2 output (`bc1z…`) that commits only to a script tree, without Taproot's key-path spend. BIP-360 is a draft since February 2026 (version 0.12.1) with no consensus and no activation. The BIP repository already holds a Python reference implementation and construction test vectors (`bip-0360/ref-impl`), so the address construction itself can be verified today; what is missing is a wallet standard and activation.

- [ ] Wait for a wallet standard before generating addresses: a descriptor (such as `mr()`), a derivation path or purpose number, and a single-signature tree template. A single-leaf tree is anyone-can-spend in P2MR, so a lone one-key leaf must never be generated. Until activation every segwit version 2 output is anyone-can-spend under current consensus: no mainnet address before activation, at most a clearly marked testnet or regtest preview.
- [ ] Then add an address module next to `taproot.ts` (tap leaf hashes, a TapBranch root without an internal key, bech32m version 2), a startup self-test from the BIP's construction vectors, the address type in the Deriver, `bc1z` recognition in the Discovery Scanner, the Activity Viewer and MnemoCode's wallet evidence, P2MR spends in the PSBT Inspector (control block of 1 + 32·m bytes), exclusion from the Dash Community edition, and a browser regression case.
- [ ] Protection when coins are spent needs a post-quantum signature opcode (proposals: ML-DSA, SLH-DSA, SHRINCS). Add its leaf types once a BIP for one is merged.

References: [BIP-360](https://github.com/bitcoin/bips/blob/master/bip-0360.mediawiki), [reference implementation and vectors](https://github.com/bitcoin/bips/tree/master/bip-0360/ref-impl).

## September 2026 audit follow-up

See [the detailed review](audits/AUD-006-2026-09-12.md) for public reproductions and priorities.

- [x] Fix MuSig descriptor multipath validation before branch substitution, preserving original grammar and origins through script-tree parsing. Add valid aggregate and invalid participant/aggregate combinations.
- [x] Validate BIP174 hash-preimage field widths and commitments; define which remaining known fields are structurally or semantically verified.
- [x] Cover valid legacy uncompressed `sh(pkh(KEY))` compilation and distinguish recognized-only descriptor forms from validated forms.
- [x] Recover missing earlier pagination/network/copy-out regression cases against current modules; add Docker failure-cleanup simulation without invoking Docker.
- [x] Replace the premature Blob Worker teardown with one shared readiness contract, keep controls in an explicit cryptography-initialisation state, and cover immediate Clear, Cancel, and protocol changes in Chromium and Firefox. Keep the Inspector badge explicitly limited to parser boundary checks rather than implying a cryptographic startup self-test.
- [x] Give every tool known-answer self-tests for each feature and coin of its build: at start before any control opens (the Inspector's former parser-boundary badge included), a full self-test on request with the slower vectors, and a browser regression case (`self-tests`) for both editions.
- [x] Consolidate descriptor checksum and balanced grammar helpers; split Inspector workflows and Deriver BIP85/BIP38/signing, streamed derivation, large-request policy, and export controllers along their state boundaries while preserving compile-time edition isolation.
