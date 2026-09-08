# Security and implementation audit

Review date: 2026-09-08. Release: 0.1.3. Scope: the current modular source, locked dependency graphs, generated Dash Orchard WASM, canonical build process, six standalone HTML artifacts, and both compile-time editions. Multi-Chain Edition supports Bitcoin, Ethereum, and Dash. Dash Community Edition contains only Dash Core, Dash Platform payments, Dash Platform Identity, and Dash Orchard capabilities. This is an internal engineering review, not a third-party security audit or formal cryptographic proof.

## Current release architecture

- The repository builds three applications: the offline Wallet Key Derivation Tool, the connected Wallet Activity Viewer, and the connected Wallet Discovery Scanner.
- Each application is emitted in a universal Multi-Chain Edition and a Dash-only Dash Community Edition. Edition selection happens at compile time; it is not a runtime switch over hidden bundled adapters.
- The Multi-Chain Key Derivation Tool and Discovery Scanner support Bitcoin, Ethereum, and Dash. The Multi-Chain Activity Viewer accepts Bitcoin and Ethereum public addresses and the supported Dash public records. Bitcoin is the default coin wherever the Multi-Chain interface contains it.
- Dash Community build graphs are checked against positive Dash-only allowlists. Artifact checks also reject non-Dash adapter registrations, identifiers, filenames, profile metadata, and user-facing chain copy. The standards-required BIP32 HMAC domain string `"Bitcoin seed"` is the sole exact lexical exception in Dash HD derivation.
- Shared controllers, views, exports, security boundaries, and tests remain common source code. Protocol behavior is supplied through derivation, viewer, history, and recovery interfaces so future Multi-Chain support can be added without entering the Dash Community graph.

## Threat model

The controls are intended to prevent accidental network access from the offline tool, keep mnemonic and derived secret material out of the Discovery Scanner's network-capable realm, reject private material in the Activity Viewer, constrain connected applications to fixed read operations, and detect unexpected changes in source graphs and generated artifacts.

A compromised browser, extension, operating system, firmware, build host, or already modified HTML file is outside this boundary. CSP cannot protect secrets from code that is already executing with the user's privileges. Users must verify release checksums externally, use a clean environment, and independently confirm valuable-wallet results with a standard wallet.

## Controls present

### Shared controls

- No application uses `localStorage`, `sessionStorage`, IndexedDB, or cookies.
- User-derived result content is constructed with DOM nodes and `textContent`; result values are not passed through HTML parsing.
- Exact atomic amounts use integers or decimal strings rather than floating-point cryptocurrency values. CSV output is protected against spreadsheet formula execution.
- Mutable seed, key, hash, WASM-boundary, and result buffers are cleared where practical. Text controls and DOM nodes are emptied and references released. Immutable JavaScript strings, browser-engine copies, clipboard history, swap, and crash dumps cannot be guaranteed erased.
- Inline application scripts are authorized by exact build-time SHA-256 CSP hashes. Artifact verification checks the complete reviewed policies, duplicate IDs, template-inlining integrity, embedded dependency metadata, expected WASM/wordlist counts, and recorded digests.
- Release verification uses the TypeScript compiler AST to reject known Evo SDK write, transfer, withdrawal, identity mutation, broadcast, wallet, mnemonic, and seed APIs in connected graphs. This is defense in depth over reviewed SDK surfaces, not a proof about every future API.

### Wallet Key Derivation Tool

- The artifact is offline: its CSP sets `connect-src 'none'` and blocks remote assets. It contains no fetch, XMLHttpRequest, WebSocket, EventSource, telemetry, CDN, remote import, or update path.
- `worker-src blob:` permits the disposable derivation Worker created from JavaScript embedded in the same HTML. Runtime coin implementations, cryptographic derivation, address search, and Dash Orchard WASM execute in that Worker; the main-thread registry contains presentation metadata.
- Entropy generation requires `crypto.getRandomValues`; verification rejects `Math.random`.
- Startup is fail-closed until deterministic BIP39 and protocol vectors pass. Secret copy actions and secret-bearing exports remain disabled until the user reveals them. Sensitive content is concealed again when the page becomes hidden or loses focus.
- Bitcoin and Dash Core receive/change branches have independent result, selection, paging, descriptor, and export state. Async revision tokens and cancellation prevent obsolete Worker results from committing after inputs change.
- Derivation is divided into bounded internal batches and only a bounded row window is rendered. Requests of at least 10,000 output rows require a second explicit action with a workload estimate; the protocol index space remains the hard limit.
- Expected-address search is local, bounded to 5,000 requested indices, respects adapter batch limits, and clears temporary results after each batch.
- Watch-only descriptors, extended public keys, and viewing keys cannot spend funds but expose wallet structure or activity; their copy/export controls remain reveal-gated.

