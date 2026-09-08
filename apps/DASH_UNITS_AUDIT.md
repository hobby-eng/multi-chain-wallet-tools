# Dash unit review — 2026-09-08

Scope: Key Derivation, Activity Viewer, Discovery Scanner, their shared TypeScript packages, CSV/JSON exporters, and the Orchard Rust-to-JavaScript amount boundary. This is a focused monetary-unit review, not an independent cryptographic audit.

## Verified unit map

| Data | Raw unit | Atomic units per DASH | Handling |
| --- | --- | ---: | --- |
| Core address balance, input/output, transaction fee | duffs | 100,000,000 | `formatDashDuffs` |
| Core asset-lock `creditOutputs[].satoshis` | duffs | 100,000,000 | Parse as duffs; the upstream word “credit” does not change the unit |
| Platform payment address balance and history | credits | 100,000,000,000 | `formatDashCredits` |
| Identity balance, transfers, gas, top-up/withdrawal history | credits | 100,000,000,000 | Preserve Explorer/DAPI credit values; do not multiply again |
| Platform Orchard note value, balance, received/sent/self-change | credits | 100,000,000,000 | Rust exports the raw note integer, JS formats credits |
| Combined Dash scan balance | credits | 100,000,000,000 | Convert Core with `CREDITS_PER_DUFF = 1000` before adding L2 values |

The ratio is confirmed by the [official withdrawal documentation](https://docs.dash.org/projects/platform/en/latest/docs/tutorials/identities-and-names/withdraw-an-identity-balance.html). Explorer amounts were traced through its [transfer model](https://github.com/pshenmic/platform-explorer/blob/ddc4c24a482906d2e6a15b13419786586cac3807/packages/indexer/src/entities/transfer.rs): asset-lock top-ups are already multiplied by 1000 there, while withdrawal/transfer values preserve the transition credit amount. The [Identity DAO](https://github.com/pshenmic/platform-explorer/blob/ddc4c24a482906d2e6a15b13419786586cac3807/packages/api/src/dao/IdentitiesDAO.js) aggregates those transfer values. This checks units, not the accuracy or completeness of every upstream statistic.

## Findings and changes

- Key Derivation does not query or total monetary values. Its payment QR encodes the address/URI scheme without an amount; no duff/credit conversion exists in that path.
- Activity Viewer uses explicit Core `*Duffs` and Platform `*Credits` fields; its CSV records already carry `amount_unit`. Identity and Orchard values use the credit formatter. No additional 1000x conversion error was found in these paths.
- Discovery Scanner's existing current-balance, lifetime-total and combined-Dash arithmetic use the correct scales. The shared Core-to-Platform factor now comes from `dash-units.ts` instead of a separate literal.
- Scanner raw `balanceAtomic` values previously had no dedicated unit metadata in CSV/JSON. Reports now include `balanceUnit` / `balance_asset`, `balance_atomic_unit`, `balance_decimals`, provided by the coin adapter. These survive unavailable history and distinguish Core duffs from Platform/Identity/Orchard credits.
- New history metadata explicitly classifies Orchard as credits, including unsupported calendar-history results. A history response whose unit disagrees with its adapter is rejected before display/export, avoiding a silent 1000x interpretation error.
- The Identity funding label is now “Asset-lock amount (Core L1)”; the network protocol documents its raw output amount as duffs. The formatted amount was already correct.

## Validation

TypeScript checking and all 262 tests passed, including exact large integers, single-duff/single-credit values, the 1000:1 conversion, mixed L1/L2 totals, CSV/JSON units during provider failure, rejection of mismatched history units, and DIP17 public-xpub discovery with 11-decimal precision. The standalone HTML editions are built directly with the existing generated WASM, without Docker. Visual acceptance of the final files is left to the user.
