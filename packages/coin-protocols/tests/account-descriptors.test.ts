import { describe, expect, it, vi } from 'vitest';
import { HDNodeWallet } from 'ethers';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { getBitcoinNetwork } from '@ckd/core/networks.js';
import { descriptorChecksum } from '@ckd/export/descriptor.js';
import { deriveBitcoin } from '../src/coins/bitcoin/index.js';
import { deriveDashCore } from '../src/coins/dash/core.js';
import { deriveDashLegacyMobile } from '../src/coins/dash/legacy-mobile.js';
import { deriveDashCoinJoin } from '../src/coins/dash/coinjoin.js';
import { TEST_MNEMONIC } from '@ckd/test-support/helpers.js';
import { assertWatchOnlyBatchInput } from '../../../apps/discovery-scanner/src/watch-only.js';
import { detectBitcoinWatchOnly } from '../../../apps/discovery-scanner/src/coins/bitcoin/watch-only.js';
import { detectDashWatchOnly } from '../../../apps/discovery-scanner/src/coins/dash/watch-only.js';

vi.mock('@ckd/dash-wasm/dash_shielded_wasm_bg.wasm', async () => {
  const { readFileSync } = await import('node:fs');
  return { default: readFileSync(new URL('../../dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm', import.meta.url)) };
});

const families = [
  ...(['legacy', 'nested-segwit', 'native-segwit', 'taproot'] as const).map(mode => ({
    name: `bitcoin-${mode}`, derive: (options: Parameters<typeof deriveDashCore>[0]) => deriveBitcoin(mode, options),
    wrapper: mode === 'legacy' ? 'pkh(' : mode === 'nested-segwit' ? 'sh(wpkh(' : mode === 'native-segwit' ? 'wpkh(' : 'tr(',
  })),
  { name: 'dash-core', derive: deriveDashCore, wrapper: 'pkh(' },
  { name: 'dash-legacy', derive: deriveDashLegacyMobile, wrapper: 'pkh(' },
  { name: 'dash-coinjoin', derive: deriveDashCoinJoin, wrapper: 'pkh(' },
];

describe('account public/private descriptor exports', () => {
  for (const network of ['mainnet', 'testnet'] as const) {
    it.each(families)('$name '+network+' exports both branches with account keys matching independent HD derivation', family => {
      const seed = mnemonicToSeed(TEST_MNEMONIC);
      try {
        const options = { seed, network, account: 7, branch: 0, start: 0, count: 1 };
        const result = family.derive(options);
        const bundle = result.accountDescriptors!;
        expect(bundle).toBeDefined();
        const oracle = HDNodeWallet.fromSeed(seed);
        expect(bundle.publicText).not.toMatch(/[xt]prv/);
        expect(bundle.scannerText).not.toMatch(/[xt]prv/);
        expect(bundle.privateText).toContain(network === 'mainnet' ? 'xprv' : 'tprv');
        for (const text of [bundle.publicText, bundle.privateText]) {
          const lines = text.split('\n'); expect(lines).toHaveLength(2);
          for (const [branch, line] of lines.entries()) {
            expect(line.startsWith(family.wrapper)).toBe(true);
            const [body, sum] = line.split('#'); expect(descriptorChecksum(body!)).toBe(sum);
            const match = /\[([0-9a-f]{8})([^\]]*)\]([xt](?:pub|prv)[^/]+)\/(\d)\/\*/u.exec(line)!;
            expect(match[1]).toBe(oracle.fingerprint.slice(2));
            expect(`m${match[2]!.replaceAll('h', "'")}`).toBe(bundle.accountPath);
            expect(Number(match[4])).toBe(branch);
            const node = HDKey.fromExtendedKey(match[3]!, getBitcoinNetwork(network).versions);
            for (const index of [0, 37]) {
              const child = node.deriveChild(branch).deriveChild(index);
              const independent = oracle.derivePath(`${bundle.accountPath}/${branch}/${index}`);
              expect(Buffer.from(child.publicKey!).toString('hex')).toBe(independent.publicKey.slice(2));
              if (child.privateKey !== null) expect(Buffer.from(child.privateKey).toString('hex')).toBe(independent.privateKey.slice(2));
              child.wipePrivateData();
            }
            node.wipePrivateData();
          }
        }
        expect(family.derive({ ...options, branch: 1, start: 37 }).accountDescriptors).toEqual(bundle);
        assertWatchOnlyBatchInput(bundle.scannerText);
        for (const line of bundle.scannerText.split('\n')) {
          const detected = family.name.startsWith('bitcoin') ? detectBitcoinWatchOnly(line, { auto: false }) : detectDashWatchOnly(line, { auto: false });
          expect(detected.coinId).toBe(family.name.startsWith('bitcoin') ? 'bitcoin' : 'dash');
        }
        expect(() => assertWatchOnlyBatchInput(bundle.privateText)).toThrow();
      } finally { seed.fill(0); }
    });
  }
  it('matches the published Dash Core descriptor checksum vector', () => {
    const descriptor = "pkh([c7fe8acb/44'/1'/0']tpubDDgGSmowbmYWepHK5PJYCfzUFrKy1c7PHVumScWELYwwjaGBf73ZD1JD1xc2y4hKQDp4qHUKjxz8HQyJXmM5UQh797enQQSpq8vife8yva8/0/*)";
    expect(descriptorChecksum(descriptor)).toBe('tz4w30l2');
  });
});
