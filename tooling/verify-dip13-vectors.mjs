import { createHash } from 'node:crypto';
import dashHd from 'dashhd';

const seedHex =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1' +
  '9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';
const vectors = [
  {
    name: 'mainnet',
    path: "m/9'/5'/5'/0'/0'/0'/0'",
    privateKey: '5d6d4d9ef3092e2c63c5e7c436e3068efa58cbe4f32eb406ecbceecebf127f0f',
    publicKey: '03de6e4f0a455c1f089e51c53ed937b172d46e5cec4a98e2d9977ea4638129d252',
    publicKeyHash: 'd0559a724d640d22df8a04665308ffd0b7fe9b77',
  },
  {
    name: 'testnet',
    path: "m/9'/1'/5'/0'/0'/0'/0'",
    privateKey: 'e560f452db267372375f218a22d57c0937070faffe66f0b7f908c21c8772ee3e',
    publicKey: '03a00f4853081aeb8c9debe37267303fa133bd7f6678bfb3299dfa001bfd0341db',
    publicKeyHash: '35891d57608f93cfe630e70bee9ae863f403f50f',
  },
];

for (const vector of vectors) {
  const seed = Uint8Array.from(Buffer.from(seedHex, 'hex'));
  const root = await dashHd.fromSeed(seed);
  const child = await dashHd.derivePath(root, vector.path);
  try {
    const privateKey = Buffer.from(child.privateKey ?? []).toString('hex');
    const publicKey = Buffer.from(child.publicKey).toString('hex');
    const publicKeyHash = createHash('ripemd160')
      .update(createHash('sha256').update(child.publicKey).digest())
      .digest('hex');
    for (const [label, actual, expected] of [
      ['private key', privateKey, vector.privateKey],
      ['public key', publicKey, vector.publicKey],
      ['HASH160', publicKeyHash, vector.publicKeyHash],
    ]) {
      if (actual !== expected) throw new Error(`Independent DIP13 ${vector.name} ${label} mismatch.`);
    }
  } finally {
    dashHd.wipePrivateData(child);
    dashHd.wipePrivateData(root);
    seed.fill(0);
  }
}

console.log('Verified DIP13 mainnet/testnet vectors with independent dashhd 3.3.3 derivation.');
