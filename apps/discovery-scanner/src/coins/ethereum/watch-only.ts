import { isUint256Decimal } from '@ckd/core/numeric-limits.js';
import { HDKey } from '@scure/bip32';
import { bytesToHex, secp256k1, wipe } from '@ckd/core/crypto.js';
import { ethereumAddressFromPublicKey } from '@ckd/coins/ethereum/index.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_EVM_ACCOUNT_BATCH, type EvmAccountView } from '../../network-protocol.js';
import { SecretEgressGuard } from '../../secret-guard.js';
import type {
  DetectedWatchOnlyMaterial,
  RecoveryFinding,
  RecoveryScanContext,
  RecoverySection,
  RecoveryWalletResult,
  RecoveryWatchOnlyInput,
  RecoveryWatchOnlyScanConfig,
} from '../../types.js';
import {
  foreignPrefixCoin,
  looksLikeExtendedPublicKey,
  looksLikeSec1PublicKey,
  matchExplicitPrefix,
  normalizedHexKey,
  WatchOnlyNotRecognizedError,
} from '../../watch-only.js';
import { extendAddressTarget } from '../dash/util.js';
import { ETHEREUM_VERSIONS, formatEther } from './shared.js';

export function detectEthereumWatchOnly(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial {
  const trimmed = raw.trim();
  const matched = matchExplicitPrefix(trimmed);
  if (matched !== null) {
    if (matched.prefix === 'ethereum-xpub') {
      if (matched.value.length === 0) throw new Error('ethereum-xpub: requires a value.');
      return { coinId: 'ethereum', kind: 'ethereum-xpub', value: matched.value };
    }
    if (matched.prefix === 'public-key') {
      if (matched.value.length === 0) throw new Error('public-key: requires a value.');
      return { coinId: 'ethereum', kind: 'public-key', value: normalizedHexKey(matched.value) };
    }
    const conflict = foreignPrefixCoin(trimmed, 'ethereum');
    if (conflict !== null) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      throw new Error(`"${matched.prefix}:" belongs to ${conflict}, not Ethereum. Remove the prefix or select ${conflict === 'dash' ? 'Dash' : 'Bitcoin'}.`);
    }
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    throw new Error(`Unrecognized prefix "${matched.prefix}:".`);
  }
  if (looksLikeExtendedPublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'ethereum', kind: 'ethereum-xpub', value: trimmed, detectionLabel: 'Ethereum EOA · candidate BIP32 key' };
  }
  if (looksLikeSec1PublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'ethereum', kind: 'public-key', value: normalizedHexKey(trimmed) };
  }
  throw new WatchOnlyNotRecognizedError();
}

function addressForNode(node: HDKey): string {
  const compressed = node.publicKey;
  if (compressed === null) throw new Error('Watch-only derivation unexpectedly produced no public key.');
  const uncompressed = secp256k1.Point.fromHex(bytesToHex(compressed)).toBytes(false);
  try {
    return ethereumAddressFromPublicKey(uncompressed).checksummed;
  } finally {
    wipe(uncompressed);
  }
}

interface EthCandidateProfile {
  id: string;
  label: string;
  path: string;
  deriveChild(index: number): HDKey;
}

async function queryAccounts(
  gateway: RecoveryNetworkGateway,
  networkName: RecoveryWatchOnlyScanConfig['network'],
  addresses: readonly string[],
  signal: AbortSignal,
): Promise<{ entries: EvmAccountView[]; blockNumber: bigint }> {
  if (addresses.length === 0) return { entries: [], blockNumber: 0n };
  const response = await gateway.runPublic(
    { network: networkName, addresses },
    'evm.accounts',
    () => gateway.networkApi.evmAccounts(networkName, [...addresses], signal),
    signal,
  );
  if (!isUint256Decimal(response.blockNumber) || !Array.isArray(response.entries) || response.entries.length !== addresses.length) {
    throw new Error('Ethereum RPC returned an incomplete account batch.');
  }
  response.entries.forEach((entry, index) => {
    if (entry.address !== addresses[index] || !isUint256Decimal(entry.balance) || !isUint256Decimal(entry.nonce)) {
      throw new Error('Ethereum RPC returned malformed account data.');
    }
  });
  return { entries: response.entries, blockNumber: BigInt(response.blockNumber) };
}

