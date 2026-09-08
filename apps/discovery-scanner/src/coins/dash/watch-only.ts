import { HDKey } from '@scure/bip32';
import { bytesToHex, encodeP2pkh, hash160, secp256k1, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { encodePlatformP2pkh } from '@ckd/coins/dash/platform.js';
import { normalizeViewingKey, type NormalizedViewingKey } from '@ckd/dash-network/viewing-key.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
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
import { summarizeDashSections } from './summary.js';
import { validateIdentityLookup } from './identity-scanner.js';
import { DashPlatformClient } from './platform-client.js';
import { validatePlatformAddressBatch } from './platform-scanner.js';
import { scanDashShieldedWatchOnly } from './shielded-scanner.js';
import {
  ADDRESS_DISCOVERY_GAP,
  failedSection,
  extendAddressTarget,
  fetchDashScanIndexedHeight,
  formatDashFromCredits,
  formatDashFromDuffs,
  validateDashScanAddressBatch,
} from './util.js';

declare const __DASH_COMMUNITY__: boolean;

const ORCHARD_BUNDLE_HEX_LENGTH = { fvk: 192, ivk: 128, ovk: 64 } as const;
const HASH160_PATTERN = /^(?:0x)?[0-9a-f]{40}$/iu;
const ECDSA_PUBLIC_KEY_PATTERN = /^(?:0x)?(?:02|03)[0-9a-f]{64}$/iu;

function looksLikeOrchardBundleOrRaw(value: string): 'bundle' | 'fvk' | 'ivk' | false {
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) return 'bundle';
  const hex = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '');
  if (!/^[0-9a-f]+$/iu.test(hex)) return false;
  if (hex.length === ORCHARD_BUNDLE_HEX_LENGTH.fvk) return 'fvk';
  if (hex.length === ORCHARD_BUNDLE_HEX_LENGTH.ivk) return 'ivk';
  return false;
}

/**
 * Depth is a structural property of the decoded extended key and does not
 * depend on which network the caller eventually selects to scan under: Dash
 * mainnet and Bitcoin mainnet already share the same "xpub" version bytes in
 * this build (and Dash/Bitcoin testnet share "tpub"), so a mainnet-shaped
 * trial decode is enough to read the depth byte safely before any network is
 * chosen.
 */
function sniffExtendedKeyDepth(value: string): number {
  const versions = value.trim().startsWith('tpub') ? getDashNetwork('testnet').versions : getDashNetwork('mainnet').versions;
  try {
    return HDKey.fromExtendedKey(value, versions).depth;
  } catch {
    throw new Error('This extended public key is malformed.');
  }
}

