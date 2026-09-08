import { bitcoinAddressHistory, ethereumAddressHistory } from './address-history-service.js';
import {
  RECOVERY_EVM_ACCOUNT_BATCH,
  RECOVERY_UTXO_ADDRESS_BATCH,
  type EvmAccountBatchView,
  type UtxoAddressView,
} from './network-protocol.js';
import {
  DirectRecoveryNetworkService,
  assertNetwork,
  decimal,
  fetchJson,
  record,
  unsignedInteger,
} from './network-service.js';
import type { RecoveryNetwork } from './types.js';

const BITCOIN_HTTP_CONCURRENCY = 3;
const BITCOIN_HTTP_ATTEMPTS = 3;
const BITCOIN_HTTP_TIMEOUT_MS = 15_000;
const BITCOIN_CACHE_TTL_MS = 5 * 60_000;
const BITCOIN_RETRY_DELAYS_MS = [350, 900] as const;
const BITCOIN_ENDPOINTS: Record<RecoveryNetwork, ReadonlyArray<{ label: string; url: string }>> = {
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
const BITCOIN_BLOCKCYPHER_ENDPOINTS: Record<RecoveryNetwork, string> = {
  mainnet: 'https://api.blockcypher.com/v1/btc/main/addrs',
  testnet: 'https://api.blockcypher.com/v1/btc/test3/addrs',
};
const ETHEREUM_ENDPOINTS: Record<RecoveryNetwork, string> = {
  mainnet: 'https://ethereum-rpc.publicnode.com',
  testnet: 'https://ethereum-sepolia-rpc.publicnode.com',
};

function assertBitcoinAddress(address: unknown, network: RecoveryNetwork): asserts address is string {
  const pattern = network === 'mainnet'
    ? /^(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/u
    : /^(?:[mn2][1-9A-HJ-NP-Za-km-z]{25,34}|tb1[ac-hj-np-z02-9]{11,87})$/u;
  if (typeof address !== 'string' || !pattern.test(address)) {
    throw new Error(`Network Worker rejected an invalid Bitcoin ${network} address.`);
  }
}

function assertEthereumAddress(address: unknown): asserts address is string {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    throw new Error('Network Worker rejected an invalid Ethereum address.');
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T, index);
    }
  }));
  return results;
}

function abortError(): DOMException {
  return new DOMException('Recovery network operation cancelled.', 'AbortError');
}

async function waitForBitcoinRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) onAbort();
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
  if (/^(?:Blockchain\.com|BlockCypher|Bitcoin address lookup failed)/u.test(message)) {
    return message.slice(0, 500);
  }
  const http = /Network request failed with HTTP [0-9]{3}/u.exec(message)?.[0];
  if (http !== undefined) return http;
  if (/failed to fetch|fetch failed/iu.test(message)) return 'Failed to fetch';
  if (/timed out/iu.test(message)) return 'Timed out';
  return message.slice(0, 140);
}

async function fetchBitcoinAddress(
  network: RecoveryNetwork,
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
      const funded = BigInt(decimal(chain.funded_txo_sum, 'confirmed funded amount'))
        + BigInt(decimal(mempool.funded_txo_sum, 'pending funded amount'));
      const spent = BigInt(decimal(chain.spent_txo_sum, 'confirmed spent amount'))
        + BigInt(decimal(mempool.spent_txo_sum, 'pending spent amount'));
      if (spent > funded) throw new Error(`${endpoint.label} returned an impossible negative Bitcoin balance.`);
      return {
        address,
        balance: (funded - spent).toString(),
        transactionCount: unsignedInteger(chain.tx_count, 'confirmed transaction count')
          + unsignedInteger(mempool.tx_count, 'pending transaction count'),
      };
    } catch (cause) {
      if (signal?.aborted === true || !isRetryableBitcoinFailure(cause)) throw cause;
      failures.push(`${endpoint.label}: ${bitcoinFailureSummary(cause)}`);
      if (attempt === BITCOIN_HTTP_ATTEMPTS) {
        throw new Error(`Bitcoin address lookup failed after ${BITCOIN_HTTP_ATTEMPTS} attempts across Mempool.space and Blockstream.info (${failures.join('; ')}).`);
      }
      await waitForBitcoinRetry(BITCOIN_RETRY_DELAYS_MS[attempt - 1] ?? 900, signal);
    }
  }
  throw new Error('Bitcoin address lookup exhausted its bounded retry state.');
}

