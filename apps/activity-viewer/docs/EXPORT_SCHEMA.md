# Activity Viewer Dash export schema

Dash JSON exports use `schema: "wallet-activity-viewer-export"` and `version: 3`. CSV and XLSX detail rows carry `schema_version=3`. The same rules apply to individual results and Dash or mixed batches. Bitcoin and Ethereum use their separate normalized public-activity export schema.

## Core accounting migration from version 2

The JSON `balance` object contains exact decimal strings:

| Field                     | Meaning                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `reportedBalanceDuffs`    | Current balance reported by the synchronized DashScan index.             |
| `balanceDiscrepancyDuffs` | Reported balance minus net received/spent totals; signed, possibly zero. |
| `totalReceivedDuffs`      | Provider-reported received output total.                                 |
| `totalSentDuffs`          | Provider-reported spent input total.                                     |

Version 2's `confirmedDuffs` is replaced by `reportedBalanceDuffs`; `unconfirmedDuffs` is replaced by `balanceDiscrepancyDuffs`. The discrepancy is `reportedBalanceDuffs - (totalReceivedDuffs - totalSentDuffs)`. Those old names assigned confirmation semantics that the provider contract does not establish. The discrepancy is already a difference involving the reported balance: do not add it to that balance or classify it as mempool funds.

CSV and the XLSX Addresses worksheet keep the reported balance in the `address_summary` row's `amount_atomic` with `amount_unit=duffs`. Their `metadata` contains `reported_balance_duffs`, `balance_discrepancy_duffs`, `total_received_duffs`, and `total_sent_duffs`, including zero values. The XLSX Summary worksheet's `balance_atomic` is the same reported balance. Amounts remain exact strings in JSON and XLSX; CSV writes decimal integers without floating-point conversion.

Core transaction `status` in CSV/XLSX and `confirmationStatus` in JSON are `confirmed`, `unconfirmed`, or `pending`. Positive confirmations establish `confirmed`; zero confirmations establish `unconfirmed`. When the confirmation count is unavailable, a reported block height, including zero, establishes `confirmed`; otherwise the status is `pending`. InstantSend and ChainLock flags remain independent fields in JSON and metadata in CSV/XLSX. A lock never substitutes for confirmation status.

## Orchard completeness

Only a complete full-capability scan can establish an unspent note as `spendable`. An incomplete scan or an incoming/outgoing-only capability exports `unknown` spend state for a note without an observed spend. An observed spend stays `spent` even during an incomplete scan. CSV/XLSX note metadata preserves `scan_complete` and `key_capability` alongside the status.

JSON notes include `spendStatus`. Their `spent` value is `true` for an observed spend, `false` for an established spendable note, and `null` when unknown. A partial scan's provisional `false` ledger flag is never exported as established unspent state. The JSON summary's `balanceCredits`, CSV scan summary amount, XLSX Summary balance, and the displayed spendable balance are unavailable (`null` in JSON, blank in tabular exports) until a complete full-capability scan. Recovered note amounts remain available and exact.

The scan summary remains explicitly `partial` or `complete` in CSV/XLSX and carries `complete` in JSON. Batch lookup errors remain `failed` rows or JSON `errors`, with Orchard input redacted. No viewing key is included.

## Platform state and auxiliary history

The address info resource must be a valid DIP18 address for the requested network and normalize to the requested address. Missing, malformed, mixed-case, wrong-network, and unrelated resources are refused before transition history is loaded. Uniform uppercase Bech32m representations normalize to the same lowercase resource. A synchronized Explorer status must identify the requested network; an optional network in address info must agree as well.

Resource admission does not authenticate Explorer accounting. Proof-backed balance/nonce remain in JSON `state`; auxiliary indexed balance/nonce remain in `history.explorerState`, with provider and index height recorded separately. CSV/XLSX use the proof balance and label disagreement as `proof_takes_precedence`. The proof does not authenticate auxiliary history.
