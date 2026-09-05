# Adding coins and result types

The application is designed so a new derivation family normally requires one isolated module, one registry entry, and tests—not changes to the renderer, selection system, clipboard formatter, or HTML.

## Extension contract

Implement a function that accepts one bounded internal derivation batch and returns `DerivationResult`. A result contains protocol-neutral metadata, optional account-level `basicSummary` and advanced `summary` fields, an optional privacy-sensitive `watchOnly` export, sequential row objects, and basic/advanced `ResultField` arrays. Every field declares a stable key, user-facing label, string value, and whether it is sensitive. Account-scoped keys normally belong in a summary. If a recovery workflow explicitly repeats one beside each address (as Dash Shielded Basic does), the label and description must state that it is account-wide and identical across those rows.

Register metadata in `packages/coin-protocols/src/coins/registry.ts` and the matching derivation implementation in `packages/coin-protocols/src/coins/runtime-registry.ts`. This split keeps cryptographic code and Orchard WASM out of the main UI bundle while preserving one declarative adapter model.

- a unique ID, coin-family group, full label, and concise horizontal-tab `variantLabel`;
- network behavior (the UI consistently presents `Mainnet` / `Testnet`);
- defaults and optional numeric limits;
- an optional internal `batchSize` when the adapter needs less than the default 50 results per call; this is not a user-visible total limit;
- optional branch/key-class control metadata;
- optional standardized `addressBranches` metadata when the protocol has distinct external/receive and internal/change chains; this enables generic independent Receive/Change result tabs without coin-ID logic in the UI;
- a path preview function;
- field-role keys for address, public-key, and private/spending-key bulk actions;
- optional protocol-specific `addressesEqual` behavior when exact string equality is not correct;
- the derivation function.

The UI derives unique coin-dropdown entries from adapter groups and variant tabs from the adapters inside the selected group. Set `defaultVariant: true` on at most one adapter per group; otherwise the first registered variant is used. Use `addressBranches` only when the protocol really defines standardized external/receive and internal/change chains. The generic controller will run the same adapter for both branch numbers using the same account, network, start index and count, then maintain independent result/selection/paging/export state. Keep unrelated controls such as Platform key class in `branchControl`; do not label a key class, diversifier scope, or arbitrary path component as “change”. Rendering consumes field arrays. Export uses the declared roles, current display mode, active branch, and selected indices. It never switches on adapter IDs.

## Addition checklist

1. Add the coin/network constants to a dedicated typed module; cite their authoritative source.
2. Reuse audited primitives. Do not implement low-level cryptography when a maintained library exists.
3. Add a derivation module under `packages/coin-protocols/src/coins/<family>/` returning generic results.
4. Keep per-address everyday values in `basic`; put per-address raw diagnostics and alternate encodings in `advanced`. Put account-scoped everyday material in `basicSummary` and additional root material in `summary`.
5. Mark every spending secret and privacy-sensitive viewing value with `secret: true`.
6. Add the adapter and role mappings to the registry. Only classify keys that actually match the action label; viewing keys are not spending/private keys.
7. If the protocol has a standardized watch-only representation, return it through `watchOnly` with a safe filename/MIME type, mark it privacy-sensitive, and test round-trip acceptance by its intended consumer.
8. Add authoritative fixed vectors and, where possible, an independent cross-library check. If `addressBranches` is declared, independently verify at least one `/0` and `/1` child for every affected address format.
9. Add malformed-input, network-separation, index-bound, representation, bounded address-search, and independent branch-state tests.
10. Run `pnpm verify`, inspect the generated checksum, and manually smoke-test the copied artifact offline.
11. Confirm that every added dependency's license is compatible with distribution, preserve its notices, and update README and dependency/license/Dash reports if standards or dependencies changed. The project's MIT license does not replace an upstream license.

If a future protocol needs a genuinely new control shape beyond network/account/branch/start/count, extend the adapter metadata with a declarative control descriptor and keep the UI generic. Do not add coin-ID conditionals to `apps/key-derivation/src/ui` or `packages/export-core`.

## Result-key stability

Field keys are an internal schema used by exports. Labels may improve without breaking role mappings, but changing a key requires updating its adapter role and tests. Avoid overloading one key with different semantics. Taproot child and tweaked secrets, for example, deliberately have different keys.

## WASM protocols

Keep complex official Rust integrations behind a narrow adapter. Validate every value crossing the WASM boundary (type, length, count, and sequential index), pin the upstream git commit in `Cargo.lock`, embed the resulting bytes, and add a runtime vector test against the generated WASM—not only native Rust tests.

