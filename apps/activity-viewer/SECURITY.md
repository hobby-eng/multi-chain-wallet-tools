# Wallet Activity Viewer security boundary

- This application is intentionally online. Do not enter a mnemonic, BIP39 passphrase, spending key or private key.
- Raw 32-byte Orchard data is accepted as OVK only after an explicit advanced selection because its length cannot distinguish it from a spending key.
- The viewing key remains local, but a remote provider can observe the source IP, query timing and complete-pool scan pattern.
- Public Core/Platform address queries reveal those addresses to their providers.
- Core indexed history is not consensus-proofed. Platform current state and encrypted-note pages use DAPI proofs; indexed Platform history is separately trusted and cross-checked where possible.
- Exported CSV/JSON contains privacy-sensitive activity metadata even though it contains no viewing key.
- An Orchard balance/spent state is authoritative only after scanning from pool position zero through a proof-verified empty terminal page. A short non-empty response is processed and followed by another request; it is never treated as the pool end.
- Queries start disabled and fail closed until the embedded Orchard runtime passes fixed public derivation, canonical-key, malformed-key, and scanner-boundary checks.
- The connected CSP permits `worker-src blob:` because the pinned official Evo SDK creates a local compilation worker from its already embedded JavaScript. Remote and sibling worker URLs remain blocked.
- Evo SDK 4.1.0 is distributed as a combined read/write facade rather than a separate read-only browser entry point. This Viewer accepts no spending authority, calls only proof/read methods, and its release verifier rejects source calls to known transfer, withdrawal, identity-write, or broadcast methods. Unused write symbols still contribute to artifact size and dependency attack surface.
- The Orchard WASM build remaps private machine paths; release verification rejects `/home/<user>`, `/Users/<user>`, and Windows user-profile paths in the binary.

See the root [security audit](../../SECURITY_AUDIT.md) for provider and host-compromise limitations.