export function detectDashWatchOnly(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial {
  const trimmed = raw.trim();
  const matched = matchExplicitPrefix(trimmed);
  if (matched !== null) {
    if (matched.prefix === 'dash-core-xpub') {
      if (matched.value.length === 0) throw new Error('dash-core-xpub: requires a value.');
      return { coinId: 'dash', kind: 'dash-core-xpub', value: matched.value };
    }
    if (matched.prefix === 'dash-platform-xpub') {
      if (matched.value.length === 0) throw new Error('dash-platform-xpub: requires a value.');
      return { coinId: 'dash', kind: 'dash-platform-xpub', value: matched.value };
    }
    if (matched.prefix === 'public-key') {
      if (matched.value.length === 0) throw new Error('public-key: requires a value.');
      return { coinId: 'dash', kind: 'public-key', value: normalizedHexKey(matched.value) };
    }
    if (matched.prefix === 'identity') {
      if (matched.value.length === 0) throw new Error('identity: requires a value.');
      const value = normalizedHexKey(matched.value);
      if (!HASH160_PATTERN.test(value) && !ECDSA_PUBLIC_KEY_PATTERN.test(value)) {
        throw new Error(
          'identity: requires a compressed ECDSA public key (33-byte hex) or its HASH160 (20-byte hex). This scanner performs a single proof-verified lookup by unique public-key hash and does not support Identity IDs, DPNS names, or BLS keys.',
        );
      }
      return { coinId: 'dash', kind: 'identity', value };
    }
    if (matched.prefix === 'orchard-fvk' || matched.prefix === 'orchard-ivk' || matched.prefix === 'orchard-ovk') {
      const viewingKeyMode = matched.prefix === 'orchard-ovk' ? 'outgoing' : 'automatic';
      const key = normalizeViewingKey(matched.value, viewingKeyMode);
      try {
        if (matched.prefix === 'orchard-fvk' && key.kind !== 'full') throw new Error('orchard-fvk: requires a 96-byte Full Viewing Key.');
        if (matched.prefix === 'orchard-ivk' && key.kind !== 'incoming') throw new Error('orchard-ivk: requires a 64-byte Incoming Viewing Key.');
        if (matched.prefix === 'orchard-ovk' && key.kind !== 'outgoing') throw new Error('orchard-ovk: requires the raw 32-byte Outgoing Viewing Key.');
        return {
          coinId: 'dash',
          kind: matched.prefix,
          value: key.hex,
          ...(key.bundleNetwork === undefined ? {} : { bundleNetwork: key.bundleNetwork }),
        };
      } finally {
        key.hex = '';
      }
    }
    const conflict = foreignPrefixCoin(trimmed, 'dash');
    if (conflict !== null) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      if (!__DASH_COMMUNITY__) {
        throw new Error(`"${matched.prefix}:" belongs to ${conflict}, not Dash. Remove the prefix or select ${conflict === 'bitcoin' ? 'Bitcoin' : 'Ethereum'}.`);
      }
    }
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    throw new Error(`Unrecognized prefix "${matched.prefix}:".`);
  }

  const orchardShape = looksLikeOrchardBundleOrRaw(trimmed);
  if (orchardShape !== false) {
    // Only Dash implements Orchard in this build, so an unprefixed viewing
    // bundle or raw FVK/IVK is unambiguous even in Auto mode. A raw 32-byte
    // OVK is intentionally excluded: it is indistinguishable in shape from a
    // private key and always requires the explicit `orchard-ovk:` prefix.
    const key = normalizeViewingKey(trimmed, 'automatic');
    try {
      return {
        coinId: 'dash',
        kind: key.kind === 'full' ? 'orchard-fvk' : 'orchard-ivk',
        value: key.hex,
        ...(key.bundleNetwork === undefined ? {} : { bundleNetwork: key.bundleNetwork }),
      };
    } finally {
      key.hex = '';
    }
  }
  if (looksLikeExtendedPublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    const depth = sniffExtendedKeyDepth(trimmed);
    return {
      coinId: 'dash', kind: depth === 5 ? 'dash-platform-xpub' : 'dash-core-xpub', value: trimmed,
      detectionLabel: depth === 5 ? 'Dash Platform · candidate key-class xpub' : 'Dash Core · candidate account xpub',
    };
  }
  if (looksLikeSec1PublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'dash', kind: 'public-key', value: normalizedHexKey(trimmed) };
  }
  throw new WatchOnlyNotRecognizedError();
}

function rejectMasterXpub(node: HDKey, kindLabel: string): void {
  if (node.depth === 0) {
    throw new Error(
      `This is the root/master extended public key. It sits above every hardened derivation level and cannot derive ${kindLabel}. Copy the appropriate account/key-class xpub instead.`,
    );
  }
}

