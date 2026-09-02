import { EvoSDK, type ShieldedEncryptedNote as EvoShieldedEncryptedNote } from '@dashevo/evo-sdk';
import { copyAndFreeEvoShieldedNote } from './evo-shielded-note.js';
import type { ShieldedPage, ShieldedPageSource, ViewerNetwork } from './types.js';

export type DashEvoOperationRunner = <T>(
  operation: string,
  publicArguments: unknown,
  task: () => Promise<T>,
) => Promise<T>;

export class DashEvoShieldedSource implements ShieldedPageSource {
  readonly #network: ViewerNetwork;
  readonly #run: DashEvoOperationRunner;
  #sdk: EvoSDK | undefined;
  #connecting: Promise<void> | undefined;

  constructor(network: ViewerNetwork, runner?: DashEvoOperationRunner) {
    this.#network = network;
    this.#run = runner ?? (async <T>(_operation: string, _publicArguments: unknown, task: () => Promise<T>) => task());
  }

  async connect(): Promise<void> {
    if (this.#sdk !== undefined) return;
    if (this.#connecting !== undefined) return this.#connecting;
    const connecting = (async (): Promise<void> => {
      const settings = { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3, banFailedAddress: true };
      const sdk = this.#network === 'mainnet'
        ? EvoSDK.mainnetTrusted({ settings })
        : EvoSDK.testnetTrusted({ settings });
      await this.#run('shielded.connect', { network: this.#network }, () => sdk.connect());
      this.#sdk = sdk;
    })();
    this.#connecting = connecting;
    try {
      await connecting;
    } finally {
      if (this.#connecting === connecting) this.#connecting = undefined;
    }
  }

  async fetchPage(startPosition: bigint, count: number): Promise<ShieldedPage> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    if (startPosition < 0n) throw new Error('Shielded page start cannot be negative.');
    if (!Number.isSafeInteger(count) || count < 1 || count > 8192) {
      throw new Error('Shielded DAPI page size must be between 1 and 8192.');
    }
    const response = await this.#run(
      'shielded.encryptedNotesWithProof',
      { startPosition: startPosition.toString(), count },
      () => this.#sdk!.shielded.encryptedNotesWithProof(startPosition, count),
    );
    const metadata = response.metadata;
    try {
      const notes = response.data.map((note: EvoShieldedEncryptedNote) => copyAndFreeEvoShieldedNote(note));
      return {
        notes,
        proofHeight: metadata.height,
        coreChainLockedHeight: metadata.coreChainLockedHeight,
        timeMs: metadata.timeMs,
        protocolVersion: metadata.protocolVersion,
      };
    } finally {
      metadata.free();
      response.free();
    }
  }
}
