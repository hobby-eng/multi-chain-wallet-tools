# AUD-025 statistical controls

This test-quality review belongs to AUD-025, at reviewed HEAD `c5b62c2d489e7525326071128095ba95ecca92ac` plus the dirty baseline fingerprint `2efd4d18da3b9cd3c21e2a9ed6d582f53e9dc22050fb187b2a81534dc18c768d`. The baseline randomness test SHA-256 was `c312d49416a1abc404734145497aaf107a56fc6ba640f4493b01b605d94400e3`. The audit report pins the final added-test bytes separately. No production generator changes belong to this reviewer.

## Retained mathematical witnesses

`statistical-models.mjs` is a bounded, standalone analytic probe. It enumerates the 2048 public word indices to verify exclusion-aware bit and adjacent-bit nulls, demonstrates the original five-value isolation blind spot, and constructs opposing parity distributions that pool to uniformity. It also reports the ideal conditional-anywhere and random-insertion multiplicity models for all five lengths. It needs only the prescribed Node runtime and no dependency install, network, wallet data, project copy, or source mutation.

From the authoritative repository root:

```sh
/home/user/.local/bin/node docs/audits/AUD-025-harnesses/tests/statistical-models.mjs
```

Successful execution prints a JSON model record and exits 0; an inconsistent enumeration or formula throws and exits nonzero. This retained baseline mathematics replays on the remediated tree without requiring old source anchors or local evidence. It is not a claim that a mutated production suite was executed, and its ideal independent-word model treats the checksum as ideal-hash output.

## Actual Test Additions

The feature's existing `packages/crypto-core/tests/bip39-chosen-words-randomness.test.ts` contains the executable positive and poisoned controls. Existing 24-word datasets retain their shared deterministic stream and 20,000 samples each. Additional datasets use explicit fixed seeds, not environmental randomness:

| Word count | Fixed middle, excluded zoo | Fixed last zoo | Anywhere happy       | Excluded only |
| ---------- | -------------------------- | -------------- | -------------------- | ------------- |
| 12         | 20,000                     | 4096           | 20,000, excluded zoo | 4096          |
| 15         | 4096                       | 4096           | 4096, excluded zoo   | Not sampled   |
| 18         | 4096                       | 4096           | 4096, excluded zoo   | Not sampled   |
| 21         | 4096                       | 4096           | 4096, excluded zoo   | Not sampled   |
| 24         | 20,000                     | 20,000         | 20,000               | 4096          |

These 17 datasets total 149,152 production-generated phrases. All are independently decoded by `@scure/bip39`, which checks the checksum. They assert requested membership, per-position and pooled word histograms, exclusion-adjusted free-bit marginals, adjacent-bit joints within full words, and equal-offset bit joints across consecutive free words. The last word is omitted from full-word and joint histograms, but its free entropy bits are included where a fixed-position marginal null applies. Anywhere tests condition word and joint comparisons on the measured words not being the chosen word; they also measure singleton placement and chosen-word multiplicity. Other cases measure phrase word repeats.

The 20,000-sample datasets use all 2048 word bins; smaller datasets group 32 neighboring indices into 64 weighted bins to avoid sparse expected counts. The nulls are ideal independent-word approximations with correctly removed forbidden indices. Pearson bounds use an explicitly approximate Wilson-Hilferty chi-square model, with no exact finite-multinomial or suite-wide error claim; frequency bounds are five standard deviations per comparison. A fixed seeded pseudorandom stream tests regressions, not cryptographic unpredictability, entropy certification, or absence of every possible bias.

At both 12 and 24 words, a separate valid 20,000-sample reference dataset is transformed into seven checksum-valid poisoned datasets: a clobbered bit, repeated entropy, low-width counting entropy, a dropped exclusion with the chosen word still fixed correctly, a copied bit, opposing per-position parity constraints, and a forced first-position anywhere word. A further 20,000-sample uniform-random-position insertion fixture preserves checksum, wishes, word marginals and singleton placement but violates conditioned multiplicity. Including the two positive reference datasets, these controls contain 360,000 synthetic checksum-valid phrases. Subtle poisons must first pass the weaker controls they target and then fail the strengthened control; they cannot be trivially green by feeding an invalid mnemonic. These are controls of the assertions, not source-mutant execution.

From the authoritative repository root, run this targeted file serially under the coordinator's memory guard:

```sh
env AUDIT_ID=AUD-025 python3 ../mhfe/docs/audits/AUD-014-harnesses/run.py randomness-controls /home/user/.local/bin/pnpm exec vitest run packages/crypto-core/tests/bip39-chosen-words-randomness.test.ts
```

Expected success is 11 passing tests and exit 0. A changed distribution, broken constraint, invalid checksum, or ineffective poison control fails the suite. This file does not cover all word-domain/position combinations; the sibling `bits/` harness and boundary unit tests own that exhaustive coverage. No PBKDF2, Argon2, card generation or full release workload is needed.
