# Security and implementation audit

For private vulnerability reporting and a concise overview of the security boundaries, see [SECURITY.md](SECURITY.md). This document records the detailed implementation threat model and audit context.

Audit baseline: [2026-09-08 review record](docs/audits/audit-01-2026-09-08.json), commit `6462c67d677ab73bea49051c3e3d866fcd157894`, release 0.1.3 at review. This date and commit are immutable review metadata; a release bump does not refresh them. The review found defects and test gaps. Later corrections require their own verification evidence.

Latest retained review: [AUD-017 — 2026-09-17 API, data-flow and export audit](docs/audits/audit-17-2026-09-17.md), covering commit `64868886fe8aaf0121e62e57da065913a1afef76`. It records four API/export edge defects alongside passing reference-vector and browser checks; its results describe that snapshot, not every later commit. Audit records now use categorized identifiers and paired Markdown/JSON records; [the legacy alias map](docs/audits/LEGACY_FINDING_IDS.md) preserves older references. The earlier [2026-09-15 independent modular audit](docs/audits/audit-10-2026-09-15.md), covering commit `cdce70cb531f4da5d46c6ac321ff7de9dd8e12a9`. It confirmed the module boundaries and codec vectors, and reported three release/feature defects plus lower-severity hardening items. The fixes after that snapshot require a fresh verification record and browser run before release. The earlier [2026-09-12 independent re-verification](docs/audits/audit-09-2026-09-12.md) covers commit `d978dd4de68e6b51743d8ce0f01fcd6128d88553`. The [Codex remediation verification](docs/audits/audit-08-2026-09-12.md) records that earlier canonical artifact build and browser matrices. Earlier [initial](docs/audits/audit-04-2026-09-12.md), [remediation](docs/audits/audit-05-2026-09-12.md), [follow-up](docs/audits/audit-06-2026-09-12.md), and [independent](docs/audits/audit-07-2026-09-12.md) records preserve their point-in-time results.

The re-verification found two documentation-only omissions: the release-file lists did not name `verification-record.json`, and the direct Playwright development dependency was absent from `THIRD_PARTY_NOTICES.md`. Commit `a3988a8d` corrected both after the recorded review; no application or artifact code changed.

Scope: first-party source, security boundaries, integration with the pinned generated WASM, build tooling and documentation. A full line-by-line audit of every transitive dependency and an independent cryptographic proof are excluded. Package archive integrity, Cargo git commits, reviewed GitHub revisions, and local recovery-codec source hashes are enforced by the build provenance gate. Multi-Chain Edition supports Bitcoin, Ethereum, and Dash. Dash Community Edition contains only Dash Core, Dash Platform payments, Dash Platform Identity, Dash Purpose48 P2SH multisig cosigner, and Dash Orchard capabilities. This is an internal engineering review, not a third-party security certification.

Follow-up: [2026-09-09 corrections and verification scope](docs/audits/audit-03-2026-09-09.md). This records subsequent fixes without changing the baseline above.

## Current release architecture

- The repository builds four applications: the offline Wallet Key Derivation Tool, the connected Wallet Activity Viewer, the connected Wallet Discovery Scanner, and the offline PSBT & Multisig Inspector.
- Each application is emitted in a universal Multi-Chain Edition and a Dash-only Dash Community Edition. Edition selection happens at compile time; it is not a runtime switch over hidden bundled adapters.
- The Multi-Chain Key Derivation Tool and Discovery Scanner support Bitcoin, Ethereum, and Dash. The Multi-Chain Activity Viewer accepts Bitcoin and Ethereum public addresses and the supported Dash public records. Bitcoin is the default coin wherever the Multi-Chain interface contains it.
- Dash Community build graphs are checked against positive Dash-only allowlists. Artifact checks also reject non-Dash adapter registrations, identifiers, filenames, profile metadata, and user-facing chain copy. Narrow reviewed lexical exceptions cover protocol constants such as the standards-required BIP32 HMAC domain string `"Bitcoin seed"` and bounded shared Inspector decoder vocabulary; they do not enable Bitcoin adapters or controls.
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
- Every supported build rejects missing pnpm SHA-512 integrity pins, missing crates.io SHA-256 checksums, non-full Cargo git commits, and an available GitHub response that does not match the reviewed commit. An unreachable GitHub source emits an explicit warning; it does not bypass mandatory package-manager pins or local source hashing. Stable recovery/QR source hashes are included in `verification-record.json`.
- Release verification uses the TypeScript compiler AST to reject known Evo SDK write, transfer, withdrawal, identity mutation, broadcast, wallet, mnemonic, and seed APIs in connected graphs. This is defense in depth over reviewed SDK surfaces, not a proof about every future API.

