import { deriveDashCore } from '@ckd/coins/dash/core.js';
import { deriveDashPlatform } from '@ckd/coins/dash/platform.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { SecretEgressGuard } from './secret-guard.js';

export interface RecoverySelfTestReport {
  passed: true;
  checks: string[];
  durationMs: number;
}

function firstAddress(result: ReturnType<typeof deriveDashCore>): string {
  const address = result.rows[0]?.basic.find(({ key }) => key === 'address')?.value;
  if (address === undefined) throw new Error('Recovery self-test derivation omitted an address.');
  return address;
}

function assertSecretVaultBoundary(): void {
  if (typeof window === 'undefined' || window.parent === window) {
    throw new Error('Discovery scanning must run inside its sandboxed Secret Vault. Open the built Wallet Discovery Scanner artifact.');
  }
  let parentDomBlocked = false;
  try {
    void window.parent.document.documentElement;
  } catch {
    parentDomBlocked = true;
  }
  if (!parentDomBlocked) throw new Error('Recovery Secret Vault does not have an opaque origin.');
  const csp = document.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]')?.content ?? '';
  if (!/(?:^|;)\s*connect-src\s+'none'\s*(?:;|$)/u.test(csp)) {
    throw new Error("Recovery Secret Vault CSP does not enforce connect-src 'none'.");
  }
  if (!/(?:^|;)\s*worker-src\s+'none'\s*(?:;|$)/u.test(csp)) {
    throw new Error("Recovery Secret Vault CSP does not enforce worker-src 'none'.");
  }
}

export function createRecoverySelfTest(
  runBaseSelfTest: () => Promise<CryptoSelfTestReport>,
): () => Promise<RecoverySelfTestReport> {
  return async () => {
    const started = performance.now();
    assertSecretVaultBoundary();
    const base = await runBaseSelfTest();
    const checks = ['Opaque-origin Secret Vault and network-denied CSP', ...base.checks];
    for (let round = 0; round < 4; round += 1) {
      const seed = new Uint8Array(64);
      crypto.getRandomValues(seed);
      const core = deriveDashCore({ seed: seed.slice(), network: round % 2 === 0 ? 'mainnet' : 'testnet', account: round, branch: 0, start: 0, count: 2 });
      const platform = deriveDashPlatform({ seed: seed.slice(), network: round % 2 === 0 ? 'mainnet' : 'testnet', account: round, branch: 0, start: 0, count: 2 });
      try {
        if (firstAddress(core) === firstAddress(platform)) throw new Error('Recovery self-test found cross-domain address aliasing.');
        if (core.rows[0]?.basic[0]?.value === core.rows[1]?.basic[0]?.value) throw new Error('Recovery self-test found duplicate Core child addresses.');
        if (platform.rows[0]?.basic[0]?.value === platform.rows[1]?.basic[0]?.value) throw new Error('Recovery self-test found duplicate Platform child addresses.');
      } finally {
        seed.fill(0);
        clearDerivationResult(core);
        clearDerivationResult(platform);
      }
    }
    checks.push('4 randomized Core/Platform domain and uniqueness checks');

    const guard = new SecretEgressGuard();
    const canaryPhrase = 'alpha beta gamma delta epsilon zeta eta theta';
    guard.registerString('canary mnemonic', canaryPhrase);
    guard.registerBytes('canary seed', new Uint8Array(32).fill(0xa5));
    guard.assertPublic({ address: 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5' }, 'public canary request');
    const canaries: Array<Record<string, string>> = [
      { body: canaryPhrase },
      { url: `https://example.invalid/?q=${encodeURIComponent(canaryPhrase)}` },
      { body: btoa(canaryPhrase) },
      { body: canaryPhrase.replaceAll(' ', '-') },
      { body: 'a5'.repeat(32) },
    ];
    let blocked = 0;
    for (const payload of canaries) {
      try {
        guard.assertPublic(payload, 'secret canary request');
      } catch {
        blocked += 1;
      }
    }
    guard.clear();
    if (blocked !== canaries.length) {
      throw new Error('Recovery self-test failed to block a secret-bearing network canary.');
    }
    checks.push(`${canaries.length} secret-egress canaries (raw, percent, base64, separator, byte)`);
    return { passed: true, checks, durationMs: Math.round(performance.now() - started) };
  };
}
