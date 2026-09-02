# Wallet Key Derivation Tool security boundary

- This is the only application in the repository intended for an offline computer.
- Verify its checksum externally, disconnect all networking, and disable untrusted browser extensions before entering valuable-wallet material.
- Startup is fail-closed: 14 fixed BIP39, cross-protocol derivation, extended-key and Orchard vectors must pass before generation/derivation is enabled.
- CSP, artifact verification and source separation prohibit network APIs; an already modified HTML file or compromised browser/OS remains out of scope.
- Secret text is concealed by default and automatically reconcealed on window blur or tab hiding. This is visual protection only.
- Mutable byte arrays are cleared where supported. JavaScript strings, the DOM, garbage-collected copies, clipboard history, swap and crash dumps cannot be guaranteed erased.
- A request of 10,000 or more results requires explicit confirmation. This availability guard is not a protocol maximum.
- Optional Bitcoin/Dash Core receive and change derivations use separate result objects, row-selection sets, paging positions, watch-only descriptors and exports. Equal numeric child indices on `/0` and `/1` cannot overwrite or cross-select each other. The large-request estimate counts both branches, and clearing/resetting the application releases both result sets.
- Change addresses and their public keys are wallet-linking metadata, while their private keys are spending authority exactly like receive private keys. They use the same reveal gate and export restrictions; the word “change” does not make them less sensitive.
- The Blob worker URL is retained until the worker posts an explicit ready message (or fails/times out), avoiding premature revocation on browsers that load worker scripts asynchronously.
- Verify any valuable-wallet address/key with an independent implementation before use.

The comprehensive shared review and residual-risk list is in [SECURITY_AUDIT.md](../../SECURITY_AUDIT.md).