### Wallet Key Derivation Tool

- The artifact is offline: its CSP sets `connect-src 'none'` and blocks remote assets. It contains no fetch, XMLHttpRequest, WebSocket, EventSource, telemetry, CDN, remote import, or update path.
- `worker-src blob:` permits the disposable derivation Worker created from JavaScript embedded in the same HTML. Runtime coin implementations, cryptographic derivation, address search, and Dash Orchard WASM execute in that Worker; the main-thread registry contains presentation metadata.
- Entropy generation requires `crypto.getRandomValues`; verification rejects `Math.random`.
- Startup is fail-closed until deterministic BIP39 and protocol vectors pass. The same startup gate executes fixed encode/decode checks for Standard and Compact SeedQR, an official SLIP-39 vector plus generated shares, CKD Shamir Raw and Words, official plus entropy Codex32 records, grouped SSKR in Compact UR and Bytewords, and encrypted Seed Envelope entropy/passphrase encode/decode. Secret copy actions and secret-bearing exports remain disabled until the user reveals them. Sensitive content is concealed again when the page becomes hidden or loses focus.
- Bitcoin and Dash Core receive/change branches have independent result, selection, paging, descriptor, and export state. Async revision tokens and cancellation prevent obsolete Worker results from committing after inputs change.
- Derivation is divided into bounded internal batches and only a bounded row window is rendered. Requests of at least 10,000 output rows require a second explicit action with a workload estimate; the protocol index space remains the hard limit.
- Expected-address search is local, bounded to 5,000 requested indices, respects adapter batch limits, and clears temporary results after each batch.
- Watch-only descriptors, extended public keys, and viewing keys cannot spend funds but expose wallet structure or activity; their copy/export controls remain reveal-gated.
- Recover & Back Up is compiled into both offline Deriver editions. Wallet Matcher has explicit seed/account/index limits and reuses one disposable derivation Worker per run. Share inputs and outputs are concealed by default and are not persisted. Direct handoff from the original or BIP85 child phrase uses an expiring in-memory reference: it writes no duplicate secret to a destination field, URL, storage, or clipboard, and expires when the source phrase or passphrase changes.
- SeedQR supports Standard numeric and Compact binary encodings for all 12/15/18/21/24-word English BIP39 lengths. SeedSigner documents 12/24-word payloads; intermediate lengths are a direct encoding extension and may not interoperate with every external SeedQR implementation. Each SeedQR, SLIP-39, CKD Shamir, Codex32, SSKR, and Seed Envelope result receives a separate offline QR; these are secret-bearing displays. Local image import decodes pixels in memory, enforces a 20 MiB/4096-pixel processing boundary, and preserves byte-mode CompactSeedQR data without network or storage.
- SSKR uses the pinned Blockchain Commons implementation and standard Compact UR or full Bytewords SSKR records. Gordian Seed Envelope uses the pinned Blockchain Commons multi-permit construction: Argon2id passwords, X25519 recipients, and SSKR quorums wrap one randomly generated content key. An optional CKD assertion can place the BIP39 passphrase inside that encrypted content; any valid permit then reveals both factors. Recipient keys derived from the protected BIP39 seed are explicitly identified as circular access control, not an independent backup.
- SLIP-39 and CKD Shamir operate on validated BIP39 entropy. New CKD Shamir version-2 cards carry the same truncated secret digest in every checksummed envelope, so a checksum-repaired altered share cannot silently reconstruct a different plausible mnemonic. Version-1 cards remain readable for recovery but do not have this set-level check. Codex32 lets the user explicitly select validated BIP39 entropy or the 64-byte BIP32 seed after the exact Unicode BIP39 passphrase has been applied. The UI requires the same interpretation during decoding and states that master-seed mode cannot reconstruct the phrase or passphrase.
- All new share randomness originates in `crypto.getRandomValues`. The pinned `blahaj` build disables default RNG features and accepts an explicit 256-bit seed for ChaCha20Rng. Codex32 accepts independent WebCrypto-generated payloads. The offline artifact verifier continues to reject `Math.random`.

