import { SecretEgressGuard } from './secret-guard.js';
import type { RecoveryTaskLimiter } from './concurrency.js';
import type { RecoveryNetworkApi } from './network-protocol.js';

export interface RecoveryOperationStats {
  count: number;
  totalMs: number;
  averageMs: number;
  maxMs: number;
}

export class RecoveryNetworkGateway {
  #requests = 0;
  readonly #operationTimes = new Map<string, number[]>();

  constructor(
    readonly guard: SecretEgressGuard,
    readonly networkApi: RecoveryNetworkApi,
    readonly limiter?: RecoveryTaskLimiter,
  ) {}

  get requestCount(): number {
    return this.#requests;
  }

  operationStats(operations: readonly string[]): RecoveryOperationStats {
    const durations = operations.flatMap((operation) => this.#operationTimes.get(operation) ?? []);
    const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
    return {
      count: durations.length,
      totalMs,
      averageMs: durations.length === 0 ? 0 : totalMs / durations.length,
      maxMs: durations.length === 0 ? 0 : Math.max(...durations),
    };
  }

  #record(operation: string, startedAt: number): void {
    const durations = this.#operationTimes.get(operation) ?? [];
    durations.push(performance.now() - startedAt);
    this.#operationTimes.set(operation, durations);
  }

  async runPublic<T>(
    publicArguments: unknown,
    operation: string,
    run: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.guard.assertPublic(publicArguments, `isolated network operation ${operation}`);
    const counted = async (): Promise<T> => {
      this.#requests += 1;
      const startedAt = performance.now();
      try {
        return await run();
      } finally {
        this.#record(operation, startedAt);
      }
    };
    return this.limiter === undefined ? counted() : this.limiter.run(counted, signal);
  }
}
