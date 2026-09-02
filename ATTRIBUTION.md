# Upstream attribution

These utilities are an independent integration project. They are not an official Dash product, are not maintained by Dash Core Group or the Dash Platform maintainers, and no endorsement by those projects or contributors is implied.

Original integration code in this repository is released under the [MIT License](LICENSE), copyright (c) 2026 hobby-eng. That license does not replace or relicense embedded and linked third-party work; each upstream component retains the license identified in its own distribution and in this repository's notices.

Dash Platform and Dash Orchard functionality relies on open-source work authored and maintained by their respective upstream contributors:

- **Dash Platform** — protocol specifications, Evo SDK, WASM SDK, proof-verification and Platform client implementations: [github.com/dashpay/platform](https://github.com/dashpay/platform)
- **Dash Orchard fork** — Dash-specific Orchard/ZIP-32 cryptographic implementation: [github.com/dashpay/orchard](https://github.com/dashpay/orchard)
- **Dash Core** — network definitions and the wider Dash protocol implementation: [github.com/dashpay/dash](https://github.com/dashpay/dash)
- **Dash brand mark** — the official “Dash D Circle” asset from the [Dash Brand Guidelines](https://www.dash.org/brand-guidelines/), used under the Creative Commons Attribution 4.0 license (CC BY 4.0). The mark remains the property of its respective owner; its use does not imply endorsement.

This repository's code integrates those components for key derivation, activity inspection, and recovery reporting. Upstream names identify technical provenance; they do not transfer authorship of upstream code to this project.

Exact pinned versions, commits, package integrity values, transitive dependencies, copyright notices and license identifiers are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [DASH_IMPLEMENTATION.md](DASH_IMPLEMENTATION.md), the lockfiles and the Release passport embedded in each standalone artifact.
