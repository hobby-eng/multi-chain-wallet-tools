# AUD-022 MHFE contract probes

These audit-only probes belong to the MHFE interoperability review of dirty commit
`c5b62c2d489e7525326071128095ba95ecca92ac`. They load the current production
`MhfeEngine`, `PasswordReview` and password-review text helpers in VM modules. Synthetic
client, compilation and password-review responses provide controlled ordering. No browser,
Web Worker, WebAssembly compilation, Argon2, vector replay, network request or secret data is used.
Source SHA-256 values are printed to bind an execution to the bytes actually read.

The reviewer has not executed this file. All execution belongs to the AUD-022 coordinator.
From the repository root, with the workspace's pinned Node 26.10.0, run:

```sh
node --experimental-vm-modules docs/audits/AUD-022-harnesses/mhfe-contract-probes.mjs
```

The first probe clicks the production engine's Cancel handler while client initialization waits,
then releases preparation. The invariant requires that the later operation never start and that
the wrapper reject. The second clears a password input during the production review's await,
then releases its old response. The invariant requires that no old choices return to the page.

Each probe prints its observed state and PASS or FAIL. Exit 0 means both scoped invariants passed;
exit 1 means at least one invariant failed; exit 2 means a harness or loading error. A harness error
does not prove a production defect. This is controlled integration evidence, not browser acceptance
or full MHFE correctness evidence. The folder's shared README remains owned by the coordinator.
