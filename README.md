# Multi-Chain Wallet Tools

This monorepo builds three deliberately separate standalone applications while sharing one pinned dependency graph, cryptographic core, Dash network layer, Orchard WASM package, UI theme, verification vectors, and release toolchain.

This is an independent integration project, not an official or endorsed Dash product. Dash Platform specifications, Evo/WASM SDK code, and the Dash Orchard fork remain the work of their respective upstream contributors; see [ATTRIBUTION.md](ATTRIBUTION.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Original project code is released under the [MIT License](LICENSE), copyright (c) 2026 hobby-eng. Third-party components retain their own licenses and copyright notices.

The **Wallet Key Derivation Tool** is emitted as `dist/key-derivation/Wallet_Key_Derivation_Tool.html`. It has no server, runtime install, sibling files, remote resources, telemetry, or network APIs. It is intended to be copied to a trusted offline computer and opened directly in a current browser.

The **Wallet Activity Viewer**, emitted as `dist/activity-viewer/Wallet_Activity_Viewer.html`, performs read-only Dash Platform shielded-pool scanning with an Orchard viewing key and public-address lookups for Dash Core and Dash Platform. It is network-enabled and must not be confused with the offline key derivation tool.

The network-enabled **Wallet Discovery Scanner**, emitted as `dist/discovery-scanner/Wallet_Discovery_Scanner.html`, derives candidate resources locally from one or several BIP39 phrases and scans Dash Core receive/change addresses, Platform payment addresses, Platform identities, and the complete Orchard pool. It exports a secret-free discovery report for use with a standard Dash wallet. It has no arbitrary user-facing address-count cap: large Core and Platform ranges are processed in bounded provider batches, with progress and findings shown while the scan is running. The configured address totals are minimums: Core and Platform automatically continue until 20 addresses after the last used address. Protocol index-space limits still apply.

Application-specific operating and security guidance lives beside each source tree: [Wallet Key Derivation Tool](apps/key-derivation/README.md), [Wallet Activity Viewer](apps/activity-viewer/README.md), and [Wallet Discovery Scanner](apps/discovery-scanner/README.md). See [Architecture](docs/ARCHITECTURE.md) for package ownership and trust boundaries.

This is security-sensitive reference software, not a substitute for a hardware wallet. Test recovery with an empty wallet and verify valuable-wallet results using a second independent offline implementation.

## Supported protocols

| Protocol | Default path / index model | Address/key result |
| --- | --- | --- |
| Bitcoin Legacy | receive `m/44'/0'/0'/0/i`; optional change `…/1/i` | P2PKH, compressed key, WIF |
| Bitcoin Nested SegWit | receive `m/49'/0'/0'/0/i`; optional change `…/1/i` | P2SH-P2WPKH, compressed key, WIF |
| Bitcoin Native SegWit | receive `m/84'/0'/0'/0/i`; optional change `…/1/i` | P2WPKH Bech32, compressed key, WIF |
| Bitcoin Taproot | receive `m/86'/0'/0'/0/i`; optional change `…/1/i` | BIP86 P2TR Bech32m, child and tweaked key details |
| Ethereum EOA | `m/44'/60'/0'/0/i` | EIP-55 address, uncompressed public key, raw secret hex |
| Dash Core | receive `m/44'/5'/0'/0/i`; optional change `…/1/i` | Core P2PKH, compressed key, Dash WIF |
| Dash Platform | `m/9'/5'/17'/0'/0'/i` | DIP17 key, DIP18 Platform P2PKH Bech32m address |
| Dash Shielded | `m/32'/5'/account'`, external address index `i` | Official Dash Orchard spending/viewing material and receive address |

Bitcoin and all Dash modes support mainnet/testnet network separation. Ethereum EOA address formatting is chain-independent. The coin type changes to `1'` for test networks. In the Wallet Key Derivation Tool the change branch is opt-in and uses the same account, start index, count, network, and address format as the selected receive variant. Enabling it derives an additional result set; it does not replace the receive addresses.

## Architecture and extension model

Cryptographic derivation is not mixed into the UI. The layers are:

```text
apps/key-derivation       offline UI, worker protocol, single-file build and verifier
apps/activity-viewer      connected public-address/Orchard viewer and verifier
apps/discovery-scanner    connected modular discovery scanner and verifier
packages/crypto-core      BIP39/BIP32 and shared secret-safe primitives
packages/coin-protocols   Bitcoin/Ethereum/Dash derivation adapters and registries
packages/dash-network     reusable Dash Core/Platform/Orchard query and scan logic
packages/dash-shielded-wasm pinned Rust Orchard adapter plus generated browser WASM
packages/export-core      shared descriptor/clipboard/export formatting
packages/shared-ui        shared visual system
packages/verification     fixed startup and release vectors
tooling                   locked builds, manifests, reproducibility and release checks
test                      cross-implementation support fixtures
```

`CoinAdapter` is the stable offline extension boundary. Its metadata-only registry is safe to load in the main UI; the runtime registry and cryptographic implementations load only inside the disposable derivation worker. The renderer, bounded address finder, and formatter operate on adapter/result metadata and do not contain coin-ID branches. See [EXTENDING.md](EXTENDING.md) for the addition checklist.

## Basic, advanced, selection, and export behavior

Basic mode uses a compact horizontal table for per-address path/index, address, public-key, and private-key data. Bitcoin Legacy, Nested SegWit, Native SegWit and Taproot plus Dash Core optionally derive the standard change branch `/1`; Receive `/0` and Change `/1` are separate tabs with independent selections, paging and exports. Advanced mode keeps the expanded vertical cards and immediately adds account/root and protocol-specific diagnostic fields; it does not hide them behind a second disclosure control. Account-scoped material is visually separated from address rows and carries a warning that one exposed root/account secret compromises every descendant. Taproot separately labels the BIP32 child key, x-only internal key, TapTweak, output key, and BIP341-tweaked secret. Shielded output uses Orchard terminology and does not invent a secp256k1 public key or WIF. For explicit recovery convenience, Basic Shielded rows repeat the account-wide spending key and FVK beside every diversified address, with labels warning that these are the same account keys rather than address-specific keys; Advanced adds IVK, OVK, raw `d || pk_d`, and encoding details.

Newly generated or pasted valid phrases derive 20 rows automatically, matching the common address-gap convention used by many HD wallets. Editing the BIP39 passphrase, switching coins, or selecting another derivation tab also re-derives automatically after a short debounce. Adapter settings are remembered independently. There is no artificial 50-result user limit: large requests run inside a disposable Web Worker in internal batches of 50, appear as batches complete, report progress, and can be terminated immediately while keeping completed rows. Requests of 10,000 or more results require a second explicit confirmation that reports the batch count and a conservative memory range; remembered totals above 20 are never started automatically by an input or tab change. The page retains result data for selection/export but renders only a bounded window (200 Basic rows or 24 Advanced cards) into the DOM. Previous/Next controls navigate those windows. The only total bound is the selected protocol's valid index space.

The bounded “Find a known address” control checks an expected address across a user-selected local index range without network access, searches both receive and change branches when optional change generation is enabled, and uses adapter-specific equality only where the protocol requires it (currently EVM address case).

Every row can be selected independently. Select all, none, and invert operate on the current result indices, including rows outside the visible window. Every bulk action is restricted to selected rows. Full-row exports follow the visible mode: basic mode cannot leak advanced fields; advanced mode includes both basic and advanced row fields. Formats are plain values, human-readable structured text, and TSV. Clipboard actions still produce a string because that is required by the Clipboard API; the dedicated Download selected action instead emits bounded row-sized chunks through a `ReadableStream` before creating the download blob.

Mnemonic, passphrase, private/spending keys, viewing keys, and privacy-sensitive watch-only exports are concealed by default behind one red **Reveal all sensitive values** control. The generated mnemonic gets a dedicated Copy button only after that shared gate is opened, and secret-copy actions remain disabled until then. A dedicated Watch-only export panel is used only where it adds a distinct artifact: currently a Bitcoin BIP380-checksummed ranged descriptor containing the account xpub. Dash Shielded does not duplicate its raw FVK in a separate bundle panel; copy the account-wide 96-byte Full Viewing Key directly from the Shielded result. Neither an xpub descriptor nor an FVK can spend, but both expose wallet structure or activity. Copying uses only the selected value and does not read the clipboard.

## Offline and security model

The artifact has a restrictive CSP including `connect-src 'none'`, `worker-src blob:`, `object-src 'none'`, and `frame-src 'none'`. The only permitted worker is built from source already embedded inside the same HTML; network workers and sibling worker files remain impossible. The verifier rejects `fetch`, XMLHttpRequest, WebSocket, EventSource, browser storage APIs, `Math.random`, source maps, external/sibling resources, and secret-bearing value data attributes. The embedded WASM is instantiated from bundled bytes.

Before derivation controls are enabled, fail-closed startup tests run 14 fixed checks: BIP39, Bitcoin mainnet Taproot and testnet BIP49, the maximum non-hardened Bitcoin child index, Ethereum/EIP-55, Dash Core mainnet/testnet, Dash Platform mainnet/testnet, Dash Identity/DIP13 mainnet/testnet, master/account extended-key integrity, and Dash Orchard mainnet/testnet. The extended-key check exercises the one shared BIP32-summary implementation through Bitcoin BIP86, Dash Core BIP44, Dash Platform DIP17, and Ethereum BIP44. It pins the master public key/fingerprint and every account xpub (plus the Bitcoin master xpub), because address vectors alone cannot detect a regression in account/root reporting. Adapters wipe the mutable byte copies returned by key accessors after use. The BIP39 wordlist stays in the main bundle exactly once; all runtime derivation, including the sole Orchard WASM instance, stays in the worker bundle. A visible Release passport reports the package version, release date, deterministic source/build fingerprint, worker status, self-test result, expected checksum sidecar, and embedded dependency versions/licenses. The duplicate footer disclosure was removed; all three tools use the same passport placement.

No mnemonic, passphrase, result, or clipboard data is stored in localStorage, sessionStorage, IndexedDB, or cookies. Generate uses `crypto.getRandomValues`. Clear Everything empties controls and rendered secret nodes, clears result references, and removes the UI; window blur or tab hiding automatically reconceals sensitive controls and results. Derived mutable byte arrays and HD private nodes are zeroed where their APIs allow it.

JavaScript strings, DOM internals, clipboard contents, browser caches, swap, crash dumps, and garbage-collected copies cannot be guaranteed erased. Concealment is a shoulder-surfing control, not protection against malicious JavaScript, browser extensions, or a compromised OS. See [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

## Dash target and WASM boundary

The implementation targets Dash Platform v4.1.0, release commit `bfc80249b9257d775d1e5260b8bda47f6fcc8674` (stable on 2026-07-27), and the current DIP17/DIP18 Platform payment specifications reviewed on 2026-09-01.

Shielded derivation uses the official `dashpay/orchard` fork at tag `dashified-0.14.1`, exact commit `38ac9c19a2df7bf3eeadc22ab23053e8fd538828`. The Rust adapter validates inputs, calls official `SpendingKey::from_zip32_seed`, `FullViewingKey`, scoped viewing-key, and `address_at` APIs, then returns canonical raw encodings. TypeScript validates those lengths/indices and only applies the Dash type-byte/Bech32m display encoding. No Orchard, ZIP32, Pallas/Vesta, Halo2, or RedPallas arithmetic is reimplemented here.

See [DASH_IMPLEMENTATION.md](DASH_IMPLEMENTATION.md) for exact protocol choices, pins, and update risks.

## Wallet Activity Viewer

`Wallet_Activity_Viewer.html` has three explicit tabs ordered **Dash Core → Dash Platform → Dash Orchard**, with Core as the default public-lookup view. Switching tabs clears the previous input, results, diagnostics, and export state so a public address or privacy-sensitive viewing key cannot remain in an unrelated mode. Shielded accepts the versioned viewing bundle plus all three raw Orchard watch capabilities. It rejects a bundle whose recorded network differs from the selected viewer network. The recommended 96-byte Full Viewing Key (FVK) provides incoming recovery, outgoing recovery, note-nullifier spent detection, and a balance after a complete scan. A 64-byte Incoming Viewing Key (IVK) provides received notes only; a 32-byte Outgoing Viewing Key (OVK) provides sent outputs only. Because raw OVKs and spending keys have the same length, OVK use requires an explicit advanced selection and warning instead of unsafe automatic classification. The UI marks unavailable values instead of fabricating zeros. No mnemonic, spending key, or private-key capability is used by the viewer.

Dash Core mode validates the address and selected network, then uses the Dash-specific, open-source DashScan index for Mainnet or Testnet. Before accepting results it requires DashScan's synchronization status to be `ok` and records the latest indexed Core height and timestamp in diagnostics. It shows current balance, pending net change, lifetime received/spent-input totals, total transaction count, and up to 1,000 newest transactions. Each ledger item shows date/time, transaction type, block height, confirmations, InstantSend/ChainLock state, outputs received by the address, inputs spent from it, net address effect, fee when derivable, transaction ID, and block hash. A public-address lookup is still linkable metadata: DashScan sees the queried address and source IP.

The Core lookup is isolated behind a `CoreAddressProvider` adapter in `packages/dash-network/src/public-address.ts`, so a future Dash-operated endpoint can replace DashScan without changing validation, rendering, or the rest of the viewer. `explorer.dash.org` was evaluated, but its current Cloudflare/CORS behavior does not permit reliable direct requests from a standalone local HTML file.

Dash Platform address mode validates DIP18 Bech32m and uses Evo SDK trusted quorum discovery plus `getWithProof` to verify current balance and outgoing nonce. It separately requires the open-source Dash Platform Explorer index to report `synced`, records its latest indexed Platform height/time, and loads lifetime incoming/outgoing totals plus up to 1,000 newest address transitions on Mainnet or Testnet. Each transition shows direction, date/time, type, status, height, gas, transition hash, and block hash. Platform Explorer does not expose the amount attributable to the address on each individual transition, so the viewer does not fabricate it. Explorer-reported balance and nonce are cross-checked against DAPI; proof-verified DAPI values take precedence and a visible warning appears on disagreement. The Explorer is isolated behind a replaceable `PlatformHistoryProvider` adapter. All three modes expose a diagnostics panel with stage, network, source, request/page count, proof height/protocol where applicable, remote timestamp, remote/local/total timing, and exact stopping error.

After a query returns, its loaded summary and ledger can be downloaded as UTF-8 CSV or schema-versioned JSON. CSV is rectangular and spreadsheet-formula hardened; JSON encodes every `bigint` monetary/protocol value as a decimal string to preserve exactness. Exports never contain the input address field's raw UI value beyond the normalized public address already present in Core/Platform results, and never contain an Orchard viewing key. Only records actually loaded under the selected history cap are exported.

The viewer embeds official `@dashevo/evo-sdk` 4.1.0 and uses trusted, proof-verified `getShieldedEncryptedNotes` queries. Encrypted note fields are passed to the same pinned Dash Orchard WASM, which dispatches to capability-specific FVK, IVK, or OVK scanners. Scanning starts at pool position zero; in FVK mode, owned note nullifiers are matched against later action nullifiers to reconstruct spent/unspent state. Outputs recovered by both IVK and OVK are classified as self/change instead of external sends.

Wallet Activity Viewer queries are disabled until its visible Release passport records a passed deterministic Orchard runtime self-test. Its CSP permits same-document Blob workers because Evo SDK 4.1.0 builds its local WASM compilation worker from embedded JavaScript; external worker URLs remain blocked. The Wallet Discovery Scanner uses a stronger split boundary described below: Evo SDK runs only in a separate outer Network Worker, while the mnemonic-bearing Secret Vault has `connect-src 'none'`. Evo SDK does not publish a read-only browser subpath, so its unused write-capable symbols remain in connected bundles, but the applications call only proof/read facades and artifact verification rejects known SDK write/broadcast calls in their source trees. The release WASM build also remaps local workspace/toolchain paths and rejects private user-profile paths in generated bytes.

The DAPI encrypted-note response contains pool positions and cryptographic note fields, but not an exact state-transition ID or creation timestamp for each note. The viewer therefore reports note-level ordered activity and never fabricates transaction hashes or dates. A balance is authoritative only after a complete cold scan reaches a proof-verified empty terminal page; a short non-empty page is processed and followed rather than mistaken for the end of the pool.

The FVK is not placed in DAPI requests, storage, URLs, or telemetry. It is still privacy-sensitive, and a remote node can observe the source IP and scan timing/volume. Use the Wallet Activity Viewer on a connected trusted machine and keep the Wallet Key Derivation Tool offline.

Usage:

1. In the offline Wallet Key Derivation Tool, generate Dash Shielded results, reveal sensitive values, and copy the raw **Orchard Full Viewing Key** (96 bytes / 192 hexadecimal characters). Use Advanced mode only when you intentionally need limited IVK/OVK capability.
2. On a separate connected trusted computer, open `Wallet_Activity_Viewer.html`, select Shielded and the same network, then paste that FVK. The viewer still accepts legacy versioned viewing bundles for backward compatibility, but the derivation tool no longer creates a redundant bundle.
3. Start the complete scan and wait until the result says the cold scan reached the pool end. Partial/cancelled results are not an authoritative balance.
4. Optionally export the loaded results as CSV or JSON, then clear the viewer. Treat Orchard exports as privacy-sensitive wallet activity and do not move the viewer or exports back onto the offline derivation computer.

For a public lookup, select **Dash Core · L1 address** and paste an `X…/7…` (`y…/8…` testnet) address, or select **Dash Platform address** and paste a `dash1k…` (`tdash1k…` testnet) address. Choose how many newest history entries to display and run the query. Core diagnostics must show DashScan `ok` plus a current Core height. Platform diagnostics must show a DAPI proof height and Platform Explorer `synced` height; a source disagreement is displayed as a warning and the DAPI balance/nonce remain authoritative.

## Wallet Discovery Scanner

`Wallet_Discovery_Scanner.html` accepts a single BIP39 phrase or a batch with one phrase per line and an optional corresponding passphrase per line. It remains one portable file, but executes as two isolated browser realms. The complete UI, BIP39/HD derivation and Orchard discovery code runs in a sandboxed `srcdoc` Secret Vault without `allow-same-origin` or `allow-downloads`; its CSP sets `connect-src 'none'` and `worker-src 'none'`, so code that can see the mnemonic, passphrase, seed or FVK has no network, worker, navigation, or direct-download capability. The outer shell creates a separate Network Worker containing the trusted Evo SDK and fixed provider clients. A transferred `MessagePort` exposes only ten typed read operations; it accepts no arbitrary URL, request body, SDK method or callback. Only checksum/type/network-validated Core/Platform addresses, identity public-key hashes and Orchard pool ranges cross this channel, and returned structured-clone data is validated before accounting. Per-wallet secret-egress guards protect RPC calls. At scan end a second guard checks the fully serialized CSV and JSON for raw, hexadecimal, Base64, percent-encoded, and split secret representations; only the approved public report strings are retained, while the guard's mnemonic/seed/FVK candidates are immediately cleared. These guards are additional tripwires, not the primary CSP/sandbox boundary.

Batch mode supports one through five wallet scans, but uses one at a time by default because simultaneous Identity proof discovery can increase provider tail latency. Each active wallet owns a separate seed, counters, and result slot. Inside each wallet, Core, Platform-payment, and identity work is launched concurrently. One shared abort-aware semaphore limits all RPC/network operations to one through five active requests (five by default), so section and optional multi-wallet concurrency cannot multiply provider load without bound. The Network Worker keeps separate public Evo connections for Platform addresses, Identity discovery, and Orchard; a slow operation in one purpose cannot hold the SDK object used by another. Orchard is handled by one bounded-memory batch stream: each proof-verified page is downloaded once, scanned against every independent local FVK, wiped, and discarded before the next page.

The Dash adapter is split into independent Core, Platform-address, identity, and Orchard scanners under `apps/discovery-scanner/src/coins/dash/`. The generic registry and result/export model contain no Dash-only rendering branches, so Bitcoin and Ethereum discovery adapters can be added without rewriting the input, progress, results, or export interface.

- Core scans BIP44 `m/44'/coin_type'/account'/0/index` receive and `/1/index` change chains. Exact public P2PKH addresses are sent in batches of 50 after DashScan reports synchronized. DashScan is deliberately the only Core source in this build: removing optional comparison providers avoids their outages and rate limits stopping recovery, while the result is visibly marked single-source and must be verified with a standard Dash wallet. Any address with a balance or transaction history extends its branch target to 20 positions beyond that index.
- Platform payment addresses scan DIP17 `m/9'/coin_type'/17'/account'/0'/index` and use Evo SDK `getManyWithProof` in batches of 100. A positive balance or outgoing nonce extends the same 20-address post-use gap.
- Identity discovery scans the Dash wallet identity authentication path `m/9'/coin_type'/5'/0'/0'/identity_index'/0'`, queries only the HASH160 of the public key through proof-verified DAPI, and stops on the configured empty gap or maximum attempts. Up to five independent proof requests are issued together, then their results are committed in ascending index order so gap accounting is deterministic. Evo SDK 4.1.0 exposes only single-hash proof calls for the unique and non-unique indexes, so an empty candidate requires two logical proofs and a 20-index empty gap normally means about 40 proof queries per phrase. The result reports exact query count, elapsed time, and average/maximum provider latency.
- Orchard derives the account FVK locally, never supplies it to the SDK, and scans proof-verified encrypted-note pages from pool position zero. DAPI requires starts aligned to the requested 2,048-action chunk, so a short page advances to the next aligned cursor rather than by its returned item count. Completion requires two proof-verified empty reads at that cursor; 4,096 pages is a deliberate safety ceiling and yields `partial`, never a false `complete`. Note values are Platform credits throughout the WASM/TypeScript boundary and are converted to DASH only by the shared exact-integer summary formatter. The credit unit is pinned to official `dashpay/platform` commit `1c128acaf92e68a147086f9b87810dae5cc21993`: the SDK documents `1 DASH = 1e11` credits and the official wallet test passes `value_credits` directly into Orchard `NoteValue::from_raw`.

Address count inputs have no arbitrary HTML maximum. A request for 100,000 Core addresses is accepted and becomes at least roughly 2,000 address batches for that branch; automatic post-use gap extension can add more. It can take a long time and reveal a distinctive address-query pattern to the providers. Cancellation is observed while waiting for the shared semaphore and between bounded operations. Increasing batch-seed concurrency retains more independent secret state in memory until those scans finish; the global request limit controls provider load separately. The only hard address bound is the non-hardened BIP32 index space (`0` through `2^31 - 1`).

Core and Platform result lists show only addresses with a current positive balance by default. Orchard likewise shows only incoming notes that remain spendable, while spent and outgoing/self records are still processed internally because their nullifiers are required to reconstruct the correct balance. A separate opt-in includes previously used zero-balance Core/Platform resources plus already-spent and outgoing-only Orchard activity in the page and CSV/JSON; hidden used addresses still extend gap discovery and cannot cause a later funded address to be skipped. Displayed Core resources are enriched through DashScan. Displayed Platform payment addresses and identities receive auxiliary operation/event counts, lifetime received/sent totals, identity fees and first/last-seen times from a synchronized Platform Explorer index only after its balance exactly matches proof-verified DAPI state. A missing or inconsistent history response leaves the authoritative balance visible with a warning. Orchard reports external received/sent and self/change totals, note counts, note values, and first/last/spend pool positions. Pool positions are not transaction counts or timestamps: the encrypted Orchard feed does not expose a transaction hash or calendar time for each action. CSV schemas are component-aware, so a Core-only export omits Platform, Identity and Orchard columns; mixed scans receive the union required by their non-skipped sections. DashScan's fast batch endpoint does not expose exact input/output occurrence counts; computing those would require downloading every paginated transaction and is deliberately excluded from the main recovery scan. The history option is therefore discouraged for CoinJoin-heavy wallets because even the summary requests can substantially increase scan time.

The phrase fields are retained by default so changing the historical-activity option and starting a fresh scan is explicit and reliable; the new run replaces the previous report and receives a new abort controller, cache, and ordered result set. An optional checkbox clears the visible phrase fields at scan start, in which case a later scan requires re-entry and no hidden reusable phrase copy is kept. Per-seed progress rows show Core, Platform, identity, and Orchard stages independently while preserving source-line result order.

Recovery build and startup checks make the isolation a release property rather than a convention. The build rejects Evo/network-service/direct-download modules in the vault graph and secret derivation/guard modules in the Network Worker graph. Both inline scripts are authorized by exact SHA-256 CSP hashes. The artifact verifier checks the sandbox flags, inner/outer CSP split, fixed RPC allowlist, absence of direct network/download primitives in vault source and arbitrary-URL RPC input, and exact embedded WASM/checksum. At startup, scanning stays disabled until the vault proves it cannot read the parent DOM, verifies its own network/worker-denied CSP, completes cryptographic checks including independently reproduced mainnet/testnet DIP13 vectors, and receives the expected Network Worker handshake. CSV/JSON text crosses a separate fixed message to the shell, which chooses the filename/MIME and creates a local Blob.

The page deliberately does not create or broadcast spending transactions. It has not received an independent cryptography-specialist audit, and pinned production dependencies do not audit their integration. If funds are found, export CSV or JSON, independently verify the public address/path/index, restore the phrase and passphrase in a standard Dash wallet obtained from its official source on a clean device, and move the funds to a newly generated wallet. Reports use exact decimal integer strings, protect CSV cells from spreadsheet formulas, and contain no mnemonic, passphrase, seed, private key, spending key, or viewing key.

## Prerequisites and reproducible build

The JavaScript lockfile declares pnpm 11.19.0 and Node 24+. The Shielded build is deliberately stricter: Rust/Cargo 1.85.1, target `wasm32-unknown-unknown`, and `wasm-bindgen-cli` 0.2.100. Exact npm, Cargo, Orchard git, and secondary Dash git revisions are locked.

```bash
pnpm install --frozen-lockfile
rustup toolchain install 1.85.1
rustup target add wasm32-unknown-unknown --toolchain 1.85.1
cargo +1.85.1 install wasm-bindgen-cli --version 0.2.100 --locked
pnpm verify
```

`pnpm verify` performs TypeScript checking, JS tests, the same fixed-vector startup self-tests against bundled WASM, native Rust tests, a locked release WASM rebuild, a runtime test of the generated browser WASM, two consecutive builds of all three HTML artifacts compared byte-for-byte, release-manifest verification, and separate static/CSP/checksum verification. `pnpm verify:ci` performs the same source, vector, runtime-WASM, HTML determinism and artifact checks while deliberately reusing the committed generated WASM; the separate GitHub full-WASM workflow rebuilds it with the exact Rust toolchain and requires a clean diff. `pnpm build:quick` rebuilds only the Wallet Key Derivation Tool and reuses already-generated WASM; use it only when no Rust/WASM input changed. Live network checks are explicit and excluded from deterministic verification: `pnpm test:activity-viewer:network` checks the shielded testnet proof path; `pnpm test:activity-viewer:core-mainnet` and `pnpm test:activity-viewer:core-testnet` check DashScan; `pnpm test:activity-viewer:platform-mainnet` and `pnpm test:activity-viewer:platform-testnet` check Platform Explorer; and `pnpm test:discovery:mainnet` / `pnpm test:discovery:testnet` run the discovery adapter against a public BIP39 vector with Core, Platform, and identity queries.

The complete build writes:

```text
dist/key-derivation/Wallet_Key_Derivation_Tool.html
dist/key-derivation/Wallet_Key_Derivation_Tool.html.sha256
dist/activity-viewer/Wallet_Activity_Viewer.html
dist/activity-viewer/Wallet_Activity_Viewer.html.sha256
dist/discovery-scanner/Wallet_Discovery_Scanner.html
dist/discovery-scanner/Wallet_Discovery_Scanner.html.sha256
dist/SHA256SUMS
```

For GitHub, `pnpm release:bundle` copies the three HTML files, individual sidecars, and the project `LICENSE` into a flat `dist/release/` directory and creates a download-friendly `SHA256SUMS`. Tagged `v*` commits are rebuilt by the pinned GitHub workflow, receive build-provenance attestations and become a draft release for human review. A GPG key is not required: an optional maintainer signature can later be added with `pnpm release:sign -- YOUR_GPG_KEY_ID`, while the private key remains outside the repository and CI. See [RELEASING.md](RELEASING.md).

The build is deterministic given the pinned toolchains and dependencies, though byte-for-byte output may still vary if an underlying compiler changes despite reporting the same compatible version. The build scripts reject an unexpected Cargo version, wasm-bindgen version, or Orchard commit.

## Tests and verification sources

The automated suite covers:

- official BIP39 checksum/seed/passphrase vectors and generated 12/24-word validity;
- official BIP32 root, hardened, and non-hardened vectors;
- SLIP-0014 BIP44 Bitcoin and Dash vectors;
- official BIP49, BIP84, and complete BIP86 vectors, including TapTweak;
- the official BIP380 descriptor-checksum vector and checksummed Bitcoin watch-only descriptor construction;
- Ethereum derivation cross-checked against ethers 6.17.0 and published EIP-55 examples;
- Dash Core cross-checked against DashHD 3.3.3;
- current official DIP17 private/public/HASH160 vectors and DIP18 address vectors;
- official Dash Orchard component vectors, a fixed ZIP32 seed pin, Dash display encoding, bounds, and main/test domain separation in native Rust and the generated browser WASM;
- Dash Orchard incoming-note decryption, OVK outgoing recovery, FVK rejection/zeroing, memo decoding, spent-nullifier reconstruction, and self/change classification;
- live proof-verified pages passed through the generated scanner boundary on testnet and through complete mainnet cold scans at recorded test times; mutable live pool sizes are not treated as fixed vectors;
- registry completeness, mode-aware exports, secret classification, TSV shape, and arbitrary result selection.
- bounded multi-batch address verification and Dash viewing-bundle parsing/network binding.
- worker startup self-test vectors, bounded result-window normalization, streaming-export byte equivalence, mocked DashScan synchronization/address-history accounting, and mocked Platform Explorer synchronization/transition accounting.
- recovery secret-egress rejection before `fetch`, dynamic post-use gap extension, funded-only/history filtering, bounded concurrency with stable result ordering, live finding callbacks, exact-integer secret-free reports, and CSV formula hardening;
- live recovery-adapter Core, Platform-address, and identity proof paths on Mainnet/Testnet using a public BIP39 vector, plus bounded two/five-seed Mainnet batch smoke commands that duplicate only that public vector and report per-wallet Identity/DAPI timing.

## Responsive layout

All three HTML files collapse multi-column forms, summaries, diagnostics, action bars, and expanded cards at 900/820/560-pixel breakpoints. Long hashes and keys wrap inside their own fields, and decorative elements cannot widen the document. On a phone the page itself scrolls vertically. The one deliberate exception is the Wallet Key Derivation Tool's Basic-mode result table: it keeps readable columns and can be swiped horizontally inside its own bordered table container; this does not make the whole page scroll sideways. Advanced derivation and both connected utilities become one-column card layouts and need no horizontal page scrolling.

Expected values are fixed in the tests and are not regenerated at test time from the implementation under test. Independent libraries are development/test-only and are not bundled into the artifact.

## Direct-file offline use

1. Verify the SHA-256 digest against `Wallet_Key_Derivation_Tool.html.sha256` on a trusted computer.
2. Copy only `Wallet_Key_Derivation_Tool.html` to the offline computer.
3. Disconnect all networks and disable untrusted browser extensions.
4. Open the file directly in a current Chrome, Firefox, or Safari release.
5. Test with an empty wallet before relying on any recovered key.
6. Clear Everything and clear the OS clipboard after copying sensitive data.

The bundled artifact verifier establishes that the file has no sibling/remote resource references and no supported runtime network APIs. A final direct `file://` smoke test is still recommended for each target browser/OS combination.

## Dependencies and licenses

The Wallet Key Derivation Tool uses only the focused Noble/Scure packages plus the official Dash Orchard Rust closure. The connected Wallet Activity Viewer and Wallet Discovery Scanner additionally embed official Dash Evo SDK/WASM SDK 4.1.0. Ethers, DashHD/DashKeys/Dash secp256k1, Vitest, TypeScript, and esbuild are verification/build dependencies. Exact versions, repositories, license identifiers, and the complete Rust closure are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Original project code is MIT licensed; dependency licenses continue to apply to their respective third-party code.
