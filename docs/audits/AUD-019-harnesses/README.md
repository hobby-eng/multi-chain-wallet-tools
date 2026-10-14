# AUD-019 harnesses

These scripts belong to AUD-019 (`docs/audits/AUD-019-2026-10-01.md`), the full-scope audit of commit
`16358c35acb2a3b0c149bf0908ac214fcfeba308` on `main`. They produced the audit's evidence and let a
reader repeat its probes. They use public test data only: the BIP39 vectors "abandon … about" and
"zoo … wrong", private key 1, the BIP32 test vector 1 master key and a repeatable SHA-256 counter
stream. None of them makes a network request, and none writes into the repository outside the
ignored evidence folder `docs/audits/AUD-019-evidence/`.

Run every command from the repository root after `pnpm install --frozen-lockfile`. Each script exits
with a non-zero code when one of its checks fails.

| Script                             | What it checks                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-logged.mjs`                   | Runs one command and keeps `<name>.log` and `<name>.command.json` (command, UTC start and end, exit code, SHA-256 of the log). The wrapped command's exit code is passed through.                                    |
| `capture-snapshot.mjs`             | Records commit, tree, branch, remote baseline, working-tree state, the HTML in `dist/`, the toolchain versions and the SHA-256 of the four audit procedure files. Fails on a working tree with foreign changes.      |
| `verify-format-only-commits.mjs`   | Proves that a commit or range only reformats: every changed file must equal the earlier text formatted with the later `.prettierrc.json`, in memory from git objects. `--declared` names the intended other changes. |
| `inspect-artifact-csp.mjs`         | Reads the Content Security Policy of the eight built pages from the final HTML and checks the offline and connected boundaries independently of the repository's artifact gates.                                     |
| `compare-vendored-mnemocode.mjs`   | Compares each vendored MnemoCode file with the blob of the pinned commit in a local clone of `hobby-eng/mnemocode`.                                                                                                  |
| `chosen-words.audit.test.ts`       | "Generate with chosen words": chi-square tests of the output distribution, and what a random source of the wrong length or type produces (AUD-019-API001).                                                           |
| `public-input-guard.audit.test.ts` | Synthetic secrets in 26 forms (separators, case, line breaks, percent, Base64, WIF, xprv, raw keys) through the Activity Viewer's single and batch input checks (AUD-019-SEC001).                                    |
| `previous-findings.audit.test.ts`  | Regression probes of AUD-017-API001 (with AUD-019-API002), AUD-017-API003 and AUD-017-API004.                                                                                                                        |
| `vitest.config.mjs`                | Runs the `*.audit.test.ts` files with the repository's own aliases, so they call the production modules.                                                                                                             |

## Commands and expected results

```sh
node docs/audits/AUD-019-harnesses/capture-snapshot.mjs --label baseline
node docs/audits/AUD-019-harnesses/run-logged.mjs baseline-pnpm-verify -- pnpm verify

# Exit 0: 593 of 600 files only reformatted, the other seven are the declared changes.
node docs/audits/AUD-019-harnesses/verify-format-only-commits.mjs 8880e9e..062e907 \
  --declared .prettierrc.json,.prettierignore,.git-blame-ignore-revs,apps/discovery-scanner/scripts/verify-discovery-scanner-artifact.mjs,tooling/sync-mnemocode-source.test.mjs,tooling/verify-project-facts.mjs,tooling/wasm-canonical-manifest.json

# After pnpm build:html. Exit 0: eight PASS lines; the offline pages have connect-src 'none'.
node docs/audits/AUD-019-harnesses/inspect-artifact-csp.mjs

# Needs a clone of hobby-eng/mnemocode that contains the pinned commit; default ../mnemocode.
# Exit 0: 57 of 57 files identical.
node docs/audits/AUD-019-harnesses/compare-vendored-mnemocode.mjs [path-to-clone]

# AUDIT_LABEL names the evidence file, for example baseline or fixed.
AUDIT_LABEL=fixed pnpm exec vitest run --config docs/audits/AUD-019-harnesses/vitest.config.mjs
```

At the reviewed commit the three test files fail where the audit found defects: the chosen-words
probe returns 3 phrases with an invalid checksum out of 2,000 from a source one byte short; the
input probe hands `zoo-…-wrong`, `zoo…wrong` and a one-word-per-line phrase with a wrong checksum to
the Identity lookup; the previous-findings probe accepts `toString`, `constructor`, `__proto__` and
`hasOwnProperty` as SSKR encodings. After the remediation commits all 45 tests pass. The 64-byte
BIP39 seed in hex is recorded, not asserted: it has the length of an Orchard Incoming Viewing Key,
and the Viewer treats it as one, locally.

The remediation commits `3d809598edc01ebf479c07c88991eb51c2be88e0` … `d8ce0f82f01751bfbbb968c8d97975cb48f6790d` are on `main`; at the verification commit
`3fdb1fdfdb4611397f14317e1307b9897671a806` (tag `v0.1.5-rc.1`) the three test files pass 45 of 45
and `inspect-artifact-csp.mjs` prints eight PASS lines.

The statistical probes use fixed streams, so they give the same numbers on every run:
chi-square 9.25 over 12 positions (limit 31.26) and 2.12 over four classes (limit 16.27).
