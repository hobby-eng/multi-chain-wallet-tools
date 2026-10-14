# AUD-022 MnemoCode contract probes

Reviewed HEAD: `c5b62c2d489e7525326071128095ba95ecca92ac`, with dirty implementation files. These probes exercise the production `MnemoCodeSearches` adapter; they are not part of the ordinary test suite. The reviewer wrote them but did not run them. Execution belongs to the coordinator.

Inputs are public all-zero BIP39 indexes and synthetic text. Wallet comparisons are stubs: no PBKDF2, Argon2, SSKR split, browser, network, PDF or card rendering is performed. The three probes check zero-result date search, zero-result word search, and validation of the 256-byte BIP39 candidate-list passphrase limit before candidate checks.

From the repository root, with the workspace Node and pnpm toolchains:

```sh
pnpm exec vitest run --config docs/audits/AUD-022-harnesses/mnemocode-vitest.config.mjs --reporter=verbose
```

The probes assert the supported behavior, so an unresolved candidate causes a nonzero exit. With the reviewed source, the first two are expected to reject at empty MNCL serialization and the third to fail its assertion that no wallet comparison ran. The coordinator should retain the actual output, exit code and source hashes in the local AUD-022 evidence directory. These expected failures are source-derived predictions, not execution results.
