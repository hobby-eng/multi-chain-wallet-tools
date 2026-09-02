import { EvoSDK } from '@dashevo/evo-sdk';
import type { ViewerNetwork } from './types.js';
import { validatePlatformAddress } from './public-address.js';

export interface PlatformAddressSnapshot {
  kind: 'platform';
  address: string;
  network: ViewerNetwork;
  exists: boolean;
  balanceCredits: bigint;
  nonce: bigint;
  proofHeight: bigint;
  coreChainLockedHeight: number;
  protocolVersion: number;
  responseTimeMs: bigint;
}

export class DashPlatformAddressSource {
  readonly #network: ViewerNetwork;
  #sdk: EvoSDK | undefined;

  constructor(network: ViewerNetwork) {
    this.#network = network;
  }

  async connect(): Promise<void> {
    if (this.#sdk !== undefined) return;
    const settings = { connectTimeoutMs: 10_000, timeoutMs: 30_000, retries: 3, banFailedAddress: true };
    const sdk = this.#network === 'mainnet'
      ? EvoSDK.mainnetTrusted({ settings })
      : EvoSDK.testnetTrusted({ settings });
    await sdk.connect();
    this.#sdk = sdk;
  }

  async query(addressInput: string): Promise<PlatformAddressSnapshot> {
    if (this.#sdk === undefined) throw new Error('Dash Evo SDK is not connected.');
    const address = validatePlatformAddress(addressInput, this.#network);
    const response = await this.#sdk.addresses.getWithProof(address);
    const metadata = response.metadata;
    const info = response.data;
    try {
      return {
        kind: 'platform',
        address,
        network: this.#network,
        exists: info !== undefined,
        balanceCredits: info?.balance ?? 0n,
        nonce: info?.nonce ?? 0n,
        proofHeight: metadata.height,
        coreChainLockedHeight: metadata.coreChainLockedHeight,
        protocolVersion: metadata.protocolVersion,
        responseTimeMs: metadata.timeMs,
      };
    } finally {
      info?.free();
      metadata.free();
      response.free();
    }
  }
}