export async function scanEthereumWatchOnly(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
): Promise<RecoveryWalletResult> {
  if (!Number.isSafeInteger(config.minimumCount) || config.minimumCount < 1) {
    throw new Error('The watch-only address minimum must be a positive integer.');
  }
  const guard = new SecretEgressGuard();
  if (input.kind !== 'public-key' && input.kind !== 'identity') {
    guard.registerString('Ethereum watch-only input', input.value);
    context.sessionSecretGuard?.registerString('Ethereum watch-only input', input.value);
  }
  const gateway = new RecoveryNetworkGateway(guard, context.networkApi, context.networkLimiter ?? new RecoveryConcurrencyLimiter(5));
  const startedAt = new Date().toISOString();
  const findings: RecoveryFinding[] = [];
  const accountStates = new Map<string, EvmAccountView>();
  let blockNumber = 0n;
  let scanned = 0;
  let gapTruncated = false;
  let descriptionText: string;

  const recordFinding = (address: string, path: string, label: string, entry: EvmAccountView): void => {
    const balance = BigInt(entry.balance);
    const nonce = BigInt(entry.nonce);
    const used = balance > 0n || nonce > 0n;
    if (balance === 0n && !(config.includeUsedZeroBalance && used)) return;
    const finding: RecoveryFinding = {
      id: `ethereum:watch:${address}`,
      title: address,
      subtitle: label,
      balanceAtomic: balance,
      balanceLabel: formatEther(balance),
      fields: [
        { label: 'Scan profile', value: label },
        { label: 'Relative derivation path', value: path, copyable: true },
        { label: 'Transactions sent / nonce', value: nonce.toString() },
      ],
    };
    findings.push(finding);
    context.onFinding(input.id, 'core', finding);
  };

  if (input.kind === 'public-key') {
    let point: ReturnType<typeof secp256k1.Point.fromHex>;
    try {
      point = secp256k1.Point.fromHex(input.value);
    } catch {
      throw new Error('This public key is not a valid point on the secp256k1 curve.');
    }
    const uncompressed = point.toBytes(false);
    let address: string;
    try {
      address = ethereumAddressFromPublicKey(uncompressed).checksummed;
    } finally {
      wipe(uncompressed);
    }
    const { entries, blockNumber: block } = await queryAccounts(gateway, config.network, [address], context.signal);
    blockNumber = block;
    const entry = entries[0];
    if (entry === undefined) throw new Error('Ethereum RPC omitted the requested account.');
    accountStates.set(address, entry);
    recordFinding(address, 'exact public key', 'Exact public key · EOA', entry);
    scanned = 1;
    descriptionText = 'A single public key maps to exactly one EOA; it cannot derive descendant addresses.';
  } else {
    let node: HDKey;
    try {
      node = HDKey.fromExtendedKey(input.value, ETHEREUM_VERSIONS);
    } catch {
      throw new Error('This extended public key is malformed or does not match the expected Ethereum version bytes.');
    }
    if (node.depth === 0) {
      throw new Error(
        'This is the root/master extended public key. It sits above the hardened BIP44 account level and cannot derive standard wallet addresses. Copy the account xpub instead.',
      );
    }
    if (node.depth === 5) {
      const address = addressForNode(node);
      const { entries, blockNumber: block } = await queryAccounts(gateway, config.network, [address], context.signal);
      blockNumber = block;
      const entry = entries[0];
      if (entry === undefined) throw new Error('Ethereum RPC omitted the requested account.');
      accountStates.set(address, entry);
      recordFinding(address, 'exact leaf key', 'Exact leaf public key · EOA', entry);
      scanned = 1;
      descriptionText = 'A depth-5 leaf extended public key is already one exact account key; it cannot derive further descendants.';
    } else if (node.depth === 3 || node.depth === 4) {
      const profiles: EthCandidateProfile[] = node.depth === 4
        ? [{ id: 'branch', label: 'Branch xpub · relative /i', path: '<branch xpub>/i', deriveChild: (index) => node.deriveChild(index) }]
        : [
            { id: 'standard', label: 'Account xpub · relative /0/i · standard receive chain', path: '<account xpub>/0/i', deriveChild: (index) => node.deriveChild(0).deriveChild(index) },
            { id: 'legacy', label: 'Account xpub · relative /i · legacy Ledger/MEW', path: '<account xpub>/i', deriveChild: (index) => node.deriveChild(index) },
          ];
      for (const profile of profiles) {
        let target = config.minimumCount;
        for (let offset = 0; offset < target;) {
          if (context.signal.aborted) throw new DOMException('Ethereum watch-only scan cancelled.', 'AbortError');
          const end = Math.min(offset + RECOVERY_EVM_ACCOUNT_BATCH, target);
          const derived = Array.from({ length: end - offset }, (_, relativeIndex) => {
            const index = offset + relativeIndex;
            return { address: addressForNode(profile.deriveChild(index)), index, path: profile.path.replace('i', String(index)) };
          });
          const missing = derived.filter(({ address }) => !accountStates.has(address.toLowerCase()));
          if (missing.length > 0) {
            const { entries, blockNumber: block } = await queryAccounts(gateway, config.network, missing.map(({ address }) => address), context.signal);
            blockNumber = block;
            for (const entry of entries) accountStates.set(entry.address.toLowerCase(), entry);
          }
          for (const item of derived) {
            const entry = accountStates.get(item.address.toLowerCase());
            if (entry === undefined) throw new Error('Ethereum watch-only account cache omitted a derived address.');
            const balance = BigInt(entry.balance);
            const nonce = BigInt(entry.nonce);
            if (balance > 0n || nonce > 0n) {
              const extension = extendAddressTarget(target, item.index);
              target = extension.target;
              gapTruncated ||= extension.truncated;
            }
            recordFinding(item.address, item.path, profile.label, entry);
          }
          scanned += derived.length;
          offset = end;
          context.onProgress({
            inputId: input.id,
            section: 'core',
            message: `${profile.label}: checked ${offset} of ${target}`,
            completed: scanned,
            total: null,
          });
        }
      }
      descriptionText = node.depth === 4
        ? 'Depth-4 branch extended public key: scanning its relative /i indices.'
        : 'Depth-3 account extended public key: scanning the standard /0/i receive chain and the legacy Ledger/MEW /i chain.';
    } else {
      throw new Error(`This extended public key has depth ${node.depth}. Only an account xpub (depth 3), a branch xpub (depth 4), or a leaf xpub (depth 5) can be scanned.`);
    }
  }

  let totalBalance = 0n;
  let fundedCount = 0;
  let usedCount = 0;
  for (const entry of accountStates.values()) {
    const balance = BigInt(entry.balance);
    const nonce = BigInt(entry.nonce);
    totalBalance += balance;
    if (balance > 0n) fundedCount += 1;
    if (balance > 0n || nonce > 0n) usedCount += 1;
  }
  const section: RecoverySection = {
    id: 'core',
    title: 'Ethereum watch-only EOA addresses',
    description: descriptionText,
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
    proof: `${config.network === 'mainnet' ? 'Ethereum mainnet' : 'Sepolia testnet'} JSON-RPC state at block ${blockNumber}`,
    ...(gapTruncated ? { warning: 'A used address was found too close to the end of the BIP32 index space to complete the post-use gap.' } : {}),
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
      { label: 'Unique addresses queried', value: String(accountStates.size) },
    ],
    sections: [section],
    warnings: ['Only native ETH is scanned; tokens and smart-contract wallets require separate recovery tooling.'],
  };
}
