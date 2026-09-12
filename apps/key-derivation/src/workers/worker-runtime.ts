import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { hexToBytes, wipe } from '@ckd/core/crypto.js';
import { clearDerivationResult } from '@ckd/core/secrets.js';
import { findDerivedAddress } from '../address-search.js';
import type { WorkerMessage, WorkerRequest } from './protocol.js';
import type { SilentPaymentResult } from './silent-payment.js';
import type { Bip85RequestOptions, Bip85Result } from './bip85-deriver.js';
import type { MessageSigningFormat } from './protocol.js';
import type { ResultField } from '@ckd/core/types.js';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerMessage): void;
}

interface WorkerDependencies {
  getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter;
  runDerivationSelfTest(): Promise<CryptoSelfTestReport>;
  signDerivedMessage?(
    privateKeyHex: string,
    address: string,
    message: string,
    network: 'mainnet' | 'testnet',
    format: MessageSigningFormat,
    fields: readonly ResultField[],
  ): Promise<{ signature: string; format: string; verified: boolean }> | {
    signature: string;
    format: string;
    verified: boolean;
  };
  deriveSilentPayment?(
    seed: Uint8Array,
    network: 'mainnet' | 'testnet',
    account: number,
    labelIndexes?: readonly number[],
  ): Promise<SilentPaymentResult>;
  deriveBip85?(seed: Uint8Array, options: Bip85RequestOptions): Bip85Result;
  encryptDerivedP2pkhKey?(
    privateKey: Uint8Array,
    adapterId: string,
    network: 'mainnet' | 'testnet',
    passphrase: string,
  ): Promise<{ encryptedKey: string; address: string }>;
}

export function startDerivationWorker(dependencies: WorkerDependencies): void {
  const workerScope = self as unknown as WorkerScope;
  workerScope.postMessage({ type: 'ready' });

  workerScope.addEventListener('message', (event) => {
    const request = event.data;
    void (async () => {
      try {
        if (request.type === 'self-test') {
          const result = await dependencies.runDerivationSelfTest();
          workerScope.postMessage({ id: request.id, ok: true, type: 'self-test', result });
          return;
        }
        if (request.type === 'silent-payment') {
          try {
            if (dependencies.deriveSilentPayment === undefined) {
              throw new Error('Silent Payments are unavailable in this build profile.');
            }
            const result = await dependencies.deriveSilentPayment(
              request.seed,
              request.network,
              request.account,
              request.labelIndexes,
            );
            workerScope.postMessage({ id: request.id, ok: true, type: 'silent-payment', result });
          } finally {
            request.seed.fill(0);
          }
          return;
        }
        if (request.type === 'bip85') {
          try {
            if (dependencies.deriveBip85 === undefined) throw new Error('BIP85 is unavailable in this build profile.');
            const result = dependencies.deriveBip85(request.seed, request.options);
            workerScope.postMessage({ id: request.id, ok: true, type: 'bip85', result });
          } finally {
            request.seed.fill(0);
          }
          return;
        }
        try {
          const adapter = dependencies.getRuntimeCoinAdapter(request.adapterId);
          if (request.type === 'search') {
            const result = await findDerivedAddress(
              adapter,
              request.input,
              request.expectedAddress,
              request.start,
              request.count,
            );
            workerScope.postMessage({ id: request.id, ok: true, type: 'search', result });
            return;
          }
          if (request.type === 'sign-message') {
            const result = await adapter.derive({ ...request.input, start: request.input.start, count: 1 });
            let privateKey: Uint8Array | null = null;
            try {
              const row = result.rows[0];
              const derivedAddress = row?.basic.find((field) => field.key === 'address')?.value;
              const fields = row === undefined ? [] : [...row.basic, ...row.advanced];
              const privateKeyHex = fields.find((field) =>
                field.key === 'privateKeyHex' || field.key === 'childPrivateKey'
              )?.value;
              if (derivedAddress !== request.address) throw new Error('The selected address no longer matches the requested derivation path.');
              if (privateKeyHex === undefined) throw new Error('This derivation mode does not expose a compatible private key for message signing.');
              privateKey = hexToBytes(privateKeyHex);
              if (dependencies.signDerivedMessage === undefined) {
                throw new Error('Message signing is unavailable in this build profile.');
              }
              const signed = await dependencies.signDerivedMessage(
                privateKeyHex,
                request.address,
                request.message,
                request.input.network,
                request.format,
                fields,
              );
              workerScope.postMessage({ id: request.id, ok: true, type: 'sign-message', result: signed });
            } finally {
              wipe(privateKey);
              clearDerivationResult(result);
            }
            return;
          }
          if (request.type === 'bip38-encrypt') {
            const result = await adapter.derive({ ...request.input, start: request.input.start, count: 1 });
            let privateKey: Uint8Array | null = null;
            try {
              const row = result.rows[0];
              const derivedAddress = row?.basic.find((field) => field.key === 'address')?.value;
              const fields = row === undefined ? [] : [...row.basic, ...row.advanced];
              const privateKeyHex = fields.find((field) =>
                field.key === 'privateKeyHex' || field.key === 'childPrivateKey'
              )?.value;
              if (derivedAddress !== request.address) throw new Error('The selected address no longer matches the requested derivation path.');
              if (privateKeyHex === undefined) throw new Error('This derivation mode does not expose a compatible private key.');
              privateKey = hexToBytes(privateKeyHex);
              if (dependencies.encryptDerivedP2pkhKey === undefined) {
                throw new Error('Private-key encryption is unavailable in this build profile.');
              }
              const encrypted = await dependencies.encryptDerivedP2pkhKey(
                privateKey,
                request.adapterId,
                request.input.network,
                request.passphrase,
              );
              workerScope.postMessage({ id: request.id, ok: true, type: 'bip38-encrypt', result: encrypted });
            } finally {
              wipe(privateKey);
              clearDerivationResult(result);
            }
            return;
          }
          const result = await adapter.derive(request.input);
          workerScope.postMessage({ id: request.id, ok: true, type: 'derive', result });
        } finally {
          request.input.seed.fill(0);
        }
      } catch (cause) {
        workerScope.postMessage({
          id: request.id,
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();
  });
}
