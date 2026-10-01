# Wallet Key Derivation Tool security boundary

- This application and the PSBT & Multisig Inspector are intended for offline use. The Activity Viewer and Discovery Scanner require public network queries.
- Verify its checksum externally, disconnect all networking, and disable untrusted browser extensions before entering valuable-wallet material.
- Startup is fail-closed: the applicable BIP39, cross-protocol derivation, extended-key and Orchard self-test groups must pass before generation/derivation is enabled.
- CSP, artifact verification and source separation prohibit network APIs; an already modified HTML file or compromised browser/OS remains out of scope.
- The executable version serves this same page only to this computer (`127.0.0.1`) so that MHFE runs in fast mode. It checks the page's SHA-256 when it starts, answers nothing but the page, logs nothing and never receives what is typed into the page. Closing it does not close the page: close the browser tab too.
- "Generate with chosen words" is not recommended: every chosen word takes random bits away. The page shows how many remain, warns below 112 bits and refuses below 96; the phrase is still drawn with `crypto.getRandomValues`.
- Secret text is concealed by default and automatically reconcealed on window blur or tab hiding. This is visual protection only.
- Mutable byte arrays are cleared where supported. JavaScript strings, the DOM, garbage-collected copies, clipboard history, swap and crash dumps cannot be guaranteed erased.
- A request of 10,000 or more results requires explicit confirmation. This availability guard is not a protocol maximum.
- Optional Bitcoin/Dash Core receive and change derivations use separate result objects, row-selection sets, paging positions, watch-only descriptors and exports. Equal numeric child indices on `/0` and `/1` cannot overwrite or cross-select each other. The large-request estimate counts both branches, and clearing/resetting the application releases both result sets.
- Change addresses and their public keys are wallet-linking metadata, while their private keys are spending authority exactly like receive private keys. They use the same reveal gate and export restrictions; the word “change” does not make them less sensitive.
- The Blob worker URL is retained until the worker posts an explicit ready message (or fails/times out), avoiding premature revocation on browsers that load worker scripts asynchronously.
- Verify any valuable-wallet address/key with an independent implementation before use.

The comprehensive shared review and residual-risk list is in [SECURITY_AUDIT.md](../../SECURITY_AUDIT.md).

- Known-address search has its own revision token and disposable Worker. Clear, seed/passphrase changes, derivation settings and search-range changes terminate it and wipe its retained seed buffer; late results and errors are ignored. This best-effort cleanup does not guarantee erasure of immutable JavaScript strings or browser copies.
