import { normalizeBitcoinAddress } from './address-normalization.js';
import { bitcoinAddressHistory } from './history.js';
import { decimal, fetchJson, publicProviderAbortError, record, unsignedInteger } from './http.js';
import {
  RECOVERY_UTXO_ADDRESS_BATCH,
  type PublicDataNetwork,
  type RecoveryHistory,
  type UtxoAddressView,
} from './types.js';

const BITCOIN_HTTP_CONCURRENCY = 3;
const BITCOIN_HTTP_ATTEMPTS = 3;
const BITCOIN_HTTP_TIMEOUT_MS = 15_000;
const BITCOIN_RETRY_DELAYS_MS = [350, 900] as const;
const BITCOIN_ENDPOINTS: Record<PublicDataNetwork, ReadonlyArray<{ label: string; url: string }>> = {
  mainnet: [
    { label: 'Blockstream.info', url: 'https://blockstream.info/api' },
    { label: 'Mempool.space', url: 'https://mempool.space/api' },
  ],
  testnet: [
    { label: 'Blockstream.info', url: 'https://blockstream.info/testnet/api' },
    { label: 'Mempool.space', url: 'https://mempool.space/testnet/api' },
  ],
};
const BITCOIN_MAINNET_BALANCE_ENDPOINT = 'https://blockchain.info/balance';
const BITCOIN_MAINNET_MULTIADDR_ENDPOINT = 'https://blockchain.info/multiaddr';
const BITCOIN_BLOCKCYPHER_ENDPOINTS: Record<PublicDataNetwork, string> = {
  mainnet: 'https://api.blockcypher.com/v1/btc/main/addrs',
  testnet: 'https://api.blockcypher.com/v1/btc/test3/addrs',
};
async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index] as T, index);
      }
    }),
  );
  return results;
}
async function waitForBitcoinRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw publicProviderAbortError();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(publicProviderAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
function isRetryableBitcoinFailure(cause: unknown): boolean {
  if (cause instanceof DOMException && cause.name === 'AbortError') return false;
  const message = cause instanceof Error ? cause.message : String(cause);
  const status = /HTTP ([0-9]{3})\b/u.exec(message)?.[1];
  if (status !== undefined && !['408', '425', '429'].includes(status) && !status.startsWith('5')) return false;
  return true;
}
function bitcoinFailureSummary(cause: unknown): string {
  const message = (cause instanceof Error ? cause.message : String(cause)).replace(/\s+/gu, ' ').trim();
  if (/^(?:Blockchain\.com|BlockCypher|Bitcoin address lookup failed)/u.test(message)) return message.slice(0, 500);
  const http = /Network request failed with HTTP [0-9]{3}/u.exec(message)?.[0];
  if (http !== undefined) return http;
  if (/failed to fetch|fetch failed/iu.test(message)) return 'Failed to fetch';
  if (/timed out/iu.test(message)) return 'Timed out';
  return message.slice(0, 140);
}
async function fetchBitcoinAddress(
  network: PublicDataNetwork,
  address: string,
  signal?: AbortSignal,
): Promise<UtxoAddressView> {
  const failures: string[] = [];
  const endpoints = BITCOIN_ENDPOINTS[network];
  for (let attempt = 1; attempt <= BITCOIN_HTTP_ATTEMPTS; attempt += 1) {
    const endpoint = endpoints[(attempt - 1) % endpoints.length]!;
    try {
      const value = record(
        await fetchJson(`${endpoint.url}/address/${encodeURIComponent(address)}`, signal, {}, BITCOIN_HTTP_TIMEOUT_MS),
        `${endpoint.label} address response`,
      );
      if (value.address !== address) throw new Error(`${endpoint.label} returned the wrong Bitcoin address.`);
      const chain = record(value.chain_stats, `${endpoint.label} confirmed address statistics`);
      const mempool = record(value.mempool_stats, `${endpoint.label} pending address statistics`);
      const funded =
        BigInt(decimal(chain.funded_txo_sum, 'confirmed funded amount')) +
        BigInt(decimal(mempool.funded_txo_sum, 'pending funded amount'));
      const spent =
        BigInt(decimal(chain.spent_txo_sum, 'confirmed spent amount')) +
        BigInt(decimal(mempool.spent_txo_sum, 'pending spent amount'));
      if (spent > funded) throw new Error(`${endpoint.label} returned an impossible negative Bitcoin balance.`);
      return {
        address,
        balance: (funded - spent).toString(),
        transactionCount:
          unsignedInteger(chain.tx_count, 'confirmed transaction count') +
          unsignedInteger(mempool.tx_count, 'pending transaction count'),
      };
    } catch (cause) {
      if (signal?.aborted || !isRetryableBitcoinFailure(cause)) throw cause;
      failures.push(`${endpoint.label}: ${bitcoinFailureSummary(cause)}`);
      if (attempt === BITCOIN_HTTP_ATTEMPTS)
        throw new Error(
          `Bitcoin address lookup failed after ${BITCOIN_HTTP_ATTEMPTS} attempts across Mempool.space and Blockstream.info (${failures.join('; ')}).`,
        );
      await waitForBitcoinRetry(BITCOIN_RETRY_DELAYS_MS[attempt - 1] ?? 900, signal);
    }
  }
  throw new Error('Bitcoin address lookup exhausted its bounded retry state.');
}
function parseBlockchainBalanceBatch(value: unknown, expected: readonly string[]): UtxoAddressView[] {
  const response = record(value, 'Blockchain.com balance response');
  const keys = Object.keys(response);
  if (keys.length !== expected.length || keys.some((address) => !expected.includes(address)))
    throw new Error('Blockchain.com returned an incomplete or unexpected Bitcoin balance batch.');
  return expected.map((address) => {
    const entry = record(response[address], 'Blockchain.com balance entry');
    return {
      address,
      balance: decimal(entry.final_balance, 'Bitcoin final balance'),
      transactionCount: unsignedInteger(entry.n_tx, 'Bitcoin transaction count'),
    };
  });
}
function parseBlockchainMultiAddressBatch(value: unknown, expected: readonly string[]): UtxoAddressView[] {
  const response = record(value, 'Blockchain.com multi-address response');
  if (!Array.isArray(response.addresses) || response.addresses.length !== expected.length)
    throw new Error('Blockchain.com returned an incomplete Bitcoin address batch.');
  const byAddress = new Map<string, UtxoAddressView>();
  for (const item of response.addresses) {
    const entry = record(item, 'Blockchain.com address entry');
    if (typeof entry.address !== 'string' || !expected.includes(entry.address) || byAddress.has(entry.address))
      throw new Error('Blockchain.com returned an unexpected or duplicate Bitcoin address.');
    byAddress.set(entry.address, {
      address: entry.address,
      balance: decimal(entry.final_balance, 'Bitcoin final balance'),
      transactionCount: unsignedInteger(entry.n_tx, 'Bitcoin transaction count'),
    });
  }
  return expected.map((address) => {
    const entry = byAddress.get(address);
    if (entry === undefined) throw new Error('Blockchain.com omitted a Bitcoin address.');
    return entry;
  });
}
function parseBlockCypherBatch(value: unknown, expected: readonly string[]): UtxoAddressView[] {
  const raw = Array.isArray(value) ? value : [value];
  if (raw.length !== expected.length) throw new Error('BlockCypher returned an incomplete Bitcoin address batch.');
  const byAddress = new Map<string, UtxoAddressView>();
  for (const item of raw) {
    const entry = record(item, 'BlockCypher address entry');
    if (typeof entry.address !== 'string' || !expected.includes(entry.address) || byAddress.has(entry.address))
      throw new Error('BlockCypher returned an unexpected or duplicate Bitcoin address.');
    byAddress.set(entry.address, {
      address: entry.address,
      balance: decimal(entry.final_balance, 'Bitcoin final balance'),
      transactionCount: unsignedInteger(entry.final_n_tx, 'Bitcoin final transaction count'),
    });
  }
  return expected.map((address) => {
    const entry = byAddress.get(address);
    if (entry === undefined) throw new Error('BlockCypher omitted a Bitcoin address.');
    return entry;
  });
}
async function fetchBitcoinBatch(
  network: PublicDataNetwork,
  addresses: readonly string[],
  signal?: AbortSignal,
): Promise<UtxoAddressView[]> {
  const providers = [
    ...(network === 'mainnet'
      ? [
          {
            label: 'Blockchain.com balance',
            url: `${BITCOIN_MAINNET_BALANCE_ENDPOINT}?active=${addresses.map(encodeURIComponent).join('%7C')}`,
            parse: parseBlockchainBalanceBatch,
          },
        ]
      : []),
    {
      label: 'BlockCypher',
      url: `${BITCOIN_BLOCKCYPHER_ENDPOINTS[network]}/${addresses.map(encodeURIComponent).join(';')}/balance`,
      parse: parseBlockCypherBatch,
    },
    ...(network === 'mainnet'
      ? [
          {
            label: 'Blockchain.com multi-address',
            url: `${BITCOIN_MAINNET_MULTIADDR_ENDPOINT}?active=${addresses.map(encodeURIComponent).join('%7C')}&n=0`,
            parse: parseBlockchainMultiAddressBatch,
          },
        ]
      : []),
  ];
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return provider.parse(await fetchJson(provider.url, signal, {}, BITCOIN_HTTP_TIMEOUT_MS), addresses);
    } catch (cause) {
      if (signal?.aborted) throw cause;
      failures.push(`${provider.label}: ${bitcoinFailureSummary(cause)}`);
    }
  }
  throw new Error(failures.join('; '));
}