function parseBlockchainBalanceBatch(value: unknown, expected: readonly string[]): UtxoAddressView[] {
  const response = record(value, 'Blockchain.com balance response');
  const responseKeys = Object.keys(response);
  if (responseKeys.length !== expected.length || responseKeys.some((address) => !expected.includes(address))) {
    throw new Error('Blockchain.com returned an incomplete or unexpected Bitcoin balance batch.');
  }
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
  if (!Array.isArray(response.addresses) || response.addresses.length !== expected.length) {
    throw new Error('Blockchain.com returned an incomplete Bitcoin address batch.');
  }
  const byAddress = new Map<string, UtxoAddressView>();
  for (const item of response.addresses) {
    const entry = record(item, 'Blockchain.com address entry');
    if (typeof entry.address !== 'string' || !expected.includes(entry.address) || byAddress.has(entry.address)) {
      throw new Error('Blockchain.com returned an unexpected or duplicate Bitcoin address.');
    }
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
  const rawEntries = Array.isArray(value) ? value : [value];
  if (rawEntries.length !== expected.length) throw new Error('BlockCypher returned an incomplete Bitcoin address batch.');
  const byAddress = new Map<string, UtxoAddressView>();
  for (const item of rawEntries) {
    const entry = record(item, 'BlockCypher address entry');
    if (typeof entry.address !== 'string' || !expected.includes(entry.address) || byAddress.has(entry.address)) {
      throw new Error('BlockCypher returned an unexpected or duplicate Bitcoin address.');
    }
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
  network: RecoveryNetwork,
  addresses: readonly string[],
  signal?: AbortSignal,
): Promise<UtxoAddressView[]> {
  const providers = [
    ...(network === 'mainnet' ? [{
      label: 'Blockchain.com balance',
      url: `${BITCOIN_MAINNET_BALANCE_ENDPOINT}?active=${addresses.map(encodeURIComponent).join('%7C')}`,
      parse: parseBlockchainBalanceBatch,
    }] : []),
    {
      label: 'BlockCypher',
      url: `${BITCOIN_BLOCKCYPHER_ENDPOINTS[network]}/${addresses.map(encodeURIComponent).join(';')}/balance`,
      parse: parseBlockCypherBatch,
    },
    ...(network === 'mainnet' ? [{
      label: 'Blockchain.com multi-address',
      url: `${BITCOIN_MAINNET_MULTIADDR_ENDPOINT}?active=${addresses.map(encodeURIComponent).join('%7C')}&n=0`,
      parse: parseBlockchainMultiAddressBatch,
    }] : []),
  ];
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return provider.parse(await fetchJson(provider.url, signal, {}, BITCOIN_HTTP_TIMEOUT_MS), addresses);
    } catch (cause) {
      if (signal?.aborted === true) throw cause;
      failures.push(`${provider.label}: ${bitcoinFailureSummary(cause)}`);
    }
  }
  throw new Error(failures.join('; '));
}

