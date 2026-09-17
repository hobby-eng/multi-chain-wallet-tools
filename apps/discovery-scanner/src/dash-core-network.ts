import { fetchRecoveryJson } from './recovery-http.js';
import { platformDecimal, platformRecord, platformTimestamp } from './platform-explorer-values.js';
import { DASHSCAN_CORE_ENDPOINTS } from './coins/dash/endpoints.js';
import { validateCoreP2pkhAddress } from '@ckd/dash-network/public-address.js';
import { RECOVERY_CORE_ADDRESS_BATCH } from '@ckd/network-boundary/protocol.js';
import type { DashCoreTransactionView, RecoveryNetwork } from '@ckd/network-boundary/protocol.js';
import {
  assertAddressBatch,
  assertHash,
  assertNetwork,
  assertSingleAddress,
  TRANSACTION_HASH_PATTERN,
} from './network-validation.js';

export class DashCoreNetworkService {
  async coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    return fetchRecoveryJson(`${DASHSCAN_CORE_ENDPOINTS[network]}/status`, signal);
  }

  async coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    return fetchRecoveryJson(`${DASHSCAN_CORE_ENDPOINTS[network]}/blocks?page=1&limit=1&order=desc`, signal);
  }

  async coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    assertAddressBatch(addresses, network, validateCoreP2pkhAddress, 'Dash Core P2PKH', RECOVERY_CORE_ADDRESS_BATCH);
    return fetchRecoveryJson(
      `${DASHSCAN_CORE_ENDPOINTS[network]}/addresses/info?addresses=${addresses.map(encodeURIComponent).join(',')}`,
      signal,
    );
  }

  async coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    assertSingleAddress(address, network, validateCoreP2pkhAddress, 'Dash Core P2PKH');
    const historyValue = await fetchRecoveryJson(
      `${DASHSCAN_CORE_ENDPOINTS[network]}/address/${encodeURIComponent(address)}`,
      signal,
    );
    if (typeof historyValue !== 'object' || historyValue === null || Array.isArray(historyValue)) return historyValue;
    const history = historyValue as Record<string, unknown>;
    // DashScan currently leaves firstSeenBlock/Timestamp null for some
    // special-transaction outputs (for example Asset Unlock), while retaining
    // the authoritative firstSeenTx hash. Resolve that transaction through the
    // same source so the public recovery platformRecord still gets its first date.
    if (
      (typeof history.firstSeenBlockTimestamp === 'string' &&
        Number.isFinite(Date.parse(history.firstSeenBlockTimestamp))) ||
      typeof history.firstSeenTx !== 'string' ||
      !TRANSACTION_HASH_PATTERN.test(history.firstSeenTx)
    )
      return historyValue;
    const transactionValue = await fetchRecoveryJson(
      `${DASHSCAN_CORE_ENDPOINTS[network]}/transaction/${encodeURIComponent(history.firstSeenTx)}`,
      signal,
    );
    if (typeof transactionValue !== 'object' || transactionValue === null || Array.isArray(transactionValue))
      return historyValue;
    const transaction = transactionValue as Record<string, unknown>;
    if (transaction.hash !== history.firstSeenTx) return historyValue;
    const transactionTimestamp = transaction.timestamp;
    if (typeof transactionTimestamp !== 'string' || !Number.isFinite(Date.parse(transactionTimestamp)))
      return historyValue;
    return { ...history, firstSeenBlockTimestamp: transactionTimestamp };
  }

  async coreTransaction(
    network: RecoveryNetwork,
    hash: string,
    signal?: AbortSignal,
  ): Promise<DashCoreTransactionView> {
    assertNetwork(network);
    assertHash(hash);
    const transaction = platformRecord(
      await fetchRecoveryJson(`${DASHSCAN_CORE_ENDPOINTS[network]}/transaction/${hash}`, signal),
      'DashScan transaction',
    );
    if (transaction.hash !== hash) throw new Error('DashScan transaction did not match the requested hash.');
    const inputs = Array.isArray(transaction.vIn) ? transaction.vIn : [];
    const extraPayload = platformRecord(transaction.extraPayload, 'DashScan asset-lock payload');
    const outputs = Array.isArray(extraPayload.outputs) ? extraPayload.outputs : [];
    return {
      hash,
      type: typeof transaction.type === 'string' ? transaction.type : '',
      timestamp: platformTimestamp(transaction.timestamp, 'DashScan transaction timestamp'),
      inputAddresses: inputs
        .map((value) => platformRecord(value, 'DashScan transaction input').address)
        .filter((address): address is string => typeof address === 'string'),
      assetLockCreditOutputs: outputs.map((value) => {
        const output = platformRecord(value, 'DashScan asset-lock credit output');
        const script = typeof output.script === 'string' ? output.script : '';
        const match = /OP_HASH160 OP_PUSHBYTES_20 ([0-9a-f]{40}) OP_EQUALVERIFY/u.exec(script);
        if (match?.[1] === undefined)
          throw new Error('DashScan asset-lock payload contained an unsupported credit script.');
        return {
          amount: platformDecimal(output.satoshis, 'DashScan asset-lock output amount in duffs'),
          publicKeyHash: match[1],
        };
      }),
    };
  }
}