### Wallet Activity Viewer

- The Viewer is intentionally online and accepts public lookup material only. Private-key, WIF, extended-private-key, mnemonic, seed, and structured private-material patterns are rejected and erased before a provider request.
- Multi-Chain Edition has an explicit Bitcoin / Ethereum / Dash selector. Bitcoin and Ethereum modes accept public addresses in Single or Batch mode. Dash mode accepts Core and Platform addresses, Identity identifiers/names/public keys, and Dash Orchard viewing capabilities in Single or Batch mode.
- Bitcoin and Ethereum queries send the selected public address to fixed HTTPS providers for current state and confirmed lifetime history. These indexed/RPC results are provider data, not local consensus verification.
- Dash Core history comes from DashScan after synchronization and indexed-tip checks. Dash Platform address and Identity state use Evo SDK proofs; compatible indexed history comes from Dash Platform Explorer and remains auxiliary. Payment-address history is checked against proof-verified current balance before it is accepted.
- A full Dash public key is converted to its lookup HASH160 locally when that is the required identifier. Dash Orchard viewing keys remain local; network requests contain public aligned pool ranges. A viewing key cannot spend funds but can reveal sensitive wallet activity.
- Raw 32-byte Orchard material is accepted as an OVK only through the explicit advanced type because its length alone cannot distinguish it from spending material. Versioned bundles must match the selected network.
- Viewer controls stay disabled until the embedded Orchard runtime passes fixed public tests and the same-document Evo Blob Worker completes its startup handshake.
- Dash CSV/XLSX/JSON exports are generated locally from the loaded result snapshot and exclude Orchard viewing keys. They can still contain privacy-sensitive addresses, identities, transactions, notes, memos, commitments, nullifiers, and activity patterns. Bitcoin and Ethereum results are displayed without export controls in this release.

### Wallet Discovery Scanner

- Seed-phrase and public-key searches are separate modes, each supporting Single and Batch input. Public-key mode uses a coin selector and refuses to infer a coin when a shared extended-key encoding is ambiguous.
- Public-key discovery is watch-only and can derive only non-hardened descendants reachable from the supplied key. SLIP-132 Bitcoin encodings and checksummed descriptors can identify a specific Bitcoin address family; a plain xpub/tpub does not encode coin or hardened purpose. A seed phrase is required for the broadest supported account and address-family search.
- Mnemonic input, passphrase, BIP39 seed, HD derivation, public-key child derivation, and local Dash Orchard FVK scanning run inside a sandboxed `srcdoc` Secret Vault. The vault has an opaque origin, no `allow-downloads`, `connect-src 'none'`, and `worker-src 'none'`.
- The outer shell cannot read the vault DOM. A separate Network Worker contains the Evo SDK and all direct network implementations; it cannot access either DOM and has no mnemonic, seed, private-key, or viewing-key imports.
- One transferred `MessagePort` exposes a fixed discriminated set of public read operations. It accepts no arbitrary URL, generic request body, SDK method name, callback, or executable value. Public addresses and Platform payloads are semantically validated, and all structured responses are validated inside the vault before accounting.
- A registered-secret egress guard checks public RPC payloads and serialized exports. It is a secondary tripwire; the sandbox and CSP separation are the primary boundary.
- Bitcoin scans BIP44, BIP49, BIP84, and BIP86 receive/change chains. Ethereum scans the documented Standard BIP44, Ledger Live, and Legacy Ledger/MEW EOA layouts. Dash can scan Core BIP44, opt-in legacy/mobile/provider families, Platform payments, Platform identities, and Orchard.
- Seed batches contain one through five phrases. Each wallet has isolated seed, guard, accounting, and result state. Scans are sequential by default; optional concurrency is capped at five by an abort-aware semaphore while result order remains tied to source order.
- Address counts are processed in bounded batches and extend through the documented 20-address post-use gap where applicable. Cancelling removes queued work and reaches a cleanup barrier before final secret disposal.
- Batch Orchard downloads each proof-verified page once, applies it locally to every participating FVK, clears its byte arrays, and then advances by the required 2,048-action-aligned cursor. Two proof-verified empty reads establish completion; the 4,096-page ceiling yields a visible partial result rather than an unbounded scan.
- Discovery CSV/JSON is a public-data projection. It excludes phrases, passphrases, seeds, private/spending keys, extended public keys, Orchard viewing keys, and internal re-derivation locators. The vault can request only a prevalidated `csv` or `json` Blob download through the fixed shell broker.

