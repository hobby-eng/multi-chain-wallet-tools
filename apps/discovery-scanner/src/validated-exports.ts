import type { RecoveryExportFile, RecoveryExportFormat } from './export.js';
import type { RecoveryWalletResult } from './types.js';
import type { SecretEgressGuard } from '@ckd/secret-boundary/secret-guard.js';

const tripwireContext: Record<RecoveryExportFormat, string> = {
  csv: 'recovery CSV report export',
  json: 'recovery JSON report export',
};

/** Owns export projection and the public-data tripwire for one completed scan. */
export class ValidatedRecoveryExports {
  readonly #files = new Map<RecoveryExportFormat, RecoveryExportFile>();

  constructor(
    private readonly create: typeof import('./export.js').createRecoveryExport,
    private readonly guard: Pick<SecretEgressGuard, 'assertPublic' | 'clear'>,
  ) {}

  stage(results: readonly RecoveryWalletResult[], date = new Date()): void {
    this.#files.clear();
    try {
      if (results.length === 0) return;
      for (const format of ['csv', 'json'] as const) {
        const file = this.create([...results], format, date);
        this.guard.assertPublic(file.text, tripwireContext[format]);
        this.#files.set(format, file);
      }
    } catch (cause) {
      this.#files.clear();
      throw cause;
    } finally {
      this.guard.clear();
    }
  }

  get(format: RecoveryExportFormat): RecoveryExportFile | undefined {
    return this.#files.get(format);
  }

  formats(): ReadonlySet<RecoveryExportFormat> {
    return new Set(this.#files.keys());
  }

  clear(): void {
    this.#files.clear();
  }
}
