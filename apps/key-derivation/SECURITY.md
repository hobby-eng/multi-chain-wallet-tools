# Wallet Key Derivation Tool security boundary

- This application and the PSBT & Multisig Inspector are intended for offline use. The Activity Viewer and Discovery Scanner require public network queries.
- Verify its checksum externally, disconnect all networking, and disable untrusted browser extensions before entering valuable-wallet material.
- Startup is fail-closed: the applicable BIP39, cross-protocol derivation, extended-key and Orchard self-test groups must pass before generation/derivation is enabled.
- CSP, artifact verification and source separation prohibit network APIs; an already modified HTML file or compromised browser/OS remains out of scope.
- The executable version serves this same page only to this computer (`127.0.0.1`) so that MHFE runs in fast mode. It checks the page's SHA-256 when it starts, answers nothing but the page, logs nothing and never receives what is typed into the page. Closing it does not close the page: close the browser tab too.
- "Generate with a chosen word" is not recommended: a chosen word takes random bits away, and someone who learns or guesses it can rule out almost every wrong MHFE password and tell the wallet from a decoy; [A chosen word](#a-chosen-word) below explains how. The page shows how many bits remain; the phrase is still drawn with `crypto.getRandomValues`.
- Secret text is concealed by default and automatically reconcealed on window blur or tab hiding. This is visual protection only.
- Mutable byte arrays are cleared where supported. JavaScript strings, the DOM, garbage-collected copies, clipboard history, swap and crash dumps cannot be guaranteed erased.
- A request of 10,000 or more results requires explicit confirmation. This availability guard is not a protocol maximum.
- Optional Bitcoin/Dash Core receive and change derivations use separate result objects, row-selection sets, paging positions, watch-only descriptors and exports. Equal numeric child indices on `/0` and `/1` cannot overwrite or cross-select each other. The large-request estimate counts both branches, and clearing/resetting the application releases both result sets.
- Change addresses and their public keys are wallet-linking metadata, while their private keys are spending authority exactly like receive private keys. They use the same reveal gate and export restrictions; the word “change” does not make them less sensitive.
- The Blob worker URL is retained until the worker posts an explicit ready message (or fails/times out), avoiding premature revocation on browsers that load worker scripts asynchronously.
- Verify any valuable-wallet address/key with an independent implementation before use.

The comprehensive shared review and residual-risk list is in [SECURITY_AUDIT.md](../../SECURITY_AUDIT.md).

- Known-address search has its own revision token and disposable Worker. Clear, seed/passphrase changes, derivation settings and search-range changes terminate it and wipe its retained seed buffer; late results and errors are ignored. This best-effort cleanup does not guarantee erasure of immutable JavaScript strings or browser copies.

## A chosen word

"Generate with a chosen word" puts one word you choose into a new phrase, at a position you choose or anywhere. As long as nobody knows or can guess the word and its place, this changes almost nothing: a 24-word phrase keeps at least 245 of its 256 random bits, a 12-word phrase at least 117 of its 128, and nothing below applies.

If someone knows or guesses the word, for example because it means something to you, it costs you in these ways:

- The phrase has fewer random bits for that person: a word at a fixed position takes 11 bits; a word anywhere takes about 6 to 7½, the most in a 12-word phrase. The panel shows what remains at every length.
- If the phrase is encrypted with MHFE, the word lets them recognise the right password. Every password they try still costs the full Argon2 work. But a wrong password gives another phrase, and that phrase holds the word at its place only about once in 2,048, or, for a word anywhere, about once in 85 in a 24-word phrase and once in 170 in a 12-word one. So they can set aside about 99.95% of wrong passwords at once (about 99% for a word anywhere), offline, without deriving addresses or looking at a blockchain. Without the word, a wrong password of a 24-word phrase gives a phrase that looks as valid as the right one, and only its addresses on a blockchain show which is real. This matters most where MHFE cannot tell a wrong password itself: a 24-word phrase, or a container that keeps a shorter phrase's length.
- A BIP39 passphrase does not help here: the word is visible in the phrase itself, before any passphrase is used.
- The same sign tells your real wallet from a decoy, because a phrase that another password opens will not hold the word. Choose no word for a wallet you would protect with a decoy.

That is why one word is the limit: two known words would give 22 bits, which picks out the right password almost for certain.
