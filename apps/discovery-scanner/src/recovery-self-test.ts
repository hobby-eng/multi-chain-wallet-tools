import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { SecretEgressGuard } from '@ckd/secret-boundary/secret-guard.js';

export interface RecoverySelfTestReport {
  passed: true;
  checks: string[];
  durationMs: number;
}

function assertSecretVaultBoundary(): void {
  if (typeof window === 'undefined' || window.parent === window) {
    throw new Error(
      'Discovery scanning must run inside its sandboxed Secret Vault. Open the built Wallet Discovery Scanner artifact.',
    );
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
