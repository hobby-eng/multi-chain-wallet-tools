import { getEthereumHistory } from './history.js';
import { MAX_BIP32_INDEX, assertIndex, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { assertValidMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { bytesToHex, secp256k1, wipe } from '@ckd/core/crypto.js';
import { ethereumAddressFromPublicKey } from '@ckd/coins/ethereum/index.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_EVM_ACCOUNT_BATCH, type EvmAccountBatchView, type EvmAccountView } from '../../network-protocol.js';
import { SecretEgressGuard } from '../../secret-guard.js';
import type {
  RecoveryCoinAdapter,
  RecoveryFinding,
  RecoveryScanConfig,
  RecoverySection,
  RecoverySeedInput,
  RecoveryWalletResult,
} from '../../types.js';
import { parseCustomPathTemplate } from '../custom-path.js';
import { extendAddressTarget } from '../dash/util.js';
import { ETHEREUM_VERSIONS, formatEther } from './shared.js';
import { detectEthereumWatchOnly, scanEthereumWatchOnly } from './watch-only.js';

interface EthereumPathProfile {
  id: string;
  label: string;
  path(index: number): string;
  maximumCount: number;
}


function validateBatch(value: EvmAccountBatchView, expected: readonly string[]): EvmAccountBatchView {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value.blockNumber)
    || !Array.isArray(value.entries)
    || value.entries.length !== expected.length) {
    throw new Error('Ethereum RPC returned an incomplete account batch.');
  }
  value.entries.forEach((entry, index) => {
    if (entry.address !== expected[index]
      || !/^(?:0|[1-9][0-9]*)$/u.test(entry.balance)
      || !/^(?:0|[1-9][0-9]*)$/u.test(entry.nonce)) {
      throw new Error('Ethereum RPC returned malformed account data.');
    }
  });
  return value;
}

function customPathProfile(templateValue: string): EthereumPathProfile {
  const parsed = parseCustomPathTemplate(templateValue);
  return {
    id: 'custom',
    label: 'Custom EVM path',
    path: parsed.path,
    maximumCount: MAX_BIP32_INDEX + 1,
  };
}

function pathProfiles(config: RecoveryScanConfig): EthereumPathProfile[] {
  const profiles: EthereumPathProfile[] = [
    {
      id: 'standard',
      label: 'Standard BIP44 · MetaMask / Trezor',
      path: (index) => `m/44'/60'/${config.account}'/0/${index}`,
      maximumCount: MAX_BIP32_INDEX + 1,
    },
    {
      id: 'ledger-live',
      label: 'Ledger Live accounts',
      path: (index) => `m/44'/60'/${config.account + index}'/0/0`,
      maximumCount: MAX_BIP32_INDEX - config.account + 1,
    },
    {
      id: 'ledger-legacy',
      label: 'Legacy Ledger / MEW',
      path: (index) => `m/44'/60'/0'/${index}`,
      maximumCount: MAX_BIP32_INDEX + 1,
    },
  ];
  if (config.scanCustomPath === true) {
    if (config.customPathFormat !== 'eoa') throw new Error('Ethereum custom paths require the EOA address format.');
    profiles.push(customPathProfile(config.customPathTemplate ?? ''));
  }
  return profiles;
}

function deriveAddress(
  root: ReturnType<typeof rootFromSeed>,
  path: string,
): string {
  const child = root.derive(path);
  const compressed = requirePublic(child, path);
  const uncompressed = secp256k1.Point.fromHex(bytesToHex(compressed)).toBytes(false);
  try {
    return ethereumAddressFromPublicKey(uncompressed).checksummed;
  } finally {
    wipe(compressed, uncompressed);
    child.wipePrivateData();
  }
}

