import { PROVIDER_UNSIGNED_DECIMAL } from '@ckd/core/numeric-limits.js';
import { HDKey } from '@scure/bip32';
import { bytesToHex, secp256k1, wipe } from '@ckd/core/crypto.js';
import { getBitcoinNetwork } from '@ckd/core/networks.js';
import { descriptorChecksum } from '@ckd/export/descriptor.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_UTXO_ADDRESS_BATCH, type UtxoAddressView } from '../../network-protocol.js';
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
import { addressFor, BITCOIN_MODES, formatBitcoin, type BitcoinMode } from './shared.js';

const DESCRIPTOR_PATTERNS: ReadonlyArray<{ mode: BitcoinMode; wrappers: number; pattern: RegExp }> = [
  { mode: 'legacy', wrappers: 1, pattern: /^pkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu },
  { mode: 'nested-segwit', wrappers: 2, pattern: /^sh\(wpkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)\)#([0-9a-z]{8})$/iu },
  { mode: 'native-segwit', wrappers: 1, pattern: /^wpkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu },
  { mode: 'taproot', wrappers: 1, pattern: /^tr\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu },
];

const SLIP132_PUBLIC_VERSIONS: ReadonlyArray<{
  prefix: 'ypub' | 'zpub' | 'upub' | 'vpub';
  public: number;
  private: number;
  network: 'mainnet' | 'testnet';
  mode: 'nested-segwit' | 'native-segwit';
  label: string;
}> = [
  { prefix: 'ypub', public: 0x049d7cb2, private: 0x049d7878, network: 'mainnet', mode: 'nested-segwit', label: 'Bitcoin Nested SegWit · SLIP-132 ypub' },
  { prefix: 'zpub', public: 0x04b24746, private: 0x04b2430c, network: 'mainnet', mode: 'native-segwit', label: 'Bitcoin Native SegWit · SLIP-132 zpub' },
  { prefix: 'upub', public: 0x044a5262, private: 0x044a4e28, network: 'testnet', mode: 'nested-segwit', label: 'Bitcoin Nested SegWit testnet · SLIP-132 upub' },
  { prefix: 'vpub', public: 0x045f1cf6, private: 0x045f18bc, network: 'testnet', mode: 'native-segwit', label: 'Bitcoin Native SegWit testnet · SLIP-132 vpub' },
];

function parseSlip132(value: string): { node: HDKey; network: 'mainnet' | 'testnet'; mode: BitcoinMode; label: string } | null {
  const version = SLIP132_PUBLIC_VERSIONS.find(({ prefix }) => value.startsWith(prefix));
  if (version === undefined) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{100,120}$/u.test(value)) {
    throw new Error(`This ${version.prefix} extended public key is malformed.`);
  }
  try {
    return {
      node: HDKey.fromExtendedKey(value, { private: version.private, public: version.public }),
      network: version.network,
      mode: version.mode,
      label: version.label,
    };
  } catch {
    throw new Error(`This ${version.prefix} extended public key is malformed or has an invalid checksum.`);
  }
}

export function detectBitcoinWatchOnly(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial {
  const trimmed = raw.trim();
  const matched = matchExplicitPrefix(trimmed);
  if (matched !== null) {
    if (matched.prefix === 'bitcoin-xpub') {
      if (matched.value.length === 0) throw new Error('bitcoin-xpub: requires a value.');
      const slip132 = parseSlip132(matched.value);
      return {
        coinId: 'bitcoin', kind: 'bitcoin-xpub', value: matched.value,
        ...(slip132 === null ? {} : { detectionLabel: slip132.label, bundleNetwork: slip132.network }),
      };
    }
    if (matched.prefix === 'public-key') {
      if (matched.value.length === 0) throw new Error('public-key: requires a value.');
      return { coinId: 'bitcoin', kind: 'public-key', value: normalizedHexKey(matched.value) };
    }
    const conflict = foreignPrefixCoin(trimmed, 'bitcoin');
    if (conflict !== null) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      throw new Error(`"${matched.prefix}:" belongs to ${conflict}, not Bitcoin. Remove the prefix or select ${conflict === 'dash' ? 'Dash' : 'Ethereum'}.`);
    }
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    throw new Error(`Unrecognized prefix "${matched.prefix}:".`);
  }
  if (DESCRIPTOR_PATTERNS.some(({ pattern }) => pattern.test(trimmed))) {
    const descriptor = DESCRIPTOR_PATTERNS.find(({ pattern }) => pattern.test(trimmed))!;
    const label = BITCOIN_MODES.find(({ mode: candidate }) => candidate === descriptor.mode)?.label ?? descriptor.mode;
    return { coinId: 'bitcoin', kind: 'bitcoin-descriptor', value: trimmed, detectionLabel: `Bitcoin ${label} · exact descriptor` };
  }
  const slip132 = parseSlip132(trimmed);
  if (slip132 !== null) {
    return {
      coinId: 'bitcoin', kind: 'bitcoin-xpub', value: trimmed,
      detectionLabel: slip132.label, bundleNetwork: slip132.network,
    };
  }
  if (looksLikeExtendedPublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'bitcoin', kind: 'bitcoin-xpub', value: trimmed, detectionLabel: 'Bitcoin · candidate account formats' };
  }
  if (looksLikeSec1PublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'bitcoin', kind: 'public-key', value: normalizedHexKey(trimmed) };
  }
  throw new WatchOnlyNotRecognizedError();
}

