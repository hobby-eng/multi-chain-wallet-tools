import { bech32m, createBase58check } from '@scure/base';
import { sha256 } from '@ckd/core/crypto.js';
import { DUFFS_PER_DASH } from '@ckd/core/dash-units.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { createProviderHttp, ProviderHttpError, type FetchLike } from './provider-http.js';
import type { ViewerNetwork } from './types.js';

const base58check = createBase58check(sha256);
const DASHSCAN_PAGE_SIZE = 100;

export interface CoreAddressTransaction {
  txid: string;
  type: string | null;
  timestampMs: number | null;
  blockHeight: number | null;
  confirmations: number | null;
  instantLocked: boolean;
  chainLocked: boolean;
  receivedDuffs: bigint;
  spentInputDuffs: bigint;
  netDuffs: bigint;
  feeDuffs: bigint | null;
  blockHash: string | null;
}

export interface CoreAddressSnapshot {
  kind: 'core';
  provider: string;
  address: string;
  network: ViewerNetwork;
  balanceDuffs: bigint;
  unconfirmedDuffs: bigint;
  totalReceivedDuffs: bigint;
  totalSentDuffs: bigint;
  transactionCount: number;
  transactions: CoreAddressTransaction[];
  historyLimit: number;
  endpoint: string;
  indexStatus: 'ok';
  indexedHeight: number;
  indexedTimeMs: number;
  requests: number;
}

export interface CoreAddressProvider {
  readonly id: string;
  readonly displayName: string;
  endpoint(network: ViewerNetwork): string;
  query(
    address: string,
    network: ViewerNetwork,
    historyLimit: number,
    signal: AbortSignal | undefined,
    fetcher: FetchLike,
  ): Promise<CoreAddressSnapshot>;
}

const DASHSCAN_ENDPOINTS: Record<ViewerNetwork, string> = {
  mainnet: 'https://dashscan.pshenmic.dev',
  testnet: 'https://testnet.dashscan.pshenmic.dev',
};

const {
  object,
  optionalInteger,
  requiredInteger,
  exactInteger: exactDuffs,
  fetchJson,
} = createProviderHttp('DashScan');

function optionalDuffs(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    return exactDuffs(value, 'transaction amount');
  } catch {
    return null;
  }
}

/**
 * Adapter helper for a `CoreAddressProvider` that reports decimal DASH instead
 * of exact duffs. DashScan reports integer duffs and does not need it; it is
 * kept and vector-tested so a second provider cannot be added with a lossy
 * float conversion written inline.
 */
export function dashDecimalToDuffs(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value !== 'number' && typeof value !== 'string') return 0n;
  const text = typeof value === 'number' ? value.toFixed(8) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{0,8}))?$/u.exec(text);
  if (match === null) return 0n;
  const whole = BigInt(match[2]!);
  const fraction = BigInt((match[3] ?? '').padEnd(8, '0'));
  const result = whole * DUFFS_PER_DASH + fraction;
  return match[1] === '-' ? -result : result;
}

function decodeCoreAddress(addressInput: string, network: ViewerNetwork): { address: string; version: number } {
  const address = addressInput.trim();
  let payload: Uint8Array;
  try {
    payload = base58check.decode(address);
  } catch {
    throw new Error('Invalid Dash Core Base58Check address.');
  }
  const expected = getDashNetwork(network);
  if (payload.length !== 21 || (payload[0] !== expected.p2pkh && payload[0] !== expected.p2sh)) {
    throw new Error(`This is not a Dash Core ${network} P2PKH/P2SH address.`);
  }
  return { address, version: payload[0] };
}

export function validateCoreAddress(addressInput: string, network: ViewerNetwork): string {
  return decodeCoreAddress(addressInput, network).address;
}

/** Recovery derives only BIP44 P2PKH children, so its broker rejects P2SH. */
export function validateCoreP2pkhAddress(addressInput: string, network: ViewerNetwork): string {
  const decoded = decodeCoreAddress(addressInput, network);
  if (decoded.version !== getDashNetwork(network).p2pkh) {
    throw new Error(`This is not a Dash Core ${network} P2PKH address.`);
  }
  return decoded.address;
}

