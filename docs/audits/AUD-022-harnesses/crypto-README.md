# AUD-022 crypto reviewer probes

Reviewed checkout: `c5b62c2d489e7525326071128095ba95ecca92ac`, with uncommitted changes. Source hashes and scope are in `../AUD-022-evidence/crypto-review.md`. The reviewer did not execute this harness; only the coordinator may run tests, builds or browser checks.

The six bounded probes use the single official Trezor 128-bit 2-of-3 reconstruction case, two one-input/one-output synthetic PSBTv2 script contexts, two locktime contexts, and one 16-byte candidate-list record. No secret belongs to a real wallet. No network, Argon2, age encryption, scrypt, WASM initialization, bulk vector replay, card or PDF generation is needed. One Vitest worker is allowed.

From the repository root, with the workspace Node 26.10.0 and pinned pnpm toolchain, the coordinator can run:

```sh
pnpm exec vitest run --config docs/audits/AUD-022-harnesses/crypto-vitest.config.mjs
```

Expected on the statically reviewed bytes: the unrelated-redeemScript and final-sequence assertions fail; native/bound nested SegWit and enabled-locktime controls pass. The decoder test observes one nonzero temporary entropy copy after a CRC rejection and after the input has been wiped. That test deliberately records the observation, rather than failing a confidentiality claim that the public decoder API does not make. Instrumentation retains a reference to the temporary allocation; this is not proof that the normal importer exposes a rejected list. The existing `mnemocode-contracts.audit.test.ts` already covers empty candidate-list searches and is not repeated here.

The smallest independent crypto/vector checks to add centrally, only if not already covered by the coordinator's selected run, are:

- `packages/coin-protocols/tests/bitcoin.test.ts`: `matches the complete BIP86 first receiving vector` (public BIP86 output key, Bech32m address and odd-Y secret negation).
- `packages/crypto-core/tests/bip85.test.ts`: `derives the WIF application`, `derives the XPRV application`, and `derives the English 12-word application`.
- `packages/crypto-core/tests/independent-conformance-audit.test.ts`: `matches OpenSSL PBKDF2` cases and the two `retains BIP32 leading zeros` cases. The same file contains scrypt tests; select names rather than the whole file if keeping this run free of expensive KDFs.
- The harness's `reconstructs only the official SLIP39 128-bit 2-of-3 reference case` already selects one official reconstruction vector. The normal `slip39.test.ts` official-vector test loops through the corpus; do not select that test for this bounded run.

Select each file and its test-name filter explicitly with `vitest run --maxWorkers 1 --fileParallelism false <file> -t '<name>'`. The evidence note distinguishes these proposed checks from coordinator-reported results.