interface CandidateProfile {
  id: string;
  label: string;
  mode: BitcoinMode;
  path: string;
  deriveChild(index: number): HDKey;
}

interface DerivedCandidate {
  address: string;
  path: string;
  index: number;
  profile: CandidateProfile;
}

function parseDescriptor(value: string, network: ReturnType<typeof getBitcoinNetwork>): {
  mode: BitcoinMode;
  fingerprint: string;
  branch: number;
  account: HDKey;
  originPath: string;
} {
  for (const { mode, pattern } of DESCRIPTOR_PATTERNS) {
    const match = pattern.exec(value);
    if (match === null) continue;
    const [fingerprint, originSuffix, xpub, branchText, checksum] = match.slice(1);
    const withoutChecksum = value.slice(0, value.length - 9); // strip "#checksum" (1 + 8 chars)
    const expected = descriptorChecksum(withoutChecksum);
    if (expected !== checksum) {
      throw new Error('This descriptor\'s BIP380 checksum does not match its content; it may have been altered or mistyped.');
    }
    let account: HDKey;
    try {
      account = HDKey.fromExtendedKey(xpub!, network.versions);
    } catch {
      throw new Error(`The descriptor's xpub does not match the selected ${network.label} version bytes. Select the matching network.`);
    }
    if (account.depth !== 3) {
      throw new Error(`The descriptor's embedded xpub has depth ${account.depth}, but a standard account xpub has depth 3.`);
    }
    const branch = Number(branchText);
    if (branch !== 0 && branch !== 1) throw new Error('The descriptor branch must be 0 (receive) or 1 (change).');
    return { mode, fingerprint: fingerprint!, branch, account, originPath: `[${fingerprint}${originSuffix}]` };
  }
  throw new Error('This descriptor did not match a supported pkh(), sh(wpkh()), wpkh(), or tr() shape with a checksummed [fingerprint/path]xpub/branch/* body.');
}

function parseBareXpub(value: string, network: ReturnType<typeof getBitcoinNetwork>): { node: HDKey; encodedMode: BitcoinMode | null } {
  const slip132 = parseSlip132(value);
  if (slip132 !== null) {
    if (slip132.network !== network.name) {
      throw new Error(`This ${value.slice(0, 4)} key encodes ${slip132.network}, but ${network.name} is selected.`);
    }
    if (slip132.node.depth === 0) {
      throw new Error('This is a root/master extended public key and cannot derive a standard wallet account.');
    }
    if (slip132.node.depth !== 3 && slip132.node.depth !== 4) {
      throw new Error(`This extended public key has depth ${slip132.node.depth}. Only an account key (depth 3) or branch key (depth 4) can be scanned.`);
    }
    return { node: slip132.node, encodedMode: slip132.mode };
  }
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(value, network.versions);
  } catch {
    throw new Error(`This extended public key does not match the selected ${network.label} version bytes, or is malformed. Select the matching network, or check the value.`);
  }
  if (node.depth === 0) {
    throw new Error(
      'This is the root/master extended public key. It sits above every hardened BIP44/49/84/86 account level and cannot derive standard wallet addresses. Copy the Account xpub for the address format you want to scan instead.',
    );
  }
  if (node.depth !== 3 && node.depth !== 4) {
    throw new Error(`This extended public key has depth ${node.depth}. Only an account xpub (depth 3) or a branch xpub (depth 4) can be scanned for descendant addresses.`);
  }
  return { node, encodedMode: null };
}