### Wallet Activity Viewer

- The Viewer is intentionally online and accepts public lookup material only. Private-key, WIF, extended-private-key, mnemonic, seed, and structured private-material patterns are rejected and erased before a provider request.
- Multi-Chain Edition has an explicit Bitcoin / Ethereum / Dash selector. Bitcoin and Ethereum modes accept public addresses in Single or Batch mode. Dash mode accepts Core and Platform addresses, Identity identifiers/names/public keys, and Dash Orchard viewing capabilities in Single or Batch mode.
- Bitcoin and Ethereum queries send the selected public address to fixed HTTPS providers for current state and confirmed lifetime history. These indexed/RPC results are provider data, not local consensus verification.
- Dash Core history comes from DashScan after synchronization and indexed-tip checks. Dash Platform address and Identity state use Evo SDK proofs; compatible indexed history comes from Dash Platform Explorer and remains auxiliary. Payment-address history is checked against proof-verified current balance before it is accepted.
- A full Dash public key is converted to its lookup HASH160 locally when that is the required identifier. Dash Orchard viewing keys remain local; network requests contain public aligned pool ranges. A viewing key cannot spend funds but can reveal sensitive wallet activity.
- Raw 32-byte Orchard material is accepted as an OVK only through the explicit advanced type because its length alone cannot distinguish it from spending material. Versioned bundles must match the selected network.
- Viewer controls stay disabled until the embedded Orchard runtime passes fixed public tests and the same-document Evo Blob Worker completes its startup handshake.
- CSV/XLSX/JSON exports for all included coin adapters are generated locally from the loaded Single or Batch result snapshot and exclude Orchard viewing keys and private input material. They can still contain privacy-sensitive addresses, identities, transactions, notes, memos, commitments, nullifiers, and activity patterns.

### Shared boundary ownership

- `packages/secret-boundary` owns public-input rejection, registered-secret egress checks, and explicit byte disposal.
- `packages/network-boundary` owns neutral request/response DTOs, MessagePort cancellation, and the worker runtime; it does not import provider implementations.
- The Network Worker treats every `MessagePort` message as untrusted. Its build-generated allowlist contains only operations for selected coins and validates exact envelope/payload keys, operation-specific public fields, networks, hashes and batch/range ceilings before selecting a provider method. Unexpected fields such as `mnemonic` or `privateKey` are rejected rather than ignored.
- `packages/public-data-providers` owns fixed Bitcoin/Ethereum public endpoints and response validation.
- `packages/secret-vault` owns the opaque iframe channel bootstrap, while `packages/wallet-recovery` owns reusable watch-only detection and bounded local search coordinators.
- Automated module-boundary tests reject app-to-app imports, package-to-app imports, package cycles, and a provider dependency from `network-boundary`.
- The five committed Rust/WASM modules must carry the exact pinned crates.io `wasm-bindgen` producer metadata. Full builds reject source-built CLIs with extra Git metadata. A checked-in integrity manifest binds generated files to their Rust and build inputs, and the canonical container compares both the regenerated bytes and that manifest with the committed copies.

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
- Discovery CSV/JSON is a public-data projection; XLSX is generated by the outer shell only from the approved JSON projection. It excludes phrases, passphrases, seeds, private/spending keys, extended public keys, Orchard viewing keys, and internal re-derivation locators. The vault can request only a prevalidated `csv`/`json` report or an XLSX conversion of that approved JSON report through the fixed shell broker.

