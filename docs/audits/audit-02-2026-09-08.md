# Expanded audit remediation — 2026-09-08

## Scope and evidence boundary

Audit baseline: `6462c67d677ab73bea49051c3e3d866fcd157894`, version 0.1.3. Scope is first-party application, integration, build, test and documentation code across all three tools, both editions and their mainnet/testnet configurations. Third-party dependency source audits and an independent cryptographic audit are excluded.

The fixes below are implemented and committed. This is not a claim that the final release or real-browser acceptance has passed. The branch is `codex/audit-corrections`; no release or push is part of this correction run.

## Findings and individual commits

| Finding | Commit | Correction and regression evidence |
| --- | --- | --- |
| A01 — regressing Orchard proof heights | `59da4d9` | Reject a page below the highest previously observed proof height, including empty pages, before applying it. Regression cases cover older partial, empty and final pages; monotonic tail refresh remains accepted. |
| A02 — explorer page offsets | `9390882` | Keep page size constant for Core, Platform address and Identity history; reject inconsistent totals, premature short pages and repeated pages/transaction IDs as applicable. Offset-based fake providers return all 150 unique records with display limits 150 and 200. |
| A03 — stale known-address search | `cffd9e6` | Search owns its Worker, seed and revision. Relevant edits/Clear terminate the Worker, wipe the retained seed and suppress late matches/errors. Startup gating remains enforced. |
| A04 — cancelled Orchard completion | `b17b0a0` | Check cancellation after awaited page fetch/application and before completion. Always dispose late pages. Viewer reset revisions suppress old results, errors and completion messages after Clear. |
| A05 — Viewer operation ownership | `6ba2f47` | Share query busy/readiness state between Dash and external-coin UI paths. Lock Coin and other query controls; route Clear/Cancel to the active operation; discard late external replies. Regression uses the real view and external controller, including startup failure gating. |
| A06 — timeout ends at headers | `7d5abc0` | Await JSON parsing inside the HTTP cleanup boundary. Tests use stalled response streams to check caller cancellation and timeout after headers, plus cleanup after success. |
| A07 — Ethereum contract deployment | `5a19749` | Use `created_contract` when the normal recipient is null. Test exact value, duplicate root exclusion, sender fees, failed deployment and unrelated-address rejection. |
| A08 — descriptor path corruption | `2eac901` | Replace only the trailing `/i` index placeholder. Tests cover four Bitcoin script formats, both branches, index 17 and exported relative paths. |
| A09 — prefixed SLIP-132 metadata | `7750671` | Preserve inferred network and format for explicitly prefixed ypub/zpub/upub/vpub. Compare bare/prefixed scans and network routing. |
| Additional Ethereum state attribution | `bc22b91` | Fetch a head first, then query each account batch at that explicit height. Reject duplicate RPC IDs and disclose multiple query heights rather than implying one wallet-wide snapshot. |
| T01 — compiled WASM positive fixtures | `e15bf15` | Require real External/Internal ciphertext recovery through generated WASM; exact value/address/memo, exact Internal nullifier, IVK/OVK restrictions, wrong-key rejection, key-buffer clearing and ledger spend reconstruction. Strengthen the native Internal test. |
| DOC01 — unsupported feature promises | `98210ad` | Correct offline Ethereum derivation coverage, Identity funding scope and IVK spendability wording. |
| DOC02 — automatically renewed audit date | `4d75f95` | Separate immutable reviewed commit/date from release metadata. A simulated release bump must leave audit evidence unchanged. Withdraw unpinned historical test counts as current-status evidence. |
| DOC03 — stale descriptions | `89b1563` | Correct release-only Dash distribution, actual cross-application imports, batch-size text, selected-coin behavior, scope handling and known seed/key limitations. |

## Verification performed

The complete Vitest run was executed against scratch commit `773fcddff8997de3f4b3fc788bbfd48b7bf4fbaf`, whose tracked tree is identical to canonical worktree commit `89b1563949db36be1c8f88f3b8a465d9e01176b2`:

`b6547100b20f0a36e5b243562c8bd8d21950b376`

Environment: Node.js v24.19.0, Vitest 4.1.11, local Linux execution. Command: `node node_modules/vitest/vitest.mjs run`. Result: **50 test files passed, 325 tests passed**, 2.60 seconds wall-clock duration reported by Vitest. Targeted regressions were also run before each behavioral fix was committed; the complete final run supersedes their overlapping totals.

Additional successful checks:

- TypeScript `tsc --noEmit` after the behavioral changes.
- `tooling/sync-project-metadata.mjs --check` and `tooling/verify-project-facts.mjs`, including checked relative Markdown links.
- `tooling/verify-shielded-wasm.mjs` against the committed generated WASM, including both positive ciphertext fixtures and spent-note reconstruction.
- Targeted native Rust `full_viewing_key_recovers_internal_scope_note` with Rust 1.98.1, locked/offline dependencies. The fixture-capture test ran separately once; it is ignored during ordinary tests and does not regenerate committed expected values.
- Whitespace/diff checks. The new optional browser runner received a syntax check only.

The browser runner and this report were added after the recorded source-suite run. They do not retroactively change its commit attribution or extend its tested scope.

## Remaining limitations and release gates

1. **Real-browser execution is pending.** The agent's browser tool refused local-file navigation. [The user-run file acceptance runner](../BROWSER_ACCEPTANCE.md) preserves CSP/sandbox settings and collects concrete evidence. Do not mark Chromium/Firefox, scrolling, clipboard or download acceptance as passed until the applicable checks actually run.
2. **Full release verification is pending.** The complete Rust suite, full native `pnpm verify`, rebuilt-artifact checks, canonical Docker build and live smoke matrix were not repeated as part of the targeted correction run. A native HTML rebuild is for review and does not establish canonical release bytes.
3. **Orchard still relies on authenticated append-only pool behavior.** Monotonic height checks prevent the demonstrated older-page bug; they do not create a globally pinned proof snapshot or protect against a provider violating assumptions outside the verified protocol contract. Bounded/incomplete scans cannot establish an authoritative balance.
4. **Provider history is not a consensus proof.** Stable offsets/counts and duplicate checks detect common inconsistencies. They cannot prove an explorer included every event. Ethereum batches use block heights, not a block-hash snapshot across reorganizations or an atomic snapshot across the entire wallet.
5. **Fixture independence is explicit.** The External fixture is a captured official wallet action. The Internal fixture is locally constructed with the pinned Orchard library; its expected fields come from the original note, not the scanner. It is not evidence of an independent Orchard implementation. The External fixture does not pin an independently expected nullifier.
6. **F5 remains a documented TODO.** Independent discovery of orphaned/unconsumed asset-lock credits needs a suitable authoritative query and regression fixtures. Current code only enriches identities already discovered. See [Roadmap](../ROADMAP.md).
7. **Native Electrum seeds remain unsupported.** Keep any future support separate from BIP39. Legacy depth-1/2 extended-key import is also outside the current importer contract.
8. Best-effort mutable-buffer clearing does not guarantee erasure of browser/OS copies, immutable JavaScript strings or WASM memory after a panic. Viewing material remains privacy-sensitive even without spending authority.

No new critical secret-exfiltration vulnerability was established by these remediation tests. That bounded statement is not a guarantee that none exists, and does not substitute for independent review.