function candidateProfiles(node: HDKey, encodedMode: BitcoinMode | null = null): CandidateProfile[] {
  const modes = encodedMode === null
    ? BITCOIN_MODES
    : BITCOIN_MODES.filter(({ mode }) => mode === encodedMode);
  if (node.depth === 4) {
    return modes.map(({ mode, label }) => ({
      id: `${mode}:branch`,
      label: `${label}${encodedMode === null ? ' · candidate format' : ' · encoded format'}`,
      mode,
      path: '<branch xpub>/i',
      deriveChild: (index: number) => node.deriveChild(index),
    }));
  }
  return modes.flatMap(({ mode, label }) => ([0, 1] as const).map((branch) => ({
    id: `${mode}:${branch}`,
    label: `${label} · ${encodedMode === null ? 'candidate' : 'encoded'} format · ${branch === 0 ? 'receive/external' : 'change/internal'}`,
    mode,
    path: `<account xpub>/${branch}/i`,
    deriveChild: (index: number) => node.deriveChild(branch).deriveChild(index),
  })));
}

async function queryAddresses(
  gateway: RecoveryNetworkGateway,
  networkName: RecoveryWatchOnlyScanConfig['network'],
  addresses: readonly string[],
  signal: AbortSignal,
): Promise<UtxoAddressView[]> {
  if (addresses.length === 0) return [];
  const value = await gateway.runPublic(
    { network: networkName, addresses },
    'utxo.addresses',
    () => gateway.networkApi.utxoAddresses(networkName, [...addresses], signal),
    signal,
  );
  if (!Array.isArray(value) || value.length !== addresses.length) {
    throw new Error('Bitcoin address service returned an incomplete batch.');
  }
  return value.map((entry, index) => {
    if (entry.address !== addresses[index]
      || !PROVIDER_UNSIGNED_DECIMAL.test(entry.balance)
      || !Number.isSafeInteger(entry.transactionCount)
      || entry.transactionCount < 0) {
      throw new Error('Bitcoin address service returned malformed data.');
    }
    return entry;
  });
}

