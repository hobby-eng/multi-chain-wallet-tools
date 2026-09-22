# MHFE browser module

This directory contains the browser WASM module from the published
[`hobby-eng/mhfe` v0.3.0 release](https://github.com/hobby-eng/mhfe/releases/tag/v0.3.0).
The Key Derivation Tool embeds it in a dedicated Web Worker and terminates that
worker to cancel an active operation.

- Source commit: `1f18322dbc23df54b10719efb0113fcd4ba88242`
- Release archive: `mhfe-v0.3.0-browser-wasm.tar.gz`
- Archive SHA-256: `330ef261f5cd5838c6eb2f4a478c79d6f7ddb57aed471d1532955d11cd4fd851`
- `generated/mhfe.js`: `cc143c9dd6800897c0787244742d5d2e258a4f3e762bcbd811d35238a2159a15`
- `generated/mhfe_bg.wasm`: `a076b25606e524cb1d5ccbb4a885485018308232639b24626138346bd462b159`

The module is MIT licensed. See `LICENSE-MHFE`.