## Viewer network providers

Public-history services are also adapters, not UI special cases. Dash Core history implements `CoreAddressProvider`; Platform address history implements `PlatformHistoryProvider`. A replacement provider must:

1. expose separate, explicit Mainnet and Testnet endpoints;
2. support direct browser CORS requests from a standalone `file://` document;
3. publish an index synchronization signal and latest indexed height/time;
4. preserve monetary values as integer duffs or Platform credits—never floating-point DASH;
5. cap and validate pagination locally even if the server ignores its requested limit;
6. treat missing addresses as empty history, but malformed responses and lagging indexes as failures;
7. receive mocked parser/pagination/failure tests and explicit live Mainnet/Testnet smoke tests.

Keep consensus-backed state separate from indexed history. The Platform adapter supplies history and aggregates, while current balance/nonce continue to come from Evo SDK `getWithProof`; the viewer compares them and gives the proof-verified values precedence.

When adding a viewer mode or changing its result schema, extend the `ViewerExportState` discriminated union, CSV/JSON mappings, and XLSX worksheet routing. Add exact-integer, empty-result, filename, worksheet-grouping, and spreadsheet-formula-injection tests. Never pass the raw input control or a viewing/private key into export state.

## Discovery scanner coin adapters

The connected Wallet Discovery Scanner has a separate extension boundary from offline derivation. Implement `RecoveryCoinAdapter` under `apps/discovery-scanner/src/coins/<family>/` and register it in `apps/discovery-scanner/src/coins/index.ts`. A coin adapter receives one already-parsed seed input, a typed scan configuration, an abort signal, a progress callback, and a live-finding callback. It returns protocol-neutral sections, exact atomic balances, public discovery fields, and an internal locator that is deliberately excluded from exports.

For a new recovery coin:

1. Derive all keys only inside the network-denied Secret Vault. Do not import a network SDK, `fetch`, XMLHttpRequest or WebSocket into a coin adapter or any file reachable from the vault bundle.
2. Add each required public read to the discriminated allowlist in `network-protocol.ts`, implement it in `network-service.ts`, and call it through `RecoveryScanContext.networkApi` plus `RecoveryNetworkGateway`. Never add a generic URL, HTTP body, SDK-method name, executable callback or proxy-style operation to the protocol. Keep the Network Worker free of BIP39, seed and private/viewing/spending-key modules.
3. Register the mnemonic, BIP39 passphrase, seed bytes, extended private keys, private/spending keys, and privacy-sensitive viewing keys with `SecretEgressGuard`. Assert the minimum public RPC payload—individual addresses, public-key hashes/descriptors or public pool ranges—immediately before port transfer. The guard is defense in depth; opaque-origin sandboxing and `connect-src 'none'` are the primary barrier.
4. Do not impose a convenience maximum on address counts. Validate against the protocol's actual index space, derive in bounded batches, emit progress/findings after each batch, and check cancellation while queued and between batches. Keep batch size and user total separate concepts. For HD account discovery, treat the configured count as a minimum and document/test the protocol's post-use gap rule; output filtering must never change discovery state.
5. Preserve atomic values as `bigint`; never parse cryptocurrency amounts through floating-point numbers.
6. Keep consensus/proof-verified state separate from third-party indexed history. Mark partial, failed, and provider-reported results explicitly.
7. Make exports a one-way public-data projection. Never export the internal locator or any phrase, seed, private/spending key, extended private key, or viewing key. Retain CSV formula hardening.
8. Add fixed derivation vectors, mocked multi-batch and secret-egress tests, malformed response tests, cancellation tests, concurrency-limit/order tests, Mainnet/Testnet separation, and explicit live smoke commands using only a documented public vector. Extend the artifact verifier so it fails if the vault bundle reaches the new network implementation or the worker reaches secret derivation code; validate every structured-clone response inside the vault before accounting.
9. Update `README.md`, `SECURITY_AUDIT.md`, `DASH_IMPLEMENTATION.md` when relevant, `THIRD_PARTY_NOTICES.md`, and `RELEASING.md` before publishing.

The current Dash implementation is intentionally split into `core-scanner.ts`, `platform-scanner.ts`, `identity-scanner.ts`, and `shielded-scanner.ts`. The generic app owns ordered batch scheduling and the shared request semaphore; coin modules own only protocol discovery. Bitcoin variants should share one Bitcoin family adapter/configuration instead of duplicating the renderer for Legacy, Nested SegWit, Native SegWit, and Taproot. Ethereum should be another adapter. Adding a coin must not add coin-ID branches to `apps/discovery-scanner/src/app.ts`.