function buildResult(
  input: RecoveryWatchOnlyInput,
  description: string,
  findings: RecoveryFinding[],
  addressStates: ReadonlyMap<string, UtxoAddressView>,
  scanned: number,
  config: RecoveryWatchOnlyScanConfig,
  warning: string | undefined,
  startedAt: string,
): RecoveryWalletResult {
  let totalBalance = 0n;
  let fundedCount = 0;
  let usedCount = 0;
  for (const entry of addressStates.values()) {
    const balance = BigInt(entry.balance);
    totalBalance += balance;
    if (balance > 0n) fundedCount += 1;
    if (balance > 0n || entry.transactionCount > 0) usedCount += 1;
  }
  const section: RecoverySection = {
    id: 'core',
    title: 'Bitcoin watch-only addresses',
    description,
    state: 'complete',
    metrics: [
      { label: 'Spendable balance', value: formatBitcoin(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
      { label: 'Unique addresses queried', value: String(addressStates.size) },
      { label: 'Derivation candidates', value: String(scanned) },
    ],
    findings,
    scanned,
    source: config.network === 'mainnet'
      ? 'https://blockchain.info · fallbacks https://api.blockcypher.com, https://blockstream.info, and https://mempool.space'
      : 'https://api.blockcypher.com · fallbacks https://blockstream.info/testnet and https://mempool.space/testnet',
    proof: 'Indexed Bitcoin chain and mempool state · batch lookup where available · bounded retry with provider failover',
    ...(warning === undefined ? {} : { warning }),
  };
  return {
    inputId: input.id,
    label: input.label,
    coinId: 'bitcoin',
    coinLabel: 'Bitcoin',
    network: config.network,
    startedAt,
    completedAt: new Date().toISOString(),
    overview: [
      { label: 'Total located value', value: formatBitcoin(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount), tone: fundedCount > 0 ? 'positive' : 'neutral' },
      { label: 'Unique addresses queried', value: String(addressStates.size) },
    ],
    sections: [section],
    warnings: ['Independently verify every funded address in a standard Bitcoin wallet before treating a balance as spendable.'],
  };
}

export async function scanBitcoinWatchOnly(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
): Promise<RecoveryWalletResult> {
  if (!Number.isSafeInteger(config.minimumCount) || config.minimumCount < 1) {
    throw new Error('The watch-only address minimum must be a positive integer.');
  }
  const guard = new SecretEgressGuard();
  if (input.kind !== 'public-key' && input.kind !== 'identity') {
    guard.registerString('Bitcoin watch-only input', input.value);
    context.sessionSecretGuard?.registerString('Bitcoin watch-only input', input.value);
  }
  const gateway = new RecoveryNetworkGateway(guard, context.networkApi, context.networkLimiter ?? new RecoveryConcurrencyLimiter(5));
  const network = getBitcoinNetwork(config.network);
  const startedAt = new Date().toISOString();

  if (input.kind === 'public-key') {
    let point: ReturnType<typeof secp256k1.Point.fromHex>;
    try {
      point = secp256k1.Point.fromHex(input.value);
    } catch {
      throw new Error('This public key is not a valid point on the secp256k1 curve.');
    }
    const compressed = point.toBytes(true);
    const uncompressed = point.toBytes(false);
    try {
      const addressStates = new Map<string, UtxoAddressView>();
      const findings: RecoveryFinding[] = [];
      const candidates: Array<{ address: string; label: string; fields: Array<{ label: string; value: string; copyable?: boolean }> }> = [];
      candidates.push({
        address: addressFor('legacy', compressed, network),
        label: 'Legacy P2PKH · compressed key',
        fields: [{ label: 'Public key', value: bytesToHex(compressed), copyable: true }],
      });
      candidates.push({
        address: addressFor('legacy', uncompressed, network),
        label: 'Legacy P2PKH · uncompressed key',
        fields: [{ label: 'Public key', value: bytesToHex(uncompressed), copyable: true }],
      });
      candidates.push({ address: addressFor('nested-segwit', compressed, network), label: 'Nested SegWit · P2SH-P2WPKH', fields: [] });
      candidates.push({ address: addressFor('native-segwit', compressed, network), label: 'Native SegWit · P2WPKH', fields: [] });
      candidates.push({ address: addressFor('taproot', compressed, network), label: 'Taproot · P2TR', fields: [] });
      const uniqueAddresses = [...new Set(candidates.map((candidate) => candidate.address))];
      const entries = await queryAddresses(gateway, config.network, uniqueAddresses, context.signal);
      for (const entry of entries) addressStates.set(entry.address, entry);
      const seenAddress = new Set<string>();
      for (const candidate of candidates) {
        if (seenAddress.has(candidate.address)) continue;
        seenAddress.add(candidate.address);
        const entry = addressStates.get(candidate.address);
        if (entry === undefined) continue;
        const balance = BigInt(entry.balance);
        const used = balance > 0n || entry.transactionCount > 0;
        if (balance === 0n && !(config.includeUsedZeroBalance && used)) continue;
        const finding: RecoveryFinding = {
          id: `bitcoin:public-key:${candidate.address}`,
          title: candidate.address,
          subtitle: candidate.label,
          balanceAtomic: balance,
          balanceLabel: formatBitcoin(balance),
          fields: [{ label: 'Address type', value: candidate.label }, ...candidate.fields, { label: 'Transactions reported', value: String(entry.transactionCount) }],
        };
        findings.push(finding);
        context.onFinding(input.id, 'core', finding);
      }
      return buildResult(
        input,
        'A single public key can only be checked exactly, at every address encoding it maps to; it cannot derive descendant addresses.',
        findings,
        addressStates,
        candidates.length,
        config,
        undefined,
        startedAt,
      );
    } finally {
      wipe(compressed, uncompressed);
    }
  }

  const { account, branch, mode: descriptorMode, node, description } = (() => {
    if (input.kind === 'bitcoin-descriptor') {
      const parsed = parseDescriptor(input.value, network);
      return {
        account: parsed.account,
        branch: parsed.branch,
        mode: parsed.mode,
        node: parsed.account,
        description: `Checksummed BIP380 descriptor · ${parsed.originPath}/${parsed.branch}/* · exact ${BITCOIN_MODES.find(({ mode: candidateMode }) => candidateMode === parsed.mode)?.label ?? parsed.mode} script type.`,
      };
    }
    const parsed = parseBareXpub(input.value, network);
    const encodedLabel = parsed.encodedMode === null
      ? null
      : BITCOIN_MODES.find(({ mode }) => mode === parsed.encodedMode)?.label ?? parsed.encodedMode;
    return {
      account: parsed.node,
      branch: null,
      mode: parsed.encodedMode,
      node: parsed.node,
      description: encodedLabel !== null
        ? `${input.value.slice(0, 4)} encodes the ${encodedLabel} script family; only that family is scanned${parsed.node.depth === 3 ? ' on receive and change branches' : ' on this branch'}.`
        : parsed.node.depth === 4
          ? 'Bare branch (depth-4) extended public key: no purpose metadata is present, so every standard script-type candidate is scanned at each index and clearly labeled as a candidate, not a confirmed format.'
          : 'Bare account (depth-3) extended public key: no purpose metadata is present, so every standard script-type candidate is scanned on both branches and clearly labeled as a candidate, not a confirmed format.',
    };
  })();
  try {
    const profiles = input.kind === 'bitcoin-descriptor'
      ? [{
          id: `${descriptorMode}:${branch}`,
          label: `${BITCOIN_MODES.find(({ mode: candidateMode }) => candidateMode === descriptorMode)?.label ?? descriptorMode} · branch ${branch}`,
          mode: descriptorMode!,
          path: `descriptor/${branch}/i`,
          deriveChild: (index: number) => account.deriveChild(branch!).deriveChild(index),
        }]
      : candidateProfiles(node, descriptorMode);
    const findings: RecoveryFinding[] = [];
    const addressStates = new Map<string, UtxoAddressView>();
    let scanned = 0;
    let gapTruncated = false;
    for (const profile of profiles) {
      let target = config.minimumCount;
      for (let offset = 0; offset < target;) {
        if (context.signal.aborted) throw new DOMException('Bitcoin watch-only scan cancelled.', 'AbortError');
        const end = Math.min(offset + RECOVERY_UTXO_ADDRESS_BATCH, target);
        const derived: DerivedCandidate[] = [];
        for (let index = offset; index < end; index += 1) {
          const child = profile.deriveChild(index);
          const publicKey = child.publicKey;
          if (publicKey === null) throw new Error('Watch-only derivation unexpectedly produced no public key.');
          derived.push({
            address: addressFor(profile.mode, publicKey, network),
            path: profile.path.replace(/\/i$/u, `/${index}`),
            index,
            profile,
          });
        }
        const missing = derived.filter(({ address }) => !addressStates.has(address));
        if (missing.length > 0) {
          const entries = await queryAddresses(gateway, config.network, missing.map(({ address }) => address), context.signal);
          for (const entry of entries) addressStates.set(entry.address, entry);
        }
        for (const item of derived) {
          const entry = addressStates.get(item.address);
          if (entry === undefined) throw new Error('Bitcoin watch-only address cache omitted a derived address.');
          const balance = BigInt(entry.balance);
          const used = balance > 0n || entry.transactionCount > 0;
          if (used) {
            const extension = extendAddressTarget(target, item.index);
            target = extension.target;
            gapTruncated ||= extension.truncated;
          }
          if (balance === 0n && !(config.includeUsedZeroBalance && used)) continue;
          const finding: RecoveryFinding = {
            id: `bitcoin:watch:${item.profile.id}:${item.index}`,
            title: item.address,
            subtitle: `${item.profile.label} · index ${item.index}`,
            balanceAtomic: balance,
            balanceLabel: formatBitcoin(balance),
            fields: [
              { label: 'Scan family', value: item.profile.label },
              { label: 'Relative derivation path', value: item.path, copyable: true },
              { label: 'Transactions reported', value: String(entry.transactionCount) },
            ],
          };
          findings.push(finding);
          context.onFinding(input.id, 'core', finding);
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
    return buildResult(
      input,
      description,
      findings,
      addressStates,
      scanned,
      config,
      gapTruncated ? 'A used address was found too close to the end of the BIP32 index space to complete the post-use gap.' : undefined,
      startedAt,
    );
  } finally {
    // Watch-only nodes hold no private data; nothing to wipe on the HDKey itself.
  }
}