## Cryptographic review results

- Key derivation and address construction use pinned Noble/Scure primitives for BIP39, BIP32, hashing, secp256k1, Base58Check, Bech32/Bech32m, Keccak, and Schnorr operations. No custom curve or encryption primitive was introduced.
- Bitcoin Legacy, Nested SegWit, Native SegWit, and Taproot derivations are covered by fixed and independent vectors. Taproot matches the complete official BIP86 vector, including internal key, TapTweak, output key, scriptPubKey, and address. BIP380 descriptor checksums are checked against an official fixed vector.
- Ethereum derives an uncompressed secp256k1 public key, hashes `X || Y` with Keccak-256, selects the final 20 bytes, and applies EIP-55. Results are cross-checked with ethers.
- Dash Core constants match Dash chain parameters and are cross-checked with DashHD and a published SLIP vector. Dash Platform payment derivation matches DIP17 key and DIP18 address vectors. Dash Identity DIP13 mainnet/testnet path, private key, public key, and HASH160 vectors are independently reproduced with `dashhd`.
- Dash Orchard math comes from the pinned official Dash Orchard fork. Native Rust tests, generated-WASM tests, upstream component vectors, ZIP32 pins, network separation, malformed-input cases, and fixed encrypted-note fixtures cover derivation and viewing-key scanning.
- Core duffs use 8 decimal places. Dash Platform credits and Orchard raw values use 11 decimal places. The applications keep these atomic units distinct until an explicitly unit-safe DASH aggregate is required.

## Provider and data limitations

- Bitcoin, Ethereum, DashScan, and Platform Explorer history is externally indexed or RPC-provided data. Transport success and schema validation do not prove completeness. Missing, lagging, malformed, or bounded provider results are reported as unavailable, failed, or partial rather than converted to zero.
- Dash Platform proofs establish the returned state under the trusted Evo/DAPI path, but do not remove IP-address and query-pattern leakage. DashScan Core history is a synchronized single-provider index, not a consensus proof.
- `First seen` and `Last seen` are provider-reported confirmed activity times within the provider's stated scope. They are not browser observation times and are not inferred from request timing. Pending activity is excluded where the provider contract reports confirmed lifetime totals.
- Address-level `Total sent` can include consumed outputs, change, self-transfers, and fees according to the relevant chain/provider model. It must not be treated as the net amount paid to other people.
- Dash Orchard scanning reconstructs note values, direction, spend state, memos, and pool positions. The encrypted feed does not provide a transaction hash, fee, block time, or calendar timestamp for every action, so the applications do not invent those fields.
- A Dash Orchard balance and spent state is authoritative only after scanning from position zero through a proof-verified terminal page. Cancelled, failed, or page-limited scans remain visibly partial.

## Residual risks and limitations

