import { readFileSync } from 'node:fs';

export default new Uint8Array(readFileSync(new URL('../../node_modules/btcutil-js/dist/btcutil.wasm', import.meta.url)));
