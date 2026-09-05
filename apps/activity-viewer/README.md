# Wallet Activity Viewer

This independent viewer integrates the official open-source Dash Platform Evo/WASM SDK and Dash Orchard fork without claiming upstream authorship or endorsement. See the repository [attribution](../../ATTRIBUTION.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).

Original project code is released under the repository's [MIT License](../../LICENSE); embedded dependencies retain their separately listed licenses.

Network-enabled, read-only standalone viewer for Dash Core addresses, Dash Platform payment addresses, Dash Platform Identities, and Dash Orchard viewing capabilities. Build output: `dist/activity-viewer/Wallet_Activity_Viewer.html`.

Core uses the replaceable DashScan provider. Platform payment-address current balance/nonce is proof-verified through Evo SDK and indexed history is loaded from Dash Platform Explorer. Identity lookup accepts a Base58 Identity ID, an explicitly labelled `idhex:<64-hex Identity ID>`, an explicitly labelled `tx:<64-hex registration transition>`, the HASH160 fingerprint of a public key registered to the Identity, compressed ECDSA/BLS public key, or DPNS name with or without `.dash`; DAPI proofs establish current Identity state, nonce, all registered keys and DPNS names, while Explorer supplies clearly labelled auxiliary indexed history. A transaction lookup accepts only an Identity creation transition, locally checks the transition hash and decodes its owner before requesting that Identity from proof-verified DAPI. Bare 64-hex values remain blocked because they are indistinguishable from raw private keys. Registration time/hash come from the actual Identity creation transition rather than Explorer's latest-transition summary, and classic registrations decode their Dash Core asset-lock outpoint locally with the pinned Evo SDK. Identity results use local tabs for overview/names, keys, activity, documents, contracts, withdrawals, and tokens; changing tabs makes no network request. Owner transactions and transfer legs sharing a transaction hash are rendered as one ledger event. Orchard encrypted-note pages are proof-verified and decrypted locally with the pinned WASM scanner.

Mnemonic, WIF, extended-private-key, raw-private-key and structured private-material patterns are rejected and erased before the viewer connects to any public lookup provider. Public keys are converted to HASH160 locally, so the full key is not sent.

The query control is fail-closed until a visible startup passport reports that the embedded Orchard runtime passed its deterministic public self-test and a real same-document Blob Worker completed a handshake. The official Evo SDK uses an embedded Blob Worker for WASM compilation, so the reviewed connected CSP permits `worker-src blob:` while still forbidding external worker URLs. Its immutable inline application script is authorized by an exact build-time SHA-256 CSP hash rather than `unsafe-inline`. The package has no published read-only browser entry point; release verification therefore uses the TypeScript compiler AST to reject known SDK transfer, withdrawal, identity-write, and broadcast calls, including literal/computed property access, optional chains, and simple aliases. This is defense in depth over known write surfaces, not a type-level proof over future APIs. The passport also contains the exact embedded dependency versions/licenses; this information is not duplicated elsewhere in the standalone page.

```bash
pnpm build:activity-viewer
node apps/activity-viewer/scripts/verify-activity-viewer-artifact.mjs
```

Live provider checks are separate from deterministic builds; see the root [release procedure](../../RELEASING.md). Read [SECURITY.md](SECURITY.md) before pasting a viewing key.
