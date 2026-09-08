# Roadmap

This file tracks recovery capabilities that are intentionally not claimed by the current release because the required authoritative public query is not yet available through the supported SDK/provider interface.

## Dash Platform asset-lock funding

- [ ] Add independent discovery of unused Identity registration/top-up asset-lock credits when Dash Platform and Evo SDK expose a proof-verifiable query for locating the relevant asset-lock outputs and determining their consumed state.

The current scanner only enriches a Dash Platform Identity that was already discovered. When Platform Explorer reports its Core funding transaction, the scanner loads that transaction and compares its asset-lock credit-key hash with locally derived registration funding keys. It does not currently claim that an empty Identity result proves there are no unused asset-lock credits.

Acceptance requires a regression fixture in which the funding resource exists without a discoverable Identity, plus an authoritative consumed/unconsumed result. Scanning an ordinary P2PKH address balance is insufficient because asset-lock credits are represented by the transaction payload and Platform state rather than by an unspent payment-address balance alone.