1. **Host compromise remains decisive.** A malicious browser, extension, OS, firmware, keylogger, screen recorder, or modified artifact can read secrets and alter results.
2. **JavaScript erasure is best effort.** Immutable strings and engine-internal copies may remain after UI clearing; the OS may retain clipboard, swap, or crash data.
3. **Connected lookups expose metadata.** Providers can observe the source IP, identifiers, timing, volume, and address-discovery pattern. Large and CoinJoin-related scans can be especially distinctive.
4. **Watch-only material is privacy-sensitive.** Account xpubs/descriptors reveal address graphs, and Dash Orchard viewing keys reveal shielded activity even though neither can spend funds.
5. **Large requests can exhaust resources.** Bounded batches and DOM windows reduce stalls, but large scans still consume CPU, memory, bandwidth, time, and provider quota.
6. **Provider truth is limited.** External indexes can lag, omit history, throttle, or fail. Every funded path and any claimed zero balance should be verified with a standard wallet or independent provider before recovery decisions.
7. **Dash Orchard WASM panic cleanup is incomplete.** The release uses `panic=abort`; Rust destructors do not run after an internal panic, so derived bytes may remain in that module's linear memory until its instance is discarded.
8. **Secret egress pattern matching is incomplete by design.** A transformed, encrypted, compressed, or meaningfully re-encoded secret may evade the guard. Security depends on the network-denied vault and fixed protocol boundary, not the pattern matcher alone.
9. **Embedding protection depends on delivery.** A CSP supplied through `<meta>` cannot enforce `frame-ancestors`. An HTTP host must send `Content-Security-Policy: frame-ancestors 'none'`, preferably with `X-Frame-Options: DENY`.
10. **Checksum sidecars do not establish authenticity.** A `.sha256` file distributed beside an HTML file detects transfer corruption. GitHub provenance attestations or a separately trusted signature bind artifacts to a publisher/build identity, but do not prove the software is safe.
11. **Standards and providers can change.** Proposed Platform specifications, SDK behavior, endpoint contracts, and browser security behavior require review when dependencies or protocols are upgraded.
12. **No independent audit has been completed.** Tests and cross-implementation vectors reduce integration risk; they do not prove absence of implementation or supply-chain vulnerabilities.

## Verification status for 0.1.3

The complete native `pnpm verify` run passed for the 0.1.3 source: TypeScript compilation, 265 TypeScript tests, 11 native Rust tests, deterministic derivation vectors, independent DIP13 reproduction, startup self-tests, generated-WASM checks, CSP and storage checks, Secret Vault/Network Worker graph separation, RPC and response validation, secret-egress tests, exact-integer exports, profile isolation, reproducibility checks, release manifests, checksums, and both edition bundles.

Live smoke tests also passed for Dash Orchard testnet viewing, Dash Core mainnet/testnet, Dash Platform mainnet/testnet, Discovery Scanner mainnet/testnet, and two-phrase and five-phrase mainnet discovery batches. These observations verify provider compatibility at the test time; they do not guarantee future provider availability or complete chain truth.

The canonical release build is defined by `Dockerfile.reproducible`: Linux/amd64, an Ubuntu 24.04-based image pinned by immutable digest, exact Node/pnpm/Rust/wasm-bindgen versions, checksum-verified installers, locked JavaScript and Cargo graphs, and a final complete verification layer without network access. Rebuilt Dash Orchard WASM/glue must byte-match the reviewed committed files. A native build can pass the same functional checks while producing different release bytes because host linkers and system libraries vary.

## Release checklist

- Run `./tooling/build-reproducible.sh` from a clean checkout and compare `dist/multi-chain-edition/release/SHA256SUMS` with the published release manifest.
- Verify every downloaded HTML file against `SHA256SUMS`. Verify GitHub provenance attestations when the release pipeline produced them; do not describe manually uploaded artifacts as attested.
- Use only the Wallet Key Derivation Tool on the offline device. Open the Wallet Activity Viewer and Wallet Discovery Scanner on a clean connected device.
- Exercise Bitcoin, Ethereum, and Dash selection in every Multi-Chain application where supported. Confirm Bitcoin remains the default coin and that Dash Community artifacts expose only Dash workflows.
- Test derivation, cancellation, receive/change separation, known-address matching, reveal gates, selection, paging, copy, and exports in the offline tool.
- Test Activity Viewer Bitcoin and Ethereum Single/Batch public-address lookups plus Dash Core, Platform, Identity, and Orchard Single/Batch flows. Treat partial Orchard scans as non-authoritative.
- Test Discovery Scanner seed phrase and public key tabs in Single/Batch mode. Exercise supported Bitcoin families, Ethereum layouts, Dash components, zero-balance history, gap extension, cancellation, and secret-free CSV/JSON export.
- Inspect connected requests and confirm that only validated public addresses, public lookup hashes/identifiers, or Orchard pool ranges cross the network boundary.
- Open final artifacts directly with current supported browsers and test startup, responsive layout, clipboard fallback, and downloads.
- Independently verify every valuable-wallet derivation or recovery finding in a standard wallet before moving funds. Move funds recovered from a seed entered into a connected browser to a new seed.