async function scanCoreXpub(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
  gateway: RecoveryNetworkGateway,
): Promise<RecoveryWalletResult> {
  const network = getDashNetwork(config.network);
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(input.value, network.versions);
  } catch {
    throw new Error(`This extended public key does not match the selected ${network.label} version bytes, or is malformed.`);
  }
  rejectMasterXpub(node, 'standard BIP44 Core addresses');
  if (node.depth !== 3) {
    throw new Error(`A Dash Core account xpub has depth 3; this key has depth ${node.depth} and cannot be scanned for descendant addresses.`);
  }
  const indexedHeight = await fetchDashScanIndexedHeight(gateway, config.network, context.signal);
  const findings: RecoveryFinding[] = [];
  const addressStates = new Map<string, { balance: bigint; txCount: number }>();
  let scanned = 0;
  let gapTruncated = false;
  const startedAt = new Date().toISOString();
  for (const branch of [0, 1] as const) {
    const branchNode = node.deriveChild(branch);
    let target = config.minimumCount;
    for (let offset = 0; offset < target;) {
      if (context.signal.aborted) throw new DOMException('Dash Core watch-only scan cancelled.', 'AbortError');
      const end = Math.min(offset + 100, target);
      const derived: Array<{ address: string; index: number; path: string; publicKeyHash: string }> = [];
      for (let index = offset; index < end; index += 1) {
        const child = branchNode.deriveChild(index);
        const publicKey = child.publicKey;
        if (publicKey === null) throw new Error('Watch-only derivation unexpectedly produced no public key.');
        const publicKeyHash = hash160(publicKey);
        derived.push({
          address: encodeP2pkh(publicKeyHash, network.p2pkh),
          index,
          path: `<account xpub>/${branch}/${index}`,
          publicKeyHash: bytesToHex(publicKeyHash),
        });
      }
      const addresses = derived.map(({ address }) => address);
      const infos = validateDashScanAddressBatch(await gateway.runPublic(
        { network: config.network, addresses },
        'core.address-info',
        () => gateway.networkApi.coreAddressInfo(config.network, addresses, context.signal),
        context.signal,
      ), addresses);
      infos.forEach((info, position) => {
        const derivedItem = derived[position];
        if (derivedItem === undefined) throw new Error('Dash Core watch-only batch changed during scanning.');
        addressStates.set(derivedItem.address, info);
        const used = info.txCount > 0 || info.balance > 0n;
        if (used) {
          const extension = extendAddressTarget(target, derivedItem.index);
          target = extension.target;
          gapTruncated ||= extension.truncated;
        }
        if (info.balance === 0n && !(config.includeUsedZeroBalance && used)) return;
        const finding: RecoveryFinding = {
          id: `dash-core-xpub:${branch}:${derivedItem.index}`,
          title: derivedItem.address,
          subtitle: `${branch === 0 ? 'Receive' : 'Change'} address #${derivedItem.index}`,
          balanceAtomic: info.balance,
          balanceLabel: formatDashFromDuffs(info.balance),
          fields: [
            { label: 'Relative derivation path', value: derivedItem.path, copyable: true },
            { label: 'Transactions reported', value: String(info.txCount) },
            { label: 'Public-key hash', value: derivedItem.publicKeyHash, copyable: true },
          ],
        };
        findings.push(finding);
        context.onFinding(input.id, 'core', finding);
      });
      scanned += derived.length;
      offset = end;
      context.onProgress({
        inputId: input.id,
        section: 'core',
        message: `${branch === 0 ? 'Receive' : 'Change'}: checked ${offset} of ${target}`,
        completed: scanned,
        total: null,
      });
    }
  }
  let totalBalance = 0n;
  let fundedCount = 0;
  let usedCount = 0;
  for (const info of addressStates.values()) {
    totalBalance += info.balance;
    if (info.balance > 0n) fundedCount += 1;
    if (info.balance > 0n || info.txCount > 0) usedCount += 1;
  }
  const section: RecoverySection = {
    id: 'core',
    title: 'Dash Core watch-only addresses',
    description: 'A Core account xpub (depth 3) is below the hardened BIP44 levels, so its receive (/0/i) and change (/1/i) branches can be derived and queried without a seed.',
    state: 'complete',
    metrics: [
      { label: 'Spendable balance', value: formatDashFromDuffs(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Previously used · empty', value: String(usedCount - fundedCount) },
      { label: 'Unique addresses queried', value: String(addressStates.size) },
    ],
    findings,
    scanned,
    source: config.network === 'mainnet' ? 'https://dashscan.pshenmic.dev' : 'https://testnet.dashscan.pshenmic.dev',
    proof: `DashScan synchronized · indexed Core height ${indexedHeight} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap`,
    ...(gapTruncated ? { warning: 'A used address was found too close to the end of the BIP32 index space to complete the post-use gap.' } : {}),
  };
  return {
    inputId: input.id,
    label: input.label,
    coinId: 'dash',
    coinLabel: 'Dash',
    network: config.network,
    startedAt,
    completedAt: new Date().toISOString(),
    overview: [
      { label: 'Total located value', value: formatDashFromDuffs(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount), tone: fundedCount > 0 ? 'positive' : 'neutral' },
      { label: 'Unique addresses queried', value: String(addressStates.size) },
    ],
    sections: [section],
    warnings: ['Independently verify every funded address in a standard Dash wallet before treating a balance as spendable.'],
  };
}

async function scanPlatformXpub(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
  client: DashPlatformClient,
): Promise<RecoveryWalletResult> {
  const network = getDashNetwork(config.network);
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(input.value, network.versions);
  } catch {
    throw new Error(`This extended public key does not match the selected ${network.label} version bytes, or is malformed.`);
  }
  rejectMasterXpub(node, 'DIP17 Platform payment addresses');
  if (node.depth !== 5) {
    throw new Error(`A DIP17 key-class xpub has depth 5; this key has depth ${node.depth} and cannot be scanned for descendant addresses.`);
  }
  const findings: RecoveryFinding[] = [];
  const addressStates = new Map<string, { balance: bigint; nonce: bigint }>();
  let target = config.minimumCount;
  let scanned = 0;
  let proofHeight = 0n;
  let protocolVersion = 0;
  let gapTruncated = false;
  const startedAt = new Date().toISOString();
  for (let offset = 0; offset < target;) {
    if (context.signal.aborted) throw new DOMException('Dash Platform watch-only scan cancelled.', 'AbortError');
    const end = Math.min(offset + 100, target);
    const derived: Array<{ address: string; index: number; path: string; publicKeyHash: string; storageKey: string }> = [];
    for (let index = offset; index < end; index += 1) {
      const child = node.deriveChild(index);
      const publicKey = child.publicKey;
      if (publicKey === null) throw new Error('Watch-only derivation unexpectedly produced no public key.');
      const publicKeyHash = hash160(publicKey);
      const publicKeyHashHex = bytesToHex(publicKeyHash);
      derived.push({
        address: encodePlatformP2pkh(publicKeyHash, network.platformHrp),
        index,
        path: `<key-class xpub>/${index}`,
        publicKeyHash: publicKeyHashHex,
        storageKey: `00${publicKeyHashHex}`,
      });
    }
    const response = validatePlatformAddressBatch(await client.addresses(derived.map(({ address }) => address), context.signal));
    proofHeight = proofHeight > response.height ? proofHeight : response.height;
    protocolVersion = Math.max(protocolVersion, response.protocolVersion);
    for (const item of derived) {
      const info = response.data.get(item.storageKey);
      if (info === undefined || info === null) continue;
      addressStates.set(item.address, info);
      const used = info.balance > 0n || info.nonce > 0n;
      if (used) {
        const extension = extendAddressTarget(target, item.index);
        target = extension.target;
        gapTruncated ||= extension.truncated;
      }
      if (info.balance === 0n && !(config.includeUsedZeroBalance && used)) continue;
      const finding: RecoveryFinding = {
        id: `dash-platform-xpub:${item.index}`,
        title: item.address,
        subtitle: `Platform payment address #${item.index}`,
        balanceAtomic: info.balance,
        balanceLabel: formatDashFromCredits(info.balance),
        fields: [
          { label: 'Relative derivation path', value: item.path, copyable: true },
          { label: 'Outgoing nonce', value: info.nonce.toString() },
          { label: 'Public-key hash', value: item.publicKeyHash, copyable: true },
        ],
      };
      findings.push(finding);
      context.onFinding(input.id, 'platform', finding);
    }
    scanned += derived.length;
    offset = end;
    context.onProgress({
      inputId: input.id,
      section: 'platform',
      message: `Proof-checked ${scanned} of ${target} Platform addresses`,
      completed: scanned,
      total: target,
    });
  }
  let totalBalance = 0n;
  let fundedCount = 0;
  for (const info of addressStates.values()) {
    totalBalance += info.balance;
    if (info.balance > 0n) fundedCount += 1;
  }
  const section: RecoverySection = {
    id: 'platform',
    title: 'Dash Platform watch-only addresses',
    description: 'A DIP17 key-class xpub (depth 5, hardened through the key-class level) can derive its non-hardened leaf indices without a seed.',
    state: 'complete',
    metrics: [
      { label: 'Address balance', value: formatDashFromCredits(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount) },
      { label: 'Addresses checked', value: `${scanned} · minimum ${config.minimumCount}` },
    ],
    findings,
    scanned,
    source: 'Dash Platform DAPI · trusted quorum discovery',
    proof: `Balance proof verified at Platform height ${proofHeight} · protocol ${protocolVersion} · ${ADDRESS_DISCOVERY_GAP}-address post-use gap`,
    ...(gapTruncated ? { warning: 'A used address was found too close to the end of the BIP32 index space to complete the post-use gap.' } : {}),
  };
  return {
    inputId: input.id,
    label: input.label,
    coinId: 'dash',
    coinLabel: 'Dash',
    network: config.network,
    startedAt,
    completedAt: new Date().toISOString(),
    overview: [
      { label: 'Total located value', value: formatDashFromCredits(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Funded addresses', value: String(fundedCount), tone: fundedCount > 0 ? 'positive' : 'neutral' },
    ],
    sections: [section],
    warnings: ['Independently verify every funded address in a standard Dash wallet before treating a balance as spendable.'],
  };
}

async function scanExactPublicKey(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
  gateway: RecoveryNetworkGateway,
  client: DashPlatformClient,
): Promise<RecoveryWalletResult> {
  const network = getDashNetwork(config.network);
  let point: ReturnType<typeof secp256k1.Point.fromHex>;
  try { point = secp256k1.Point.fromHex(input.value); }
  catch { throw new Error('This public key is not a valid point on the secp256k1 curve.'); }
  const compressed = point.toBytes(true);
  const uncompressed = point.toBytes(false);
  const startedAt = new Date().toISOString();
  const sections: RecoverySection[] = [];
  async function check(id: RecoverySection['id'], title: string, action: () => Promise<RecoverySection>): Promise<void> {
    if (context.signal.aborted) throw new DOMException('Public-key scan cancelled.', 'AbortError');
    context.onProgress({ inputId: input.id, section: id, message: title, completed: 0, total: null });
    try {
      const section = await action();
      sections.push(section);
      for (const finding of section.findings) context.onFinding(input.id, id, finding);
    } catch (cause) {
      if (context.signal.aborted) throw cause;
      sections.push(failedSection(id, title, 'Exact public-key lookup', cause));
    }
  }
  try {
    const compressedHashHex = bytesToHex(hash160(compressed));
    const coreAddresses = [encodeP2pkh(hash160(compressed), network.p2pkh), encodeP2pkh(hash160(uncompressed), network.p2pkh)];
    const platformAddress = encodePlatformP2pkh(hash160(compressed), network.platformHrp);
    await check('core', 'Dash Core · exact public key', async () => {
      const infos = validateDashScanAddressBatch(await gateway.runPublic(
        { network: config.network, addresses: coreAddresses }, 'core.address-info',
        () => gateway.networkApi.coreAddressInfo(config.network, coreAddresses, context.signal), context.signal,
      ), coreAddresses);
      const findings: RecoveryFinding[] = infos.flatMap((info, index) => {
        if (info.balance === 0n && !(config.includeUsedZeroBalance && info.txCount > 0)) return [];
        return [{ id: `dash-public-key:core:${coreAddresses[index]}`, title: coreAddresses[index]!,
          subtitle: index === 0 ? 'Exact Core P2PKH · compressed key' : 'Exact Core P2PKH · uncompressed key',
          balanceAtomic: info.balance, balanceLabel: formatDashFromDuffs(info.balance),
          fields: [{ label: 'Transactions reported', value: String(info.txCount) }] }];
      });
      return { id: 'core', title: 'Dash Core · exact public key',
        description: 'Check the compressed and uncompressed P2PKH addresses of this exact key.',
        state: 'complete', metrics: [{ label: 'Addresses checked', value: '2' }], findings, scanned: 2,
        source: config.network === 'mainnet' ? 'https://dashscan.pshenmic.dev' : 'https://testnet.dashscan.pshenmic.dev',
        proof: 'DashScan indexed Core state · single exact-key lookup' };
    });
    await check('platform', 'Dash Platform · exact public key', async () => {
      const response = validatePlatformAddressBatch(await client.addresses([platformAddress], context.signal));
      const info = response.data.get(`00${compressedHashHex}`);
      const findings: RecoveryFinding[] = info != null && (info.balance > 0n || (config.includeUsedZeroBalance && info.nonce > 0n))
        ? [{ id: `dash-public-key:platform:${platformAddress}`, title: platformAddress,
            subtitle: 'Exact Platform P2PKH · compressed key', balanceAtomic: info.balance,
            balanceLabel: formatDashFromCredits(info.balance), fields: [{ label: 'Outgoing nonce', value: info.nonce.toString() }] }]
        : [];
      return { id: 'platform', title: 'Dash Platform · exact public key',
        description: 'Check the compressed-key Platform P2PKH address.', state: 'complete',
        metrics: [{ label: 'Addresses checked', value: '1' }], findings, scanned: 1,
        source: 'Dash Platform DAPI · trusted quorum discovery',
        proof: `Balance proof verified at Platform height ${response.height} · protocol ${response.protocolVersion}` };
    });
    await check('identity', 'Dash Platform · exact identity lookup', async () => {
      const response = validateIdentityLookup(await client.identity(compressedHashHex, context.signal));
      const findings: RecoveryFinding[] = response.identities.map((identity) => ({
        id: `dash-public-key:identity:${identity.identifier}`, title: identity.identifier,
        subtitle: 'Identity matched by unique compressed-key HASH160', balanceAtomic: identity.balance,
        balanceLabel: formatDashFromCredits(identity.balance), fields: [
          { label: 'Public-key hash', value: compressedHashHex, copyable: true },
          { label: 'Identity revision', value: identity.revision.toString() },
        ],
      }));
      return { id: 'identity', title: 'Dash Platform · exact identity lookup',
        description: 'Proof-verified lookup by the compressed public key hash.', state: 'complete',
        metrics: [{ label: 'Identities found', value: String(findings.length) }], findings, scanned: 1,
        source: 'Dash Platform DAPI · trusted quorum discovery',
        proof: `Balance proof verified at Platform height ${response.proofHeight} · protocol ${response.protocolVersion}` };
    });
    return { inputId: input.id, label: input.label, coinId: 'dash', coinLabel: 'Dash', network: config.network,
      startedAt, completedAt: new Date().toISOString(), overview: summarizeDashSections(sections), sections,
      warnings: [
        'A single public key is checked exactly; it does not derive standard wallet descendants.',
        ...sections.filter(({ state }) => state === 'failed').map(({ title, warning }) => `${title} was not checked: ${warning}`),
      ],
    };
  } finally { wipe(compressed, uncompressed); }
}

async function scanIdentityLookup(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
  client: DashPlatformClient,
): Promise<RecoveryWalletResult> {
  const startedAt = new Date().toISOString();
  const publicKeyHashHex = ECDSA_PUBLIC_KEY_PATTERN.test(input.value)
    ? bytesToHex(hash160(hexToBytes(input.value)))
    : input.value;
  const identityResult = validateIdentityLookup(await client.identity(publicKeyHashHex, context.signal));
  const findings: RecoveryFinding[] = identityResult.identities.map((identity) => {
    const finding: RecoveryFinding = {
      id: `identity:${identity.identifier}`,
      title: identity.identifier,
      subtitle: 'Identity matched by unique public-key hash',
      balanceAtomic: identity.balance,
      balanceLabel: formatDashFromCredits(identity.balance),
      fields: [
        { label: 'Public-key hash', value: publicKeyHashHex, copyable: true },
        { label: 'Identity revision', value: identity.revision.toString() },
      ],
    };
    context.onFinding(input.id, 'identity', finding);
    return finding;
  });
  if (identityResult.identities.length > 1) {
    findings.forEach((finding) => {
      finding.fields.push({ label: 'Note', value: 'More than one identity matched this key hash; each is listed independently.' });
    });
  }
  const totalBalance = findings.reduce((sum, finding) => sum + finding.balanceAtomic, 0n);
  const section: RecoverySection = {
    id: 'identity',
    title: 'Dash Platform identity lookup',
    description: 'A single proof-verified lookup by unique public-key hash. This scanner performs an exact lookup, not a derived-index scan.',
    state: 'complete',
    metrics: [{ label: 'Identities found', value: String(identityResult.identities.length) }],
    findings,
    scanned: 1,
    source: 'Dash Platform DAPI · trusted quorum discovery',
    proof: `Balance proof verified at Platform height ${identityResult.proofHeight} · protocol ${identityResult.protocolVersion}`,
  };
  return {
    inputId: input.id,
    label: input.label,
    coinId: 'dash',
    coinLabel: 'Dash',
    network: config.network,
    startedAt,
    completedAt: new Date().toISOString(),
    overview: [
      { label: 'Total located value', value: formatDashFromCredits(totalBalance), tone: totalBalance > 0n ? 'positive' : 'neutral' },
      { label: 'Identities found', value: String(identityResult.identities.length) },
    ],
    sections: [section],
    warnings: ['Independently verify identity ownership before treating a balance as spendable.'],
  };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function scanOrchard(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
  gateway: RecoveryNetworkGateway,
): Promise<RecoveryWalletResult> {
  if (input.bundleNetwork !== undefined && input.bundleNetwork !== config.network) {
    throw new Error(`This viewing bundle is for ${input.bundleNetwork}; select that network before scanning.`);
  }
  const kind = input.kind === 'orchard-fvk' ? 'full' : input.kind === 'orchard-ivk' ? 'incoming' : 'outgoing';
  const viewingKey: NormalizedViewingKey = { kind, hex: input.value };
  const startedAt = new Date().toISOString();
  try {
    const section = await scanDashShieldedWatchOnly(
      input.id,
      viewingKey,
      config.network,
      config.includeUsedZeroBalance,
      gateway,
      context.signal,
      context.onProgress,
      (finding) => context.onFinding(input.id, 'shielded', finding),
    );
    const balanceMetric = section.metrics.find((metric) => metric.label === 'Spendable balance');
    return {
      inputId: input.id,
      label: input.label,
      coinId: 'dash',
      coinLabel: 'Dash',
      network: config.network,
      startedAt,
      completedAt: new Date().toISOString(),
      overview: [
        balanceMetric ?? { label: 'Spendable balance', value: 'Not available', tone: 'neutral' },
        { label: 'Viewing key capability', value: kind === 'full' ? 'Full (incoming + outgoing + spend state)' : kind === 'incoming' ? 'Incoming only' : 'Outgoing only' },
      ],
      sections: [section],
      warnings: kind === 'full'
        ? ['Independently verify every note before treating a balance as spendable.']
        : ['This viewing key cannot see the full picture of this account; it does not have an authoritative current balance.'],
    };
  } finally {
    viewingKey.hex = '';
  }
}

export async function scanDashWatchOnly(
  input: RecoveryWatchOnlyInput,
  config: RecoveryWatchOnlyScanConfig,
  context: RecoveryScanContext,
): Promise<RecoveryWalletResult> {
  if (!Number.isSafeInteger(config.minimumCount) || config.minimumCount < 1) {
    throw new Error('The watch-only address minimum must be a positive integer.');
  }
  const guard = new SecretEgressGuard();
  if (input.kind !== 'public-key' && input.kind !== 'identity') {
    guard.registerString('Dash watch-only input', input.value);
    context.sessionSecretGuard?.registerString('Dash watch-only input', input.value);
  }
  const gateway = new RecoveryNetworkGateway(guard, context.networkApi, context.networkLimiter ?? new RecoveryConcurrencyLimiter(5));
  const client = new DashPlatformClient(config.network, gateway);
  switch (input.kind) {
    case 'dash-core-xpub':
      return scanCoreXpub(input, config, context, gateway);
    case 'dash-platform-xpub':
      return scanPlatformXpub(input, config, context, client);
    case 'public-key':
      return scanExactPublicKey(input, config, context, gateway, client);
    case 'identity':
      return scanIdentityLookup(input, config, context, client);
    case 'orchard-fvk':
    case 'orchard-ivk':
    case 'orchard-ovk':
      return scanOrchard(input, config, context, gateway);
    default:
      throw new Error(`Dash watch-only scanning does not support ${input.kind}.`);
  }
}