function decodePlatformAddress(addressInput: string, network: ViewerNetwork): { address: string; type: number } {
  const address = addressInput.trim().toLowerCase();
  let decoded: ReturnType<typeof bech32m.decode>;
  try {
    decoded = bech32m.decode(address as `${string}1${string}`, 200);
  } catch {
    throw new Error('Invalid Dash Platform Bech32m address.');
  }
  const expectedHrp = network === 'mainnet' ? 'dash' : 'tdash';
  if (decoded.prefix !== expectedHrp) throw new Error(`This Platform address is not for ${network}.`);
  const payload = bech32m.fromWords(decoded.words);
  if (payload.length !== 21 || (payload[0] !== 0xb0 && payload[0] !== 0x80)) {
    throw new Error('The value is not a DIP18 Platform P2PKH/P2SH payment address.');
  }
  return { address, type: payload[0] };
}

export function validatePlatformAddress(addressInput: string, network: ViewerNetwork): string {
  return decodePlatformAddress(addressInput, network).address;
}

/** Recovery derives only DIP17/DIP18 P2PKH children, so its broker rejects P2SH. */
export function validatePlatformP2pkhAddress(addressInput: string, network: ViewerNetwork): string {
  const decoded = decodePlatformAddress(addressInput, network);
  if (decoded.type !== 0xb0) throw new Error('The value is not a DIP18 Platform P2PKH payment address.');
  return decoded.address;
}

function addressesFromOutput(output: Record<string, unknown>): string[] {
  if (Array.isArray(output.addresses)) {
    return output.addresses.filter((item): item is string => typeof item === 'string');
  }
  return typeof output.address === 'string' ? [output.address] : [];
}

function transactionFee(inputs: unknown[], outputs: unknown[]): bigint | null {
  if (inputs.length === 0) return null;
  let inputTotal = 0n;
  let outputTotal = 0n;
  for (const value of inputs) {
    const amount = optionalDuffs(object(value, 'transaction input').amount);
    if (amount === null) return null;
    inputTotal += amount;
  }
  for (const value of outputs) {
    const amount = optionalDuffs(object(value, 'transaction output').value);
    if (amount === null) return null;
    outputTotal += amount;
  }
  const fee = inputTotal - outputTotal;
  return fee >= 0n ? fee : null;
}

function transactionView(value: unknown, address: string): CoreAddressTransaction {
  const tx = object(value, 'transaction');
  const inputs = Array.isArray(tx.vIn) ? tx.vIn : [];
  const outputs = Array.isArray(tx.vOut) ? tx.vOut : [];
  let spentInputDuffs = 0n;
  let receivedDuffs = 0n;
  for (const value of inputs) {
    const input = object(value, 'transaction input');
    if (input.address !== address) continue;
    const amount = optionalDuffs(input.amount);
    if (amount !== null) spentInputDuffs += amount;
  }
  for (const value of outputs) {
    const output = object(value, 'transaction output');
    if (!addressesFromOutput(output).includes(address)) continue;
    const amount = optionalDuffs(output.value);
    if (amount !== null) receivedDuffs += amount;
  }
  const timestampMs = typeof tx.timestamp === 'string' ? Date.parse(tx.timestamp) : Number.NaN;
  return {
    txid: typeof tx.hash === 'string' ? tx.hash : 'unknown',
    type: typeof tx.type === 'string' ? tx.type : null,
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    blockHeight: optionalInteger(tx.blockHeight),
    confirmations: optionalInteger(tx.confirmations),
    instantLocked: typeof tx.instantLock === 'string' && tx.instantLock.length > 0,
    chainLocked: tx.chainLocked === true,
    receivedDuffs,
    spentInputDuffs,
    netDuffs: receivedDuffs - spentInputDuffs,
    feeDuffs: transactionFee(inputs, outputs),
    blockHash: typeof tx.blockHash === 'string' ? tx.blockHash : null,
  };
}

