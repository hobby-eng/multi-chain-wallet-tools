// Public deterministic test fixtures only. Run explicitly; tests never use the network.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const bips = 'bfc142f2b580a314c846dbce3c15c659c2b1d32d';
const core = 'f3fec67c3eeb27d5be1bc9d57ca737b74fcd762d';
const sources = {};
async function get(repo, revision, path) {
  const url = `https://raw.githubusercontent.com/${repo}/${revision}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  sources[path] = url;
  return response.text();
}
const bip = (path) => get('bitcoin/bips', bips, path);
const psbt = {};
for (const number of ['0174', '0370', '0371', '0373']) {
  const text = await bip(`bip-${number}.mediawiki`);
  let valid;
  let name = '';
  const cases = [];
  for (const line of text.split('\n')) {
    if (/following.*invalid PSBTs/i.test(line)) valid = false;
    else if (/following.*valid PSBTs/i.test(line)) valid = true;
    if (/^\* Case:/.test(line)) name = line.replace(/^\* Case: /, '').replace(/<\/?tt>/g, '');
    const base64 = /Base64 String: <pre>([^<]+)<\/pre>/.exec(line)?.[1];
    if (base64 && valid !== undefined) cases.push({ name, valid, base64 });
  }
  psbt[number] = cases;
}
const source = await get('bitcoin/bitcoin', core, 'src/test/miniscript_tests.cpp');
const miniscript = [...source.matchAll(/Test\("([^"]+)", "([^"]+)", "([^"]+)", ([^\n;]+)\);/g)]
  .filter(([, , , , mode]) => /TESTMODE_(?:VALID|INVALID)/.test(mode))
  .map(([, expression, script, tapscript, mode]) => ({
    expression, script, tapscript, mode, valid: !mode.includes('TESTMODE_INVALID'),
  }));
const bip32 = await bip('bip-0032.mediawiki');
const hdVectors = [...bip32.matchAll(/===Test vector ([1-4])===([\s\S]*?)(?====|$)/g)].map(([, id, body]) => ({
  id,
  seed: /Seed \(hex\): ([0-9a-f]+)/.exec(body)[1],
  paths: [...body.matchAll(/\* Chain:? ([^\n]+)\n\*\* ext pub: ([^\n]+)\n\*\* ext prv: ([^\n]+)/g)]
    .map(([, path, xpub, xprv]) => ({ path: path.replace(/<sub>H<\/sub>/g, "'"), xpub, xprv })),
}));
const fixture = {
  sources,
  bip32: hdVectors,
  bip341: JSON.parse(await bip('bip-0341/wallet-test-vectors.json')).scriptPubKey,
  bip327: JSON.parse(await bip('bip-0327/vectors/key_agg_vectors.json')),
  bip328: JSON.parse(await bip('bip-0328/vectors.json')),
  miniscript,
  psbt,
};
// Counts belong to the pinned revisions above. A refresh must review changes
// explicitly; regex drift must never silently overwrite the corpus with fewer cases.
assert.deepEqual(hdVectors.map(row => row.paths.length), [6, 6, 2, 3], 'BIP32 extraction changed');
assert.equal(miniscript.length, 97, 'Core Miniscript extraction changed');
assert.deepEqual(Object.fromEntries(Object.entries(psbt).map(([id, rows]) => [id, [rows.filter(row => row.valid).length, rows.filter(row => !row.valid).length]])), {
  '0174': [24, 20], '0370': [24, 24], '0371': [6, 11], '0373': [14, 10],
}, 'PSBT extraction changed');
writeFileSync(new URL('./official-vectors.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(JSON.stringify({
  bip32: hdVectors.map(({ id, paths }) => [id, paths.length]),
  miniscript: miniscript.length,
  psbt: Object.fromEntries(Object.entries(psbt).map(([id, rows]) => [id, {
    valid: rows.filter((row) => row.valid).length, invalid: rows.filter((row) => !row.valid).length,
  }])),
}));
