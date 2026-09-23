# MHFE browser module

This directory contains the browser WASM module built from the reviewed
[`hobby-eng/mhfe` v0.3.1 source](https://github.com/hobby-eng/mhfe/tree/26ec19419bddf0d68dcbb94e5ac713a9104fbab7).
The Key Derivation Tool embeds it in a dedicated Web Worker and terminates that
worker to cancel an active operation.

- Source commit: `26ec19419bddf0d68dcbb94e5ac713a9104fbab7`
- `generated/mhfe.js`: `89c03e218fdbf8a5e75aeb823bda3ffdda54f51a55aba5ac788b1944fc95149b`
- `generated/mhfe.d.ts`: `1775abebd385685edd79ae6fea0da72d412384fba3987c64a3f0b58bed85b2db`
- `generated/mhfe_bg.wasm`: `09fc20c960ad7ed5745d7414f0f64f293bbfef7b9ab6e0846c194255ce403909`
- `generated/mhfe_bg.wasm.d.ts`: `a943919741a49f42a006f847e8cc0e668c5b6c1e145eca59ebc0d4978ea1bfdf`

The module is MIT licensed. See `LICENSE-MHFE`.