export class BitcoinPublicDataService {
  async addressHistory(network: PublicDataNetwork, address: string, signal?: AbortSignal): Promise<RecoveryHistory> {
    if (network !== 'mainnet' && network !== 'testnet')
      throw new Error('Network Worker rejected an unsupported network.');
    const historySignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]);
    return bitcoinAddressHistory(normalizeBitcoinAddress(address, network), BITCOIN_ENDPOINTS[network], historySignal);
  }

  async utxoAddresses(
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<UtxoAddressView[]> {
    if (network !== 'mainnet' && network !== 'testnet')
      throw new Error('Network Worker rejected an unsupported network.');
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > RECOVERY_UTXO_ADDRESS_BATCH)
      throw new Error(`Network Worker requires 1 to ${RECOVERY_UTXO_ADDRESS_BATCH} Bitcoin addresses per request.`);
    addresses = addresses.map((address) => normalizeBitcoinAddress(address, network));
    signal?.throwIfAborted();
    const unique = [...new Set(addresses)];
    let loaded: UtxoAddressView[];
    try {
      loaded = await fetchBitcoinBatch(network, unique, signal);
    } catch (cause) {
      if (signal?.aborted) throw cause;
      try {
        loaded = await mapConcurrent(unique, BITCOIN_HTTP_CONCURRENCY, (address) =>
          fetchBitcoinAddress(network, address, signal),
        );
      } catch (fallbackCause) {
        throw new Error(
          `Bitcoin batch providers failed (${bitcoinFailureSummary(cause)}); Esplora fallback also failed (${bitcoinFailureSummary(fallbackCause)}).`,
        );
      }
    }
    const byAddress = new Map(loaded.map((value) => [value.address, value]));
    return addresses.map((address) => {
      const value = byAddress.get(address);
      if (value === undefined) throw new Error('Bitcoin lookup omitted a validated response.');
      return value;
    });
  }
}