### PSBT & Multisig Inspector

- Optional BIP38 decryption accepts encrypted private keys/passwords and reveals recovered WIF/hex only on request; it is a local secret-handling workflow, separate from public PSBT/policy inspection.

- The artifact is offline: its CSP sets `connect-src 'none'`, blocks remote assets, and authorizes the immutable inline application script by a build-time hash.
- The PSBT parser accepts Bitcoin PSBT v0/v2 and Dash Core PSBT v0, rejects duplicate map keys, non-minimal CompactSize integers, unsupported versions, trailing data, and unreasonably large collections.
- The Script and descriptor workflows display user-provided public transaction/script/descriptor material with DOM nodes and `textContent`; they do not sign, finalize, fund, broadcast, or query UTXOs.
- The policy and ranged wallet builders accept compressed public secp256k1 keys or account public keys with explicit origin fingerprints only. They emit scripts, addresses, descriptors, checksums, derivation details, and Bitcoin/Dash watch-only import text for review and testing, but never accept or export private keys.
- Supplied-order `multi()` and BIP67 `sortedmulti()` are explicit policy choices. The utility does not silently sort supplied-order keys or present sorted descriptors for supplied-order addresses.
- The Dash Community build reuses the shared inspector modules but substitutes the Bitcoin-only MuSig2, custom Miniscript, and BIP-322 providers at bundle time, exposes only Dash Core and P2SH controls, rejects SegWit/Taproot/MuSig2 descriptors, and does not bundle `@scure/btc-signer` or `btcutil-js`.
- The optional phrase-to-preimage calculator performs only local Noble hash operations. It does not persist the phrase or make network requests; users must clear the displayed 32-byte preimage after use.

## Cryptographic review results

- Key derivation and address construction use pinned Noble/Scure primitives for BIP39, BIP32, hashing, secp256k1, Base58Check, Bech32/Bech32m, Keccak, and Schnorr operations. No custom curve or encryption primitive was introduced.
- Bitcoin Legacy, Nested SegWit, Native SegWit, and Taproot derivations are covered by fixed and independent vectors. Taproot matches the complete official BIP86 vector, including internal key, TapTweak, output key, scriptPubKey, and address. BIP380 descriptor checksums are checked against an official fixed vector.
- Message signing and BIP38 encryption re-derive one selected row inside a disposable worker, verify the requested address, return only the signature or encrypted key, and clear mutable private-key buffers. BIP38 is limited to compressed P2PKH and uses the standard fixed scrypt cost plus Noble AES with padding disabled.
- BIP85 operations in both editions and Multi-Chain BIP352 operations derive inside the worker. BIP85 results and child-wallet private material are intentionally secret and are never persisted; Silent Payment output is public scan/spend-key material and reusable addresses only. The offline artifact does not claim to discover Silent Payment transactions without imported chain data.
- Ethereum derives an uncompressed secp256k1 public key, hashes `X || Y` with Keccak-256, selects the final 20 bytes, and applies EIP-55. Results are cross-checked with ethers.
- Dash Core constants match Dash chain parameters and are cross-checked with DashHD and a published SLIP vector. Dash Purpose48 P2SH multisig cosigner derivation is separated from BIP44 single-sig paths and covered for mainnet/testnet account xpub and child-key output. Dash Platform payment derivation matches DIP17 key and DIP18 address vectors. Dash Identity DIP13 mainnet/testnet path, private key, public key, and HASH160 vectors are independently reproduced with `dashhd`.
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
12. **No independent cryptography-specialist audit has been completed.** Tests and cross-implementation vectors reduce integration risk; they do not prove absence of implementation or supply-chain vulnerabilities.

