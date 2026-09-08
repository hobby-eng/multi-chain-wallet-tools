import { emptyHistory } from './history-model.js';
import { decimal, fetchJson, record, unsignedInteger } from './network-service.js';
import type { RecoveryHistory, RecoveryNetwork } from './types.js';

// Bound large exchange/CoinJoin histories. Never label a truncated sum as a lifetime total.
export const HISTORY_MAX_PAGES = 20;
const HISTORY_TIMEOUT_MS = 15_000;
function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Malformed history page.');
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid history timestamp.');
  return new Date(value).toISOString();
}
function hash(value: unknown, ethereum = false): string {
  if (typeof value !== 'string' || !(ethereum ? /^0x[0-9a-f]{64}$/iu : /^[0-9a-f]{64}$/iu).test(value)) throw new Error('Invalid history transaction hash.');
  return value.toLowerCase();
}
function activity(h: RecoveryHistory, date: string, received: bigint, spent: bigint): void {
  const range = (first: 'firstSeen' | 'firstReceived' | 'firstSpent', last: 'lastSeen' | 'lastReceived' | 'lastSpent'): void => {
    if (h[first] === null || date < h[first]!) h[first] = date;
    if (h[last] === null || date > h[last]!) h[last] = date;
  };
  range('firstSeen', 'lastSeen');
  if (received > 0n) range('firstReceived', 'lastReceived');
  if (spent > 0n) range('firstSpent', 'lastSpent');
}
function clearDates(h: RecoveryHistory): void {
  for (const key of ['firstSeen', 'lastSeen', 'firstReceived', 'lastReceived', 'firstSpent', 'lastSpent'] as const) h[key] = null;
}
function btcStats(value: unknown, address: string) {
  const info = record(value, 'Bitcoin history');
  if (info.address !== address) throw new Error('Bitcoin history address mismatch.');
  const chain = record(info.chain_stats, 'Bitcoin chain stats');
  const mempool = record(info.mempool_stats, 'Bitcoin mempool stats');
  return { received: decimal(chain.funded_txo_sum, 'received'), spent: decimal(chain.spent_txo_sum, 'spent'),
    count: unsignedInteger(chain.tx_count, 'transaction count'), pending: unsignedInteger(mempool.tx_count, 'pending transaction count') };
}

