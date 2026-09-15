import { EVM_RPC_QUANTITY } from '@ckd/core/numeric-limits.js';
import { normalizeEthereumAddress } from './address-normalization.js';
import { ethereumAddressHistory } from './history.js';
import { fetchJson, record } from './http.js';
import {
  RECOVERY_EVM_ACCOUNT_BATCH,
  type EvmAccountBatchView,
  type PublicDataNetwork,
  type RecoveryHistory,
} from './types.js';

const ETHEREUM_ENDPOINTS: Record<PublicDataNetwork, string> = {
  mainnet: 'https://ethereum-rpc.publicnode.com',
  testnet: 'https://ethereum-sepolia-rpc.publicnode.com',
};

export class EthereumPublicDataService {
  async addressHistory(network: PublicDataNetwork, address: string, signal?: AbortSignal): Promise<RecoveryHistory> {
    if (network !== 'mainnet' && network !== 'testnet')
      throw new Error('Network Worker rejected an unsupported network.');
    normalizeEthereumAddress(address);
    return ethereumAddressHistory(
      address,
      network,
      AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]),
    );
  }

  async evmAccounts(
    network: PublicDataNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<EvmAccountBatchView> {
    if (network !== 'mainnet' && network !== 'testnet')
      throw new Error('Network Worker rejected an unsupported network.');
    if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > RECOVERY_EVM_ACCOUNT_BATCH)
      throw new Error(`Network Worker requires 1 to ${RECOVERY_EVM_ACCOUNT_BATCH} Ethereum addresses per request.`);
    addresses.forEach(normalizeEthereumAddress);
    const head = record(
      await fetchJson(ETHEREUM_ENDPOINTS[network], signal, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'block', method: 'eth_blockNumber', params: [] }),
      }),
      'Ethereum block response',
    );
    if (
      head.error !== undefined ||
      head.id !== 'block' ||
      typeof head.result !== 'string' ||
      !EVM_RPC_QUANTITY.test(head.result)
    )
      throw new Error('Ethereum RPC returned an invalid block number.');
    const blockNumber = head.result;
    const requests = addresses.flatMap((address, index) => [
      { jsonrpc: '2.0', id: `balance:${index}`, method: 'eth_getBalance', params: [address, blockNumber] },
      { jsonrpc: '2.0', id: `nonce:${index}`, method: 'eth_getTransactionCount', params: [address, blockNumber] },
    ]);
    const raw = await fetchJson(ETHEREUM_ENDPOINTS[network], signal, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requests),
    });
    if (!Array.isArray(raw) || raw.length !== requests.length)
      throw new Error('Ethereum RPC returned an incomplete batch.');
    const results = new Map<string, string>();
    for (const item of raw) {
      const response = record(item, 'Ethereum RPC response');
      if (
        response.error !== undefined ||
        typeof response.id !== 'string' ||
        typeof response.result !== 'string' ||
        !EVM_RPC_QUANTITY.test(response.result)
      )
        throw new Error('Ethereum RPC returned a malformed or failed response.');
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
