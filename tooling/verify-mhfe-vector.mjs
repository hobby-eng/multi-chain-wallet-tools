import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync, MhfeEngine } from '../packages/recovery-mhfe-wasm/generated/mhfe.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const wasm = readFileSync(resolve(root, 'packages/recovery-mhfe-wasm/generated/mhfe_bg.wasm'));
const source = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const container =
  'topple stock shiver enforce hire stumble unique trick mansion relief absent thought thunder price buzz crazy depart robust drastic bunker husband wagon salad book';

initSync({ module: wasm });
const engine = new MhfeEngine(0);
try {
  if (typeof engine.encryptPreservingFinalWordJson !== 'function')
    throw new Error('Embedded MHFE WASM is missing final-word-preserving encryption.');
  if (typeof engine.decryptPreservingFinalWordJson !== 'function')
    throw new Error('Embedded MHFE WASM is missing final-word-preserving recovery.');
  engine.setAsciiPassword('public test password');
  const result = JSON.parse(engine.decryptAutoJson(container));
  if (result.recoveredMnemonic !== source) throw new Error('MHFE published vector recovered the wrong mnemonic.');
  if (result.sourceWords !== 12) throw new Error('MHFE published vector recovered the wrong source length.');
  if (result.recoveryVerifier !== 'matched') throw new Error('MHFE published vector verifier did not match.');
  console.log('Verified the embedded MHFE v0.3.1 WASM against its published 12-word suite-2 vector.');
} finally {
  engine.clearPassword();
  engine.free();
  wasm.fill(0);
}
