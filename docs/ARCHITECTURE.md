# Repository architecture

This repository is a pnpm monorepo with three independently releasable browser applications and a shared package layer. A single root `package.json`, `pnpm-lock.yaml`, TypeScript configuration, Rust lockfile, and release pipeline prevent dependency copies from drifting between applications.

Original project code is MIT licensed. Third-party source, generated integration inputs and the Dash brand asset remain governed by the licenses and attribution recorded in the root notices.

## Applications and trust boundaries

| Application | Source | Artifact | Network | Secret input |
| --- | --- | --- | --- | --- |
| Wallet Key Derivation Tool | `apps/key-derivation` | `dist/key-derivation/Wallet_Key_Derivation_Tool.html` | CSP forbids all connections | Mnemonic, passphrase, private/spending/viewing keys |
| Wallet Activity Viewer | `apps/activity-viewer` | `dist/activity-viewer/Wallet_Activity_Viewer.html` | HTTPS enabled | Orchard viewing capability only; never mnemonic/spending key |
| Wallet Discovery Scanner | `apps/discovery-scanner` | `dist/discovery-scanner/Wallet_Discovery_Scanner.html` | HTTPS only in an outer Network Worker; inner Secret Vault has `connect-src 'none'` | Mnemonic/passphrase/seed/FVK confined to the opaque-origin vault; only public lookup material crosses fixed RPC |

Each application owns its HTML template, UI controller, app-specific styles, build script, artifact verifier, tests, README, and security notes. It may import shared packages but must not import source from another application.

## Shared packages

- `packages/crypto-core`: BIP39/BIP32 wrappers, network constants, byte-secret disposal and common types.
- `packages/coin-protocols`: offline derivation implementations. `registry.ts` is metadata-only; `runtime-registry.ts` imports cryptographic implementations and is worker-only.
- `packages/dash-network`: public Dash data providers, Platform state/history, viewing-key parsing and Orchard activity reconstruction.
- `packages/dash-shielded-wasm`: pinned Rust source, Cargo lock and generated browser WASM for Dash Orchard/ZIP-32. There is one compiled WASM binary shared at source/build time; each standalone connected artifact embeds its own release copy because artifacts must run independently.
- `packages/export-core`: generic formatter, clipboard boundary and Bitcoin descriptor handling.
- `packages/shared-ui`: common visual system. Each connected app adds only its app-specific layout.
- `packages/build-security`: immutable build passport and ambient type declarations.
- `packages/verification`: fixed BIP39 and cross-protocol startup vectors.

## Offline derivation execution

The main thread loads only adapter metadata, the BIP39 input layer and UI/export code. It validates the mnemonic and runs the BIP39 startup check. A disposable Blob Web Worker owns the runtime coin registry, cryptographic derivation, the remaining fixed-vector startup checks, and the sole embedded Orchard WASM instance. Derivation and known-address search both cross the same typed worker protocol. The final artifact verifier requires exactly one byte-identical WASM payload and one English BIP39 wordlist.

Large requests are divided into bounded batches and only a bounded result window is rendered. For adapters declaring standard `addressBranches` metadata, the same worker derives receive `/0` and optional change `/1` batches into separate result, selection, paging, watch-only and export state. Branch support is adapter metadata rather than a Bitcoin/Dash conditional in the renderer. Both branches share the requested account/network/start/count, and total-row estimates include both. Requests of at least 10,000 total rows across enabled branches require an explicit second action, but no convenience maximum is imposed below the protocol index-space limit. Request generations and cancellation tokens prevent an obsolete worker response from committing UI state.

## Connected execution

The Wallet Activity Viewer accepts public addresses or a viewing capability. The Wallet Discovery Scanner is structurally split inside one standalone HTML: an outer shell creates a network-capable Worker containing Evo SDK, then loads the complete mnemonic-bearing application as a sandboxed `srcdoc` iframe without `allow-same-origin` or `allow-downloads`. The iframe is therefore an opaque-origin Secret Vault, and its own CSP enforces both `connect-src 'none'` and `worker-src 'none'`. The shell transfers one `MessagePort`; its discriminated protocol exposes fixed public read queries, semantically validates address encodings, and never accepts a URL or secret-bearing generic payload. The shell cannot read the vault DOM, and the worker cannot access either DOM or vault memory. A separate fixed export message lets the shell save a local CSV/JSON Blob without giving the vault navigation or download capability. Per-wallet secret-egress guards protect RPC messages. A second guard checks both fully serialized exports at scan end, caches only approved public report strings, and then immediately discards its mnemonic/seed/FVK patterns. Both are defense in depth behind the structural CSP/sandbox boundary.

Recovery wallet tasks use isolated state slots and preserve input order. Seed phrases run sequentially by default, with explicit concurrency up to five available for users who accept greater DAPI tail latency. One abort-aware semaphore in the vault caps all concurrent RPC/DAPI work at five. The Network Worker maintains separate public Evo connection/quorum state per network and purpose. A batch Orchard coordinator streams each public encrypted page through all local FVK ledgers, wipes it, and only then advances by the required 2,048-action-aligned cursor. Two proof-verified empty terminal reads establish completion; a 4,096-page ceiling yields a partial result. No full-pool cache exists. Results are public projections; exports intentionally exclude the mnemonic, passphrase, seed and private/spending/viewing keys.

## Release ownership

`tooling/` compiles the pinned Rust package, builds all standalone HTML files, creates and verifies both the source-tree `dist/SHA256SUMS` and the flat GitHub release asset set, checks reproducibility, and enforces application-specific CSP/network/storage rules. Recovery build metadata rejects network/Evo inputs in the Secret Vault, secret derivation inputs in the Network Worker, and every shell dependency except the reviewed `shell.ts` plus typed `network-protocol.ts` pair. The build passport hashes source, manifests, lockfiles, tests, the canonical Docker definition, generated pinned WASM and tooling, while excluding local dependency/build caches such as `node_modules`, `.pnpm-store` and Cargo `target`.

`Dockerfile.reproducible` is the byte-level release boundary. It fixes Linux/amd64, an Ubuntu 24.04-based image digest, and exact Node, pnpm, Rust and wasm-bindgen releases. Its final complete verification runs offline and rejects any difference between rebuilt and committed WASM/glue. CI, tag releases and `pnpm build:reproducible` all use this same path, so the host distribution does not silently change release fingerprints or HTML checksums. Native builds remain supported for development and functional testing, but do not define canonical release bytes. Application build/verifier scripts remain beside their application so a future split into separate repositories does not require disentangling the build logic.

The three applications should remain separate standalone HTML release assets rather than being merged into one page. Their checksum sidecars, the root MIT `LICENSE`, and the flat `SHA256SUMS` are published beside them. Shared source packages are a development concern and are already embedded into each standalone artifact at build time.