export async function bitcoinAddressHistory(address: string, endpoints: ReadonlyArray<{ label: string; url: string }>, signal?: AbortSignal): Promise<RecoveryHistory> {
  for (const endpoint of endpoints) {
    signal?.throwIfAborted();
    try {
      const url = `${endpoint.url}/address/${address}`;
      const stats = btcStats(await fetchJson(url, signal, {}, HISTORY_TIMEOUT_MS), address);
      const h = emptyHistory('BTC', 'satoshis', 8);
      h.source = endpoint.label;
      h.scope = 'Confirmed address transactions';
      h.note = 'Dates are confirmation block times in UTC. Sent counts consumed address outputs, including change and fees; it is not the net amount paid to other people. Pending transactions are excluded from lifetime totals and dates.';
      h.totalReceivedAtomic = stats.received;
      h.totalSentAtomic = stats.spent;
      h.transactionCount = stats.count;
      h.pendingTransactionCount = stats.pending;
      let cursor = '';
      let received = 0n, spent = 0n;
      const seen = new Set<string>();
      let complete = stats.count === 0;
      for (let page = 0; !complete && page < HISTORY_MAX_PAGES; page += 1) {
        signal?.throwIfAborted();
        const items = array(await fetchJson(`${url}/txs/chain${cursor ? `/${cursor}` : ''}`, signal, {}, HISTORY_TIMEOUT_MS), 25);
        if (items.length === 0) break;
        for (const item of items) {
          const tx = record(item, 'Bitcoin transaction');
          const id = hash(tx.txid);
          if (seen.has(id)) throw new Error('Repeated Bitcoin history transaction.');
          seen.add(id); cursor = id;
          const status = record(tx.status, 'Bitcoin confirmation');
          if (status.confirmed !== true) throw new Error('Unconfirmed transaction in confirmed history.');
          const date = new Date(unsignedInteger(status.block_time, 'block time') * 1000).toISOString();
          let incoming = 0n, outgoing = 0n;
          for (const output of array(tx.vout, 100_000)) {
            const vout = record(output, 'Bitcoin output');
            if (vout.scriptpubkey_address === address) incoming += BigInt(decimal(vout.value, 'output value'));
          }
          for (const input of array(tx.vin, 100_000)) {
            const vin = record(input, 'Bitcoin input');
            if (vin.is_coinbase === true) continue;
            const previous = record(vin.prevout, 'Bitcoin previous output');
            if (previous.scriptpubkey_address === address) outgoing += BigInt(decimal(previous.value, 'input value'));
          }
          // Zero-valued outputs still establish address activity.
          const relevant = array(tx.vout, 100_000).some(output => record(output, 'output').scriptpubkey_address === address)
            || array(tx.vin, 100_000).some(input => { const vin = record(input, 'input'); return vin.prevout != null && record(vin.prevout, 'previous output').scriptpubkey_address === address; });
          if (!relevant) throw new Error('Unrelated Bitcoin history transaction.');
          received += incoming; spent += outgoing;
          activity(h, date, incoming, outgoing);
        }
        if (seen.size > stats.count) throw new Error('Bitcoin history changed during pagination.');
        complete = seen.size === stats.count;
        if (items.length < 25 && !complete) throw new Error('Incomplete Bitcoin history page.');
      }
      const after = btcStats(await fetchJson(url, signal, {}, HISTORY_TIMEOUT_MS), address);
      if (after.count !== stats.count || after.received !== stats.received || after.spent !== stats.spent) throw new Error('Bitcoin history changed during lookup.');
      if (complete && (received !== BigInt(stats.received) || spent !== BigInt(stats.spent))) throw new Error('Bitcoin history totals mismatch.');
      h.status = complete ? 'complete' : 'partial';
      if (!complete) {
        clearDates(h);
        h.note += ` Date coverage incomplete: read ${seen.size}/${stats.count} transactions (limit ${HISTORY_MAX_PAGES * 25}). Lifetime totals still come from the full address summary.`;
      }
      return h;
    } catch (cause) {
      signal?.throwIfAborted();
      if (endpoint === endpoints.at(-1)) throw cause;
    }
  }
  throw new Error('No Bitcoin history provider.');
}

const ETHEREUM_HISTORY_ENDPOINTS: Record<RecoveryNetwork, string> = {
  mainnet: 'https://eth.blockscout.com/api/v2',
  testnet: 'https://eth-sepolia.blockscout.com/api/v2',
};
function ethAddress(value: unknown): string | null {
  if (value === null) return null;
  const address = record(value, 'Ethereum address').hash;
  if (typeof address !== 'string' || !/^0x[0-9a-f]{40}$/iu.test(address)) throw new Error('Invalid Ethereum history address.');
  return address.toLowerCase();
}
async function ethPages(url: string, signal: AbortSignal | undefined, consume: (item: Record<string, unknown>) => void): Promise<boolean> {
  let query = '';
  const cursors = new Set<string>();
  for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
    signal?.throwIfAborted();
    const response = record(await fetchJson(url + query, signal, {}, HISTORY_TIMEOUT_MS), 'Ethereum history page');
    const items = array(response.items, 50);
    for (const item of items) consume(record(item, 'Ethereum history item'));
    if (response.next_page_params === null) return true;
    const params = record(response.next_page_params, 'Ethereum pagination');
    const search = new URLSearchParams();
    // Fixed-origin, allowlisted cursor fields only; never follow a provider URL.
    for (const [key, value] of Object.entries(params).sort()) {
      if (['block_number', 'index', 'items_count', 'transaction_index'].includes(key)) {
        search.set(key, String(unsignedInteger(value, 'history cursor')));
      } else if (key === 'value' || key === 'fee') {
        search.set(key, decimal(value, 'history cursor amount'));
      } else if (key === 'hash') {
        search.set(key, hash(value, true));
      } else if (key === 'inserted_at') {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(value)) throw new Error('Invalid Ethereum cursor timestamp.');
        timestamp(value);
        search.set(key, value); // Preserve microsecond precision for stable paging.
      } else throw new Error('Unexpected Ethereum cursor.');
    }
    query = `?${search.toString()}`;
    if (items.length === 0 || search.size === 0 || cursors.has(query)) throw new Error('Repeated Ethereum history cursor.');
    cursors.add(query);
  }
  return false;
}