## Verification evidence and limits

The [2026-09-12 follow-up review](docs/audits/audit-06-2026-09-12.md) and [subsequent independent audit](docs/audits/audit-07-2026-09-12.md) identified descriptor/PSBT edge cases, a shared Worker lifecycle defect, test-evidence gaps, and documentation drift. Their findings remain immutable historical records. The [remediation verification](docs/audits/audit-08-2026-09-12.md) records the corrected snapshot, canonical build, artifact hashes and final 16/16 plus 38/38 browser matrices.

Historical test totals and live-provider observations are not a verification record for the current checkout. The previous unpinned “265 TypeScript / 11 Rust tests passed” summary has been withdrawn as a current-status claim. Record each new run with its source commit, command, runtime, date and result; keep real-browser acceptance separate from source-level tests.

The baseline audit identified `AUD-001-FUN001`–`AUD-001-FUN004`, `AUD-001-API001`–`AUD-001-API004`, `AUD-001-UI001`, `AUD-001-DOC001`–`AUD-001-DOC003` and `AUD-001-BLD001`. Corrections and bounded verification evidence are recorded in the [English remediation report](docs/audits/audit-02-2026-09-08.md), with one commit per finding. Full verification, a fresh build and direct `file://` browser acceptance are required before treating those corrections as release-ready. A passing source regression does not prove that the final HTML behaves correctly in a browser.

The canonical release build is defined by `Dockerfile.reproducible`: Linux/amd64, an Ubuntu 24.04-based image pinned by immutable digest, exact Node/pnpm/Rust/wasm-bindgen versions, checksum-verified installers, locked JavaScript and Cargo graphs, and a final complete verification layer without network access. Rebuilt Dash Orchard, CKD Shamir, Codex32, SSKR, and Gordian Envelope WASM/glue plus their source/output integrity manifest must byte-match the reviewed committed files. A native build can pass the same functional checks while producing different release bytes because host linkers and system libraries vary. Successful canonical verification emits `dist/verification-record.json`; the tag workflow binds published assets to its repository, commit, workflow, and run with GitHub OIDC provenance attestations.

## Release checklist

- Run `./tooling/build-reproducible.sh` from a clean checkout and compare `dist/multi-chain-edition/release/SHA256SUMS` with the published release manifest.
- Verify every downloaded HTML file against `SHA256SUMS`. Verify GitHub provenance attestations when the release pipeline produced them; do not describe manually uploaded artifacts as attested.
- Use only the Wallet Key Derivation Tool on the offline device. Open the Wallet Activity Viewer and Wallet Discovery Scanner on a clean connected device.
- Exercise Bitcoin, Ethereum, and Dash selection in every Multi-Chain application where supported. Confirm Bitcoin remains the default coin and that Dash Community artifacts expose only Dash workflows.
- Test derivation, cancellation, receive/change separation, known-address matching, reveal gates, selection, paging, copy, and exports in the offline tool.
- Test Activity Viewer Bitcoin and Ethereum Single/Batch public-address lookups plus Dash Core, Platform, Identity, and Orchard Single/Batch flows. Treat partial Orchard scans as non-authoritative.
- Test Discovery Scanner seed phrase and public key tabs in Single/Batch mode. Exercise supported Bitcoin families, Ethereum layouts, Dash components, zero-balance history, gap extension, cancellation, and secret-free CSV/JSON/XLSX export.
- Inspect connected requests and confirm that only validated public addresses, public lookup hashes/identifiers, or Orchard pool ranges cross the network boundary.
- Open final artifacts directly with current supported browsers and test startup, responsive layout, clipboard fallback, and downloads.
- Independently verify every valuable-wallet derivation or recovery finding in a standard wallet before moving funds. Move funds recovered from a seed entered into a connected browser to a new seed.
