import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvoSDK } from '@dashevo/evo-sdk';
import {
  derive_shielded_json,
  initSync,
  scan_shielded_batch_json,
} from '../../../packages/dash-shielded-wasm/generated/dash_shielded_wasm.js';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const smokeCount = 2048;
const network = process.argv[2] ?? 'testnet';
if (network !== 'mainnet' && network !== 'testnet') {
  throw new Error('Viewer network smoke argument must be mainnet or testnet.');
}
const wasm = readFileSync(resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm'));
initSync({ module: wasm });

const sdk = network === 'mainnet' ? EvoSDK.mainnetTrusted({
  settings: { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3, banFailedAddress: true },
}) : EvoSDK.testnetTrusted({
  settings: { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3, banFailedAddress: true },
});
await sdk.connect();
const startedAt = performance.now();
let position = 0n;
let emptyConfirmations = 0;
let pages = 0;
let actions = 0;
let lastHeight = 0n;
let lastProtocol = 0;
const requestedPositions = [];
const seed = new Uint8Array(64).fill(0x42);
const derived = JSON.parse(derive_shielded_json(seed, network === 'mainnet' ? 5 : 1, 0, 0, 1));
const fvk = Uint8Array.from(Buffer.from(derived.fullViewingKey, 'hex'));
while (emptyConfirmations < 2) {
  requestedPositions.push(position);
  const response = await sdk.shielded.encryptedNotesWithProof(position, smokeCount);
  const metadata = response.metadata;
  try {
    const notes = response.data;
    pages += 1;
    lastHeight = metadata.height;
    lastProtocol = metadata.protocolVersion;
    actions += notes.length;
  const concatenate = (field, width) => {
    const output = new Uint8Array(notes.length * width);
    notes.forEach((note, index) => {
      const bytes = note[field];
      if (!(bytes instanceof Uint8Array) || bytes.length !== width) {
        throw new Error(`Live DAPI ${field} field does not contain ${width} bytes.`);
      }
      output.set(bytes, index * width);
    });
    return output;
  };
  if (notes.length > 0) {
    const result = JSON.parse(scan_shielded_batch_json(
      fvk.slice(),
      position,
      concatenate('cmx', 32),
      concatenate('nullifier', 32),
      concatenate('cvNet', 32),
      concatenate('encryptedNote', 216),
    ));
    if (!Array.isArray(result.items)) throw new Error('Live DAPI scan did not return an items array.');
    emptyConfirmations = 0;
    position += BigInt(smokeCount);
  } else {
    emptyConfirmations += 1;
  }
  notes.forEach((note) => note.free());
  } finally {
    metadata.free();
    response.free();
  }
}
seed.fill(0);
fvk.fill(0);
if (requestedPositions.some((value) => value % BigInt(smokeCount) !== 0n)) {
  throw new Error('Live Orchard smoke emitted a non-aligned DAPI start index.');
}
console.log(
  `Live Dash Platform ${network} viewer stream passed: ${actions} actions; ${pages} pages including two empty confirmations; proof height ${lastHeight}; protocol ${lastProtocol}; ${Math.round(performance.now() - startedAt)} ms.`,
);
