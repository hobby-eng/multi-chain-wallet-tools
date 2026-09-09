import { expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { hash160, bytesToHex } from '@ckd/core/crypto.js';
import { encodePlatformP2pkh } from '@ckd/coins/dash/platform.js';
import { scanDashPlatformAddresses } from '../src/coins/dash/platform-scanner.js';
import type { DashPlatformClient } from '../src/coins/dash/platform-client.js';
import type { RecoveryScanConfig, RecoveryWalletResult } from '../src/types.js';
import { createRecoveryExport } from '../src/export.js';

for (const network of ['mainnet', 'testnet'] as const) {
  for (const used of [[[1, 0]], [[0, 0], [1, 0]], [[0, 2], [1, 0]]] as const) {
    it(`scans ${network} hardened receive/internal classes with independent gaps: ${JSON.stringify(used)}`, async () => {
      const seed = mnemonicToSeed('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
      const root = HDKey.fromMasterSeed(seed);
      const oracle = new Map<string, { keyClass: number; index: number; storage: string; path: string }>();
      // Independent explicit paths: do not import the scanner's chain registry.
      const paths = network === 'mainnet' ? ["m/9'/5'/17'/0'/0'", "m/9'/5'/17'/0'/1'"] : ["m/9'/1'/17'/0'/0'", "m/9'/1'/17'/0'/1'"];
      try {
        for (const [keyClass, path] of paths.entries()) {
          const node = root.derive(path);
          try {
            for (let index = 0; index < 30; index++) {
              const child = node.deriveChild(index);
              const hash = hash160(child.publicKey!);
              oracle.set(encodePlatformP2pkh(hash, network === 'mainnet' ? 'dash' : 'tdash'), { keyClass, index, storage: `00${bytesToHex(hash)}`, path: `${path}/${index}` });
              child.wipePrivateData();
            }
          } finally { node.wipePrivateData(); }
        }
        const queried: string[] = [];
        const client = {
          addresses: async (addresses: string[]) => {
            queried.push(...addresses);
            return { entries: addresses.flatMap(address => {
              const entry = oracle.get(address);
              expect(entry, 'unexpected derivation path').toBeDefined();
              return used.some(([branch, index]) => entry!.keyClass === branch && entry!.index === index)
                ? [[entry!.storage, { balance: '100000000000', nonce: '1' }]] : [];
            }), metadata: { height: '100', protocolVersion: 1 } };
          },
          addressHistory: async () => { throw new Error('fixture: history unavailable'); },
        } as unknown as DashPlatformClient;
        const section = await scanDashPlatformAddresses('test', seed,
          { network, account: 0, platformAddressCount: 3, includeUsedZeroBalance: false } as RecoveryScanConfig,
          client, new AbortController().signal, () => {}, () => {});
        expect(section.findings).toHaveLength(used.length);
        expect(new Set(section.findings.map(finding => finding.id)).size).toBe(used.length);
        expect(new Set(queried).size).toBe(queried.length);
        for (const keyClass of [0, 1]) {
          const lastUsed = Math.max(-1, ...used.filter(([branch]) => branch === keyClass).map(([, index]) => index));
          const expected = lastUsed < 0 ? 3 : Math.max(3, lastUsed + 21);
          expect(queried.filter(address => oracle.get(address)!.keyClass === keyClass)).toHaveLength(expected);
        }
        for (const finding of section.findings) {
          const expected = oracle.get(finding.title)!;
          expect(finding.fields).toContainEqual({ label: 'DIP17 derivation path', value: expected.path, copyable: true });
          expect(finding.balanceAtomic).toBe(100_000_000_000n);
        }
        const result = { inputId: 'test', label: 'Test', coinId: 'dash', coinLabel: 'Dash', network, startedAt: '', completedAt: '', overview: [], sections: [section], warnings: [] } satisfies RecoveryWalletResult;
        const json = JSON.parse(createRecoveryExport([result], 'json').text);
        expect(json.results[0].sections[0].findings).toHaveLength(used.length);
        expect(createRecoveryExport([result], 'csv').text).toContain('1\' · internal / change');
      } finally { root.wipePrivateData(); seed.fill(0); }
    });
  }
}