export async function ethereumAddressHistory(address: string, network: RecoveryNetwork, signal?: AbortSignal): Promise<RecoveryHistory> {
  const url = `${ETHEREUM_HISTORY_ENDPOINTS[network]}/addresses/${address.toLowerCase()}`;
  const target = address.toLowerCase();
  const h = emptyHistory('ETH', 'wei', 18);
  h.source = 'Blockscout';
  h.scope = 'Confirmed native ETH transactions and internal value transfers';
  h.note = 'Dates are block times in UTC. Failed transfers add no received/sent value, but sender gas fees are counted. Self-transfers appear in both totals. Tokens, validator withdrawals and mining rewards are outside this history scope; this is not a full balance reconciliation.';
  let received = 0n, sent = 0n, fees = 0n;
  let feesKnown = true;
  const ids = new Set<string>(), transactions = new Set<string>(), traceIds = new Set<string>();
  const normalComplete = await ethPages(`${url}/transactions`, signal, tx => {
    // Pending rows have no confirmation time and never enter these totals.
    if (tx.block_number === null) return;
    unsignedInteger(tx.block_number, 'Ethereum block number');
    const id = hash(tx.hash, true);
    if (ids.has(id)) throw new Error('Repeated Ethereum transaction.');
    ids.add(id); transactions.add(id);
    const date = timestamp(tx.timestamp);
    const from = ethAddress(tx.from), to = ethAddress(tx.to);
    if (from !== target && to !== target) throw new Error('Unrelated Ethereum transaction.');
    if (tx.status !== 'ok' && tx.status !== 'error') throw new Error('Unknown Ethereum transaction status.');
    const value = BigInt(decimal(tx.value, 'Ethereum value'));
    const incoming = tx.status === 'ok' && to === target ? value : 0n;
    const outgoing = tx.status === 'ok' && from === target ? value : 0n;
    let fee = 0n;
    if (from === target) {
      const data = record(tx.fee, 'Ethereum transaction fee');
      if (data.type === 'actual') fee = BigInt(decimal(data.value, 'Ethereum gas fee'));
      else feesKnown = false;
    }
    received += incoming; sent += outgoing; fees += fee;
    activity(h, date, incoming, outgoing + fee);
  });
  const internalComplete = await ethPages(`${url}/internal-transactions`, signal, tx => {
    const id = hash(tx.transaction_hash, true);
    const index = unsignedInteger(tx.index, 'Ethereum internal index');
    const traceId = `${id}:${index}`;
    if (traceIds.has(traceId)) throw new Error('Repeated Ethereum internal transaction.');
    traceIds.add(traceId);
    unsignedInteger(tx.block_number, 'Ethereum internal block number');
    const from = ethAddress(tx.from), to = ethAddress(tx.to ?? tx.created_contract ?? null);
    if (from !== target && to !== target) throw new Error('Unrelated Ethereum internal transaction.');
    if (typeof tx.success !== 'boolean') throw new Error('Unknown Ethereum internal status.');
    // Blockscout normally omits root calls. If exposed, index 0 mirrors the
    // already counted top-level transaction and must not be counted twice.
    if (index === 0 && ids.has(id) && tx.type !== 'selfdestruct') return;
    if (tx.success !== true || tx.error != null) return;
    // Delegate/static calls carry call-context values, not ETH transfers.
    if (!['call', 'create', 'create2', 'selfdestruct', 'suicide'].includes(String(tx.type))) {
      if (['delegatecall', 'staticcall', 'callcode'].includes(String(tx.type))) return;
      throw new Error('Unknown Ethereum internal transfer type.');
    }
    const value = BigInt(decimal(tx.value, 'Ethereum internal value'));
    const incoming = to === target ? value : 0n, outgoing = from === target ? value : 0n;
    received += incoming; sent += outgoing;
    transactions.add(id);
    activity(h, timestamp(tx.timestamp), incoming, outgoing);
  });
  h.status = normalComplete && internalComplete ? 'complete' : 'partial';
  if (h.status === 'complete') {
    h.totalReceivedAtomic = received.toString(); h.totalSentAtomic = sent.toString();
    h.totalFeesAtomic = feesKnown ? fees.toString() : null;
    h.transactionCount = transactions.size;
  } else {
    clearDates(h);
    h.note += ` Pagination limit reached (${HISTORY_MAX_PAGES * 50} entries per history stream); lifetime sums and dates are withheld.`;
  }
  return h;
}
