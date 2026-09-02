# Wallet Activity Viewer

This independent viewer integrates the official open-source Dash Platform Evo/WASM SDK and Dash Orchard fork without claiming upstream authorship or endorsement. See the repository [attribution](../../ATTRIBUTION.md) and [third-party notices](../../THIRD_PARTY_NOTICES.md).

Original project code is released under the repository's [MIT License](../../LICENSE); embedded dependencies retain their separately listed licenses.

Network-enabled, read-only standalone viewer for Dash Core addresses, Dash Platform payment addresses, and Dash Orchard viewing capabilities. Build output: `dist/activity-viewer/Wallet_Activity_Viewer.html`.

Core uses the replaceable DashScan provider. Platform current balance/nonce is proof-verified through Evo SDK and indexed history is loaded from Dash Platform Explorer. Orchard encrypted-note pages are proof-verified and decrypted locally with the pinned WASM scanner.

The query control is fail-closed until a visible startup passport reports that the embedded Orchard runtime passed its deterministic public self-test and a real same-document Blob Worker completed a handshake. The official Evo SDK uses an embedded Blob Worker for WASM compilation, so the reviewed connected CSP permits `worker-src blob:` while still forbidding external worker URLs. The package has no published read-only browser entry point; release verification therefore scans Viewer and shared network sources and rejects calls to known SDK transfer, withdrawal, identity-write, and broadcast methods. The passport also contains the exact embedded dependency versions/licenses; this information is not duplicated elsewhere in the standalone page.

```bash
pnpm build:activity-viewer
node apps/activity-viewer/scripts/verify-activity-viewer-artifact.mjs
```

Live provider checks are separate from deterministic builds; see the root [release procedure](../../RELEASING.md). Read [SECURITY.md](SECURITY.md) before pasting a viewing key.
