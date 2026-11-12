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

With the MHFE wallet check, a chosen word or a word never to use also takes the phrase outside MHFE's proof of the check, whether or not anyone knows the word: see [The wallet check and its proof](#the-wallet-check-and-its-proof).

<!-- The "?" of the Telegram option on the Deriver page links to this heading
(TON_PHRASE_SECURITY_NOTE in tooling/key-derivation-features.mjs), and
tooling/ton-phrase-security-link.test.mjs checks that it exists: keep the heading as it is. -->

## A phrase the Telegram wallet accepts, protected with MHFE

"Generate a phrase the Telegram wallet accepts" draws a BIP39 phrase that is also a TON phrase: it passes TON's own check, which about one random phrase in 256 passes. The Telegram wallet derives its key from the words alone, by TON's own scheme, without a BIP39 passphrase. Once such a phrase is encrypted with MHFE, the phrase that each MHFE password recovers can therefore be tested without the passphrase, in two ways:

- **By the Telegram wallet's address.** For any phrase protected with MHFE, the addresses of a used wallet show which password is right; that is not new. What is new is that the Telegram wallet's address does not depend on the BIP39 passphrase. Once that wallet has a history, someone can derive its address from the phrase each password guess recovers and look it up offline in a list of used TON accounts. A match gives the MHFE password without the passphrase, which is then searched on its own.
- **By TON's check.** Even while the Telegram wallet has no history, the right password always recovers a phrase that passes TON's check, and a wrong one only about once in 256. Every password still costs the full Argon2 work, but about 255 of 256 wrong passwords are then set aside before any passphrase is tried.

What this costs:

- **With a BIP39 passphrase.** Normally the password and the passphrase must be searched together, so that their costs multiply; with the MHFE wallet check, MHFE's proof states this ([A.6](https://github.com/hobby-eng/mhfe-spec/blob/main/docs/DESIGN-NOTES.md#a6-theorem-5-a-24-word-source-with-an-unknown-bip39-passphrase)). A used Telegram wallet separates them: the password is found first and the passphrase after it, and the passphrase no longer multiplies the cost of the password search. While the Telegram wallet has no history, TON's check makes the combined search up to about 256 times cheaper (8 bits), less where Argon2's work outweighs the passphrase work. With the MHFE wallet check, the phrase is outside that proof: the specification names such a check, computed from the phrase alone, as the danger the proof excludes (mhfe-spec 3d88078; [The wallet check and its proof](#the-wallet-check-and-its-proof)).
- **Decoys.** A decoy password opens a phrase that fails TON's check about 255 times in 256. The surer someone is that the wallet is a Telegram one, the more the check tells them. To someone who knows its address, a used Telegram wallet tells a decoy from the real one outright.

To avoid this:

- Keep such a phrase as a separate wallet for the Telegram wallet alone, so that your other funds sit on a phrase without this condition.
- Or use an ordinary phrase and hold TON at its Ledger path, `m/44'/607'/0'/0'/i'/0'`, or its Trust Wallet path, `m/44'/607'/i'`, which the page derives from any BIP39 phrase. These keys are for wallets that offer those paths, and a phrase used with a BIP39 passphrase needs one that also takes the passphrase there. They are not the Telegram wallet's keys, which TON's own scheme derives from the words of a TON phrase, not from the BIP39 seed (ton-crypto, read on 2026-11-10).

## The wallet check and its proof

Theorem 5 of MHFE's specification proves what the wallet check protects when a BIP39 passphrase is used ([A.6](https://github.com/hobby-eng/mhfe-spec/blob/main/docs/DESIGN-NOTES.md#a6-theorem-5-a-24-word-source-with-an-unknown-bip39-passphrase)). Its conditions are in the specification's README, [Generation and recovery](https://github.com/hobby-eng/mhfe-spec/blob/main/README.md#optional-source-profile-a-recovery-check-for-new-24-word-phrases), and [A.7](https://github.com/hobby-eng/mhfe-spec/blob/main/docs/DESIGN-NOTES.md#a7-what-the-proofs-do-not-cover) lists what it does not cover. For the Deriver:

- **Every word from the draw.** The proof covers only a phrase whose every word comes from the draw. A chosen word, a word never to use or the Telegram condition draws from a subset of the phrases and takes the phrase outside it.
- **The count.** The page shows the draws tried, which the specification allows since mhfe-spec b155665: the proof then adds about `2^-120`, or `2^-120 + (w-1)·2^-136` on `w` workers ([A.6](https://github.com/hobby-eng/mhfe-spec/blob/main/docs/DESIGN-NOTES.md#a6-theorem-5-a-24-word-source-with-an-unknown-bip39-passphrase), "The number of trials").
- **The elapsed time.** The specification allows it only if a trial's duration depends neither on its value nor on the passphrase. A BIP39 seed's computation time depends on the byte lengths of the phrase and of the passphrase, so the time the page shows, while it draws and when the phrase is found, is outside that condition. The page shows it anyway: the person at the screen sees the clock, anyone watching can time the draw without the page, what the time adds depends only on those byte lengths, and the page stores and sends nothing.
- **Threads.** With more than one thread, the phrase of the worker that finds one first is taken. The specification covers such a race only if the order in which trials finish does not depend on their values ([A.6](https://github.com/hobby-eng/mhfe-spec/blob/main/docs/DESIGN-NOTES.md#a6-theorem-5-a-24-word-source-with-an-unknown-bip39-passphrase), the selection rule). Here it does, slightly: before PBKDF2, a trial normalizes the phrase (NFKD) and encodes it as UTF-8, measured at roughly 25 ns a byte, and two phrases typically differ by about 9 bytes, about `2^-12` of a trial or less. The byte length can change which phrase is taken only when another worker's trial in flight also passes, about `2^-16` for each, and finishes within that difference: about `(w-1)·2^-28` per generation on `w` threads, and then the shorter phrase tends to win. This estimate is ours, not part of the specification's proof. With Threads set to 1 the draw is the specification's sequential procedure, its count included; only the elapsed time stays outside.