async function queryDashScan(
  address: string,
  network: ViewerNetwork,
  historyLimit: number,
  signal: AbortSignal | undefined,
  fetcher: FetchLike,
): Promise<CoreAddressSnapshot> {
  const endpoint = DASHSCAN_ENDPOINTS[network];
  let requests = 0;
  requests += 1;
  const status = object(await fetchJson(fetcher, `${endpoint}/status`, signal), 'index status');
  if (status.status !== 'ok') throw new Error('DashScan reports that its index is not synchronized with Dash Core.');

  requests += 2;
  const [tipValue, summaryValue] = await Promise.all([
    fetchJson(fetcher, `${endpoint}/blocks?page=1&limit=1&order=desc`, signal),
    fetchJson(fetcher, `${endpoint}/address/${encodeURIComponent(address)}`, signal).catch((cause: unknown) => {
      if (cause instanceof ProviderHttpError && cause.status === 404) return null;
      throw cause;
    }),
  ]);
  const tipPage = object(tipValue, 'latest-block page');
  const tipItems = Array.isArray(tipPage.resultSet) ? tipPage.resultSet : [];
  if (tipItems.length !== 1) throw new Error('DashScan did not return its latest indexed block.');
  const tip = object(tipItems[0], 'latest indexed block');
  const indexedHeight = requiredInteger(tip.height, 'latest indexed block height');
  const indexedTimeMs = typeof tip.timestamp === 'string' ? Date.parse(tip.timestamp) : Number.NaN;
  if (!Number.isFinite(indexedTimeMs)) throw new Error('DashScan returned an invalid latest indexed block time.');

  if (summaryValue === null) {
    return {
      kind: 'core',
      provider: DASHSCAN_CORE_PROVIDER.displayName,
      address,
      network,
      balanceDuffs: 0n,
      unconfirmedDuffs: 0n,
      totalReceivedDuffs: 0n,
      totalSentDuffs: 0n,
      transactionCount: 0,
      transactions: [],
      historyLimit,
      endpoint,
      indexStatus: 'ok',
      indexedHeight,
      indexedTimeMs,
      requests,
    };
  }

  const summary = object(summaryValue, 'address summary');
  const balanceDuffs = exactDuffs(summary.balance, 'address balance');
  const totalReceivedDuffs = exactDuffs(summary.received, 'total received');
  const totalSentDuffs = exactDuffs(summary.sent, 'total sent');
  let transactionCount = requiredInteger(summary.txCount, 'transaction count');
  const transactions: CoreAddressTransaction[] = [];
  let target = Math.min(Math.max(transactionCount, 1), historyLimit);
  for (let pageNumber = 1; transactions.length < target; pageNumber += 1) {
    const limit = Math.min(DASHSCAN_PAGE_SIZE, target - transactions.length);
    requests += 1;
    const page = object(
      await fetchJson(
        fetcher,
        `${endpoint}/address/${encodeURIComponent(address)}/transactions?page=${pageNumber}&limit=${limit}&order=desc`,
        signal,
      ),
      'transaction page',
    );
    const items = Array.isArray(page.resultSet) ? page.resultSet : [];
    const pagination = object(page.pagination, 'transaction pagination');
    const reportedTotal = optionalInteger(pagination.total);
    if (reportedTotal !== null) transactionCount = Math.max(transactionCount, reportedTotal);
    target = Math.min(transactionCount, historyLimit);
    const remaining = target - transactions.length;
    transactions.push(...items.slice(0, remaining).map((item) => transactionView(item, address)));
    if (items.length < limit) break;
  }
  // Difference between the reported balance and the confirmed inflow minus
  // outflow. It equals the mempool delta only if the provider includes
  // unconfirmed value in `balance` and excludes it from `received`/`sent`;
  // that is not documented, so the value is presented as a discrepancy rather
  // than asserted to be a pending amount.
  const confirmedNet = totalReceivedDuffs - totalSentDuffs;
  return {
    kind: 'core',
    provider: DASHSCAN_CORE_PROVIDER.displayName,
    address,
    network,
    balanceDuffs,
    unconfirmedDuffs: balanceDuffs - confirmedNet,
    totalReceivedDuffs,
    totalSentDuffs,
    transactionCount,
    transactions,
    historyLimit,
    endpoint,
    indexStatus: 'ok',
    indexedHeight,
    indexedTimeMs,
    requests,
  };
}

export const DASHSCAN_CORE_PROVIDER: CoreAddressProvider = {
  id: 'dashscan',
  displayName: 'DashScan',
  endpoint(network) {
    return DASHSCAN_ENDPOINTS[network];
  },
  query: queryDashScan,
};

export async function queryCoreAddress(
  addressInput: string,
  network: ViewerNetwork,
  historyLimit: number,
  signal?: AbortSignal,
  fetcher: FetchLike = fetch,
  provider: CoreAddressProvider = DASHSCAN_CORE_PROVIDER,
): Promise<CoreAddressSnapshot> {
  const address = validateCoreAddress(addressInput, network);
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 1 || historyLimit > 1000) {
    throw new Error('Transaction history limit must be an integer from 1 to 1000.');
  }
  return provider.query(address, network, historyLimit, signal, fetcher);
}
