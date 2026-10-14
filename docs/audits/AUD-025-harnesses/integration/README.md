# AUD-025 startup and integration harnesses

These targeted scripts belong to the chosen/excluded-word generation audit AUD-025. The coordinator records the reviewed dirty source snapshot and HEAD in the report and local evidence. Every script prints the source or artifact SHA-256 values it actually uses. Run from the authoritative `multi-chain-wallet-tools` checkout with Node.js 26.10.0 and the already installed dependencies; neither script installs, syncs MHFE, rebuilds WASM, contacts the network, or uses private wallet data.

## Startup fault controls

```sh
node docs/audits/AUD-025-harnesses/integration/startup-mutants.mjs
```

This script calls the current actual synchronous `chosenWordsSelfTestPhrase()` component. Its healthy build must return the complete independent KAT stored in `packages/verification/src/bip39-self-test.ts`. The installed Prettier `babel-ts` parser reads that one fixture and identifies exact mutation spans in a structured AST; the test does not maintain another golden phrase or modify project files. Installed esbuild bundles only in memory, which may require the coordinator's normal subprocess permission.

Six deliberately faulty in-memory variants must fail with their specific startup diagnostics: a no-op writer, an always-zero reader, an always-null predicate, an ignored fixed-last checksum, ignored exclusions, and an ignored anywhere requirement. A fault accepted by startup exits nonzero. The healthy component and all six rejected faults print JSON records with timing, followed by the current source hash and count. This tests whether the new checks can fail; it is not statistical evidence of uniformity or a browser-control test. The first attempted harness used an unavailable TypeScript 7 compiler API; its recorded harness error remains evidence and is not an application defect.

The startup component includes 2,340 whole-byte writer comparisons against an independent 24-bit arithmetic window and 2,340 reader comparisons against independently constructed fixtures across the five BIP39 lengths, 90 positions, 13 extreme/single-bit index patterns and two byte backgrounds. These are geometry assertions, not 4,680 independent random draws. Predicate checks compare public zero-entropy word indexes pinned with independent Node `crypto` SHA-256, include accepted companions and wrong-checksum/exclusion/anywhere refusals, and refuse malformed wishes. The original complete fixed-stream 24-word phrase KAT remains exact. No startup phrase case calls host randomness; the page's separate live RNG health check still does.

## Browser Startup Gate

```sh
node docs/audits/AUD-025-harnesses/integration/startup-browser.mjs
```

This requires the already-built canonical Deriver HTML artifacts for both editions, with the current startup additions, and the installed Chromium/Firefox engines. The script uses their normal offline CSP and fresh contexts, one browser at a time. Four profile/browser cases each check healthy startup and a controlled damaged expected-KAT fixture. The healthy page must report the actual five-length bit/read and predicate checks, run its real startup worker, and enable all five Generate buttons.

The controlled fixture changes only the public complete expected phrase inside the artifact's one KAT script, using a real HTML parser, and refreshes that script's CSP hash so the actual self-test comparator fails. It does not change the generator, gate, other code, or policy permissions. The normal failure handler must close all five Generate buttons, derivation, BIP85, the full-test button, the checked-MHFE mode, and Silent Payments where present. A forged Generate click must still be refused by the handler, without publishing a phrase or dispatching derivation or a draw. Only public worker operation names are recorded. Unexpected HTTP requests, uncaught errors, missing checks, open controls, dispatches after failure, or timeouts exit nonzero.

The fixture pages are generated only in ignored `docs/audits/AUD-025-evidence/integration-startup-*-damaged-kat.html`. Each case prints engine/version, actual artifact/fixture hashes, startup/failure text and observed operation names; the summary also records current source and vendored MHFE hashes. The built artifacts' relationship to the dirty source is established by the coordinator's separate build record, not by these marker assertions alone. The probe has a 45-second whole-run deadline and never presses a full-self-test, card, Argon2 or MHFE draw button.

For the existing bounded UI regressions, the coordinator can run:

```sh
BROWSER_CASES=checked-mnemonic,mhfe-chosen-word node tooling/verify-browser-regressions.mjs
```

With no profile or engine filter, this selects only those two cases in both editions and both browsers. `checked-mnemonic` uses a public passing MHFE profile vector and checks cancellation, passphrase confirmation and stuck-RNG refusal; `mhfe-chosen-word` explicitly draws nothing and checks MHFE's rating, limits, invalid-word refusal and hints. Do not substitute the existing `self-tests` case for the bounded startup probe: that case presses the full-test button and includes unrelated slow/card checks.

The inherited `PackageCheck.require` race is tracked in MHFE AUD-014. The currently vendored package is fingerprinted here rather than synced. No normal Deriver chosen-generation UI route that overlaps a full check on the same class has been demonstrated: panel jobs share the heavy-job gate, while Generate & Derive's checked mode owns a separate MHFE engine and is cancelled by a global self-test failure. The inherited package API risk is not a claim of a new Deriver UI bypass.