export class MultiChainRecoveryNetworkService extends DirectRecoveryNetworkService {
  override async addressHistory(coin: 'bitcoin' | 'ethereum', network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<import('./types.js').RecoveryHistory> {
    assertNetwork(network);
    const historySignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]);
    if (coin === 'bitcoin') {
      assertBitcoinAddress(address, network);
      return bitcoinAddressHistory(address, BITCOIN_ENDPOINTS[network], historySignal);
    }
    if (coin === 'ethereum') {
      assertEthereumAddress(address);
      return ethereumAddressHistory(address, network, historySignal);
    }
    throw new Error('Unsupported history coin.');
  }

  readonly #bitcoinAddressCache = new Map<string, { expiresAt: number; value: UtxoAddressView }>();

  override async utxoAddresses(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<UtxoAddressView[]> {
    assertNetwork(network);
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > RECOVERY_UTXO_ADDRESS_BATCH) {
      throw new Error(`Network Worker requires 1 to ${RECOVERY_UTXO_ADDRESS_BATCH} Bitcoin addresses per request.`);
    }
    addresses.forEach((address) => assertBitcoinAddress(address, network));
    const now = Date.now();
    const missing = addresses.filter((address) => {
      const cached = this.#bitcoinAddressCache.get(`${network}:${address}`);
      if (cached !== undefined && cached.expiresAt > now) return false;
      if (cached !== undefined) this.#bitcoinAddressCache.delete(`${network}:${address}`);
      return true;
    });
    if (missing.length > 0) {
      let loaded: UtxoAddressView[];
      let batchFailure: unknown;
      try {
        loaded = await fetchBitcoinBatch(network, missing, signal);
      } catch (cause) {
        if (signal?.aborted === true) throw cause;
        batchFailure = cause;
        try {
          loaded = await mapConcurrent(missing, BITCOIN_HTTP_CONCURRENCY, (address) => fetchBitcoinAddress(network, address, signal));
        } catch (fallbackCause) {
          const batchMessage = bitcoinFailureSummary(batchFailure);
          const fallbackMessage = bitcoinFailureSummary(fallbackCause);
          throw new Error(`Bitcoin batch providers failed (${batchMessage}); Esplora fallback also failed (${fallbackMessage}).`);
        }
      }
      const expiresAt = Date.now() + BITCOIN_CACHE_TTL_MS;
      for (const value of loaded) this.#bitcoinAddressCache.set(`${network}:${value.address}`, { expiresAt, value });
    }
    return addresses.map((address) => {
      const cached = this.#bitcoinAddressCache.get(`${network}:${address}`);
      if (cached === undefined) throw new Error('Bitcoin address cache omitted a validated response.');
      return cached.value;
    });
  }

  override async evmAccounts(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<EvmAccountBatchView> {
    assertNetwork(network);
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > RECOVERY_EVM_ACCOUNT_BATCH) {
      throw new Error(`Network Worker requires 1 to ${RECOVERY_EVM_ACCOUNT_BATCH} Ethereum addresses per request.`);
    }
    addresses.forEach(assertEthereumAddress);
    const head = record(await fetchJson(ETHEREUM_ENDPOINTS[network], signal, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'block', method: 'eth_blockNumber', params: [] }),
    }), 'Ethereum block response');
    if (head.error !== undefined || head.id !== 'block' || typeof head.result !== 'string'
      || !/^0x[0-9a-f]+$/u.test(head.result)) throw new Error('Ethereum RPC returned an invalid block number.');
    const blockNumber = head.result;
    const requests = [
      ...addresses.flatMap((address, index) => [
        { jsonrpc: '2.0', id: `balance:${index}`, method: 'eth_getBalance', params: [address, blockNumber] },
        { jsonrpc: '2.0', id: `nonce:${index}`, method: 'eth_getTransactionCount', params: [address, blockNumber] },
      ]),
    ];
    const raw = await fetchJson(ETHEREUM_ENDPOINTS[network], signal, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requests),
    });
    if (!Array.isArray(raw) || raw.length !== requests.length) throw new Error('Ethereum RPC returned an incomplete batch.');
    const results = new Map<string, string>();
    for (const item of raw) {
      const response = record(item, 'Ethereum RPC response');
      if (response.error !== undefined || typeof response.id !== 'string' || typeof response.result !== 'string'
        || !/^0x[0-9a-f]+$/u.test(response.result)) {
        throw new Error('Ethereum RPC returned a malformed or failed response.');
      }
      if (results.has(response.id)) throw new Error('Ethereum RPC repeated a response ID.');
      results.set(response.id, response.result);
    }
    return {
      blockNumber: BigInt(blockNumber).toString(),
      entries: addresses.map((address, index) => {
        const balance = results.get(`balance:${index}`);
        const nonce = results.get(`nonce:${index}`);
        if (balance === undefined || nonce === undefined) throw new Error('Ethereum RPC omitted an account result.');
        return { address, balance: BigInt(balance).toString(), nonce: BigInt(nonce).toString() };
      }),
    };
  }
}