async function scanEthereum(
  input: RecoverySeedInput,
  config: RecoveryScanConfig,
  context: Parameters<RecoveryCoinAdapter['scan']>[2],
): Promise<RecoveryWalletResult> {
  assertIndex(config.account, 'Account');
  if (!Number.isSafeInteger(config.coreReceiveCount)
    || config.coreReceiveCount < 1
    || config.coreReceiveCount > MAX_BIP32_INDEX + 1) {
    throw new Error(`Ethereum address minimum must be within 1–${MAX_BIP32_INDEX + 1}.`);
  }
  if (config.scanCustomPath === true
    && (!Number.isSafeInteger(config.customPathCount) || (config.customPathCount ?? 0) < 1)) {
    throw new Error('Custom path address minimum must be at least 1.');
  }
  const profiles = pathProfiles(config);
  if (profiles.some(({ id, maximumCount }) => (id === 'custom' ? config.customPathCount ?? 0 : config.coreReceiveCount) > maximumCount)) {
    throw new Error('The requested Ethereum scan range exceeds the BIP32 index space.');
  }
  const mnemonic = assertValidMnemonic(input.mnemonic);
  const seed = mnemonicToSeed(mnemonic, input.passphrase);
  const guard = new SecretEgressGuard();
  guard.registerString('BIP39 mnemonic', mnemonic);
  guard.registerString('BIP39 passphrase', input.passphrase);
  guard.registerBytes('BIP39 seed', seed);
  context.sessionSecretGuard?.registerString('BIP39 mnemonic', mnemonic);
  context.sessionSecretGuard?.registerString('BIP39 passphrase', input.passphrase);
  context.sessionSecretGuard?.registerBytes('BIP39 seed', seed);
  const gateway = new RecoveryNetworkGateway(
    guard,
    context.networkApi,
    context.networkLimiter ?? new RecoveryConcurrencyLimiter(5),
  );
  const root = rootFromSeed(seed, ETHEREUM_VERSIONS);
  const findings: RecoveryFinding[] = [];
  const findingsByAddress = new Map<string, RecoveryFinding>();
  const accountStates = new Map<string, EvmAccountView>();
  let totalBalance = 0n;
  let fundedCount = 0;
  let usedCount = 0;
  let scanned = 0;
  let firstBlock: bigint | null = null;
  let lastBlock: bigint | null = null;
  const startedAt = new Date().toISOString();
  try {
    for (const profile of profiles) {
      let target = profile.id === 'custom' ? (config.customPathCount ?? 0) : config.coreReceiveCount;
      for (let offset = 0; offset < target;) {
        if (context.signal.aborted) throw new DOMException('Ethereum scan cancelled.', 'AbortError');
        const end = Math.min(offset + RECOVERY_EVM_ACCOUNT_BATCH, target);
        const derived = Array.from({ length: end - offset }, (_, relativeIndex) => {
          const index = offset + relativeIndex;
          const path = profile.path(index);
          return { address: deriveAddress(root, path), index, path };
        });
        const missing = derived.filter(({ address }) => !accountStates.has(address.toLowerCase()));
        if (missing.length > 0) {
          const addresses = missing.map(({ address }) => address);
          const response = validateBatch(await gateway.runPublic(
            { network: config.network, addresses },
            'evm.accounts',
            () => gateway.networkApi.evmAccounts(config.network, addresses, context.signal),
            context.signal,
          ), addresses);
          const block = BigInt(response.blockNumber);
          firstBlock = firstBlock === null || block < firstBlock ? block : firstBlock;
          lastBlock = lastBlock === null || block > lastBlock ? block : lastBlock;
          for (const entry of response.entries) {
            const addressKey = entry.address.toLowerCase();
            accountStates.set(addressKey, entry);
            const balance = BigInt(entry.balance);
            const nonce = BigInt(entry.nonce);
            if (balance > 0n) fundedCount += 1;
            if (balance > 0n || nonce > 0n) usedCount += 1;
            totalBalance += balance;
          }
        }
        for (const item of derived) {
          const entry = accountStates.get(item.address.toLowerCase());
          if (entry === undefined) throw new Error('Ethereum account state cache omitted a derived address.');
          const balance = BigInt(entry.balance);
          const nonce = BigInt(entry.nonce);
          const used = balance > 0n || nonce > 0n;
          if (used) {
            target = Math.min(profile.maximumCount, extendAddressTarget(target, item.index).target);
          }
          if (balance > 0n || (config.includeUsedZeroBalance && used)) {
            const existing = findingsByAddress.get(item.address.toLowerCase());
            if (existing !== undefined) {
              if (!existing.fields.some(({ value }) => value === item.path)) {
                existing.fields.push({ label: 'Alternate derivation path', value: item.path, copyable: true });
              }
              continue;
            }
            const finding: RecoveryFinding = {
              id: `ethereum:${profile.id}:${item.index}`,
              title: item.address,
              subtitle: `${profile.label} · index ${item.index}`,
              balanceAtomic: balance,
              balanceLabel: formatEther(balance),
              fields: [
                { label: 'Scan profile', value: profile.label },
                { label: 'Derivation path', value: item.path, copyable: true },
                { label: 'Profile index', value: String(item.index) },
                { label: 'Transactions sent / nonce', value: nonce.toString() },
              ],
            };
            findingsByAddress.set(item.address.toLowerCase(), finding);
            findings.push(finding);
            context.onFinding(input.id, 'core', finding);
          }
        }
        scanned += derived.length;
        offset = end;
        context.onProgress({
          inputId: input.id,
          section: 'core',
          message: `${profile.label}: checked ${offset} of ${target} derivation candidates`,
          completed: scanned,
          total: null,
        });
      }
    }
    const section: RecoverySection = {
      id: 'core',
      title: 'Ethereum EOA addresses',
      description: `Scans ${profiles.map(({ label }) => label).join(', ')} through independent 20-address post-use gaps.`,
      state: 'complete',
      metrics: [
        { label: 'Spendable balance', value: formatEther(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
        { label: 'Funded addresses', value: String(fundedCount) },
        { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
        { label: 'Unique addresses queried', value: String(accountStates.size) },
        { label: 'Derivation candidates', value: String(scanned) },
      ],
      findings,
      scanned,
      source: config.network === 'mainnet' ? 'https://ethereum-rpc.publicnode.com' : 'https://ethereum-sepolia-rpc.publicnode.com',
      proof: `${config.network === 'mainnet' ? 'Ethereum mainnet' : 'Sepolia testnet'} JSON-RPC account batches at heights ${firstBlock ?? 'unavailable'}–${lastBlock ?? 'unavailable'} · independent 20-address post-use gaps`,
      warning: 'Each account batch uses an explicit block height; different batches may use different heights. This is a single-source public RPC view, without a block-hash snapshot across reorganizations. ERC-20 token balances and contract-wallet ownership are not scanned.',
    };
    return {
      inputId: input.id,
      label: input.label,
      coinId: 'ethereum',
      coinLabel: 'Ethereum',
      network: config.network,
      startedAt,
      completedAt: new Date().toISOString(),
      overview: [
        { label: 'Total located value', value: formatEther(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
        { label: 'Funded accounts', value: String(fundedCount), tone: fundedCount > 0 ? 'positive' : 'neutral' },
        { label: 'Used accounts', value: String(usedCount) },
        { label: 'Path profiles', value: String(profiles.length) },
        { label: 'Unique addresses queried', value: String(accountStates.size) },
      ],
      sections: [section],
      warnings: ['Only native ETH in mnemonic-derived EOAs is scanned; tokens and smart-contract wallets require separate recovery tooling.'],
    };
  } finally {
    root.wipePrivateData();
    wipe(seed);
    guard.clear();
  }
}

export const ETHEREUM_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  id: 'ethereum',
  amountUnit: () => ({ asset: 'ETH', atomicUnit: 'wei', decimals: 18 }),
  getHistory: getEthereumHistory,
  label: 'Ethereum',
  networks: ['mainnet', 'testnet'],
  customPath: {
    description: 'Optional; three standard profiles stay enabled.',
    placeholder: "m/44'/60'/7'/0/{index}",
    formats: [{ id: 'eoa', label: 'Ethereum EOA · EIP-55' }],
  },
  scan: scanEthereum,
  detectWatchOnly: detectEthereumWatchOnly,
  scanWatchOnly: scanEthereumWatchOnly,
};
