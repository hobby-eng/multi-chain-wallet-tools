# AUD-025 chosen-word boundary oracle

`run-boundaries.mjs` executes the retained independent oracle in `packages/crypto-core/tests/bip39-chosen-words-boundaries.test.ts` and prints source/test SHA-256 hashes. The reviewed base commit is `c5b62c2d489e7525326071128095ba95ecca92ac`; the dirty baseline and subsequent source fingerprints belong to the coordinator's local evidence. The generator algorithm is unchanged by this audit.

The oracle calls the actual public generator and compares complete output with a separate whole-integer BIP39 representation and Node's SHA-256, after matching published zero128, zero256 and ff256 answers. It covers all 2048 word indices at every nonfinal position of all five lengths against four edge entropies (696,320 cases), every final index and its entropy/checksum split, deliberately incorrect checksums that must advance to the second candidate, representative exhaustive final-suffix preimages, exclusion of entropy and checksum words, anywhere words with different multiplicities, neighboring-bit preservation, batch wiping and position validation. The English word list remains a trusted dependency; this is an audit of the application logic rather than an independent audit of that list or SHA-256.

From the authoritative repository root, with the workspace's Node 26.10.0 and pnpm 12.8.1:

```sh
node docs/audits/AUD-025-harnesses/bits/run-boundaries.mjs
```

The wrapper runs one Vitest worker and returns its exit status. Passing means every exact assertion passed; a failed assertion or tool failure returns nonzero. Run through the coordinator's memory guard and retain logs/command records in ignored local evidence. All data are synthetic or published vectors. No network, installation, WASM regeneration, Argon2 or cards are involved. These checks exercise the TypeScript generator at all lengths; the optional MHFE wallet-check generation mode delegates 24-word generation to MHFE and requires separate binding evidence.
