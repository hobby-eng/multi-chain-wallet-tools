import { MAX_BIP32_INDEX, assertIndex, requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { assertValidMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { bytesToHex, wipe } from '@ckd/core/crypto.js';
import { getBitcoinNetwork } from '@ckd/core/networks.js';
import { deriveLegacyAddress } from '@ckd/coins/bitcoin/legacy.js';
import { deriveNativeSegwitAddress } from '@ckd/coins/bitcoin/native-segwit.js';
import { deriveNestedSegwitAddress } from '@ckd/coins/bitcoin/nested-segwit.js';
import { deriveTaprootAddress } from '@ckd/coins/bitcoin/taproot.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import { RECOVERY_UTXO_ADDRESS_BATCH, type UtxoAddressView } from '../../network-protocol.js';
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

type BitcoinMode = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot';

const MODES: ReadonlyArray<{ mode: BitcoinMode; label: string; purpose: number }> = [
  { mode: 'legacy', label: 'Legacy · BIP44', purpose: 44 },
  { mode: 'nested-segwit', label: 'Nested SegWit · BIP49', purpose: 49 },
  { mode: 'native-segwit', label: 'Native SegWit · BIP84', purpose: 84 },
  { mode: 'taproot', label: 'Taproot · BIP86', purpose: 86 },
];

interface BitcoinPathProfile {
  id: string;
  label: string;
  mode: BitcoinMode;
  initialCount: number;
  path(index: number): string;
}

function formatBitcoin(satoshis: bigint): string {
  const whole = satoshis / 100_000_000n;
  const fraction = (satoshis % 100_000_000n).toString().padStart(8, '0').replace(/0+$/u, '');
  return `${whole.toLocaleString('en-US')}${fraction.length > 0 ? `.${fraction}` : ''} BTC`;
}

function addressFor(mode: BitcoinMode, publicKey: Uint8Array, network: ReturnType<typeof getBitcoinNetwork>): string {
  if (mode === 'legacy') return deriveLegacyAddress(publicKey, network).address;
  if (mode === 'nested-segwit') return deriveNestedSegwitAddress(publicKey, network).address;
  if (mode === 'native-segwit') return deriveNativeSegwitAddress(publicKey, network).address;
  return deriveTaprootAddress(publicKey, network).address;
}

function validatedEntries(value: UtxoAddressView[], expected: readonly string[]): UtxoAddressView[] {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new Error('Bitcoin address service returned an incomplete batch.');
  }
  return value.map((entry, index) => {
    if (entry.address !== expected[index]
      || !/^(?:0|[1-9][0-9]*)$/u.test(entry.balance)
      || !Number.isSafeInteger(entry.transactionCount)
      || entry.transactionCount < 0) {
      throw new Error('Bitcoin address service returned malformed data.');
    }
    return entry;
  });
}

function pathProfiles(config: RecoveryScanConfig, coinType: number): BitcoinPathProfile[] {
  const profiles = MODES.flatMap((family) => ([0, 1] as const).flatMap((branch) => {
    const initialCount = branch === 0 ? config.coreReceiveCount : config.coreChangeCount;
    return initialCount === 0 ? [] : [{
      id: `${family.mode}:${branch}`,
      label: `${family.label} · ${branch === 0 ? 'receive / external' : 'change / internal'}`,
      mode: family.mode,
      initialCount,
      path: (index: number) => `m/${family.purpose}'/${coinType}'/${config.account}'/${branch}/${index}`,
    }];
  }));
  if (config.scanCustomPath === true) {
    const selectedMode = MODES.find((entry) => entry.mode === config.customPathFormat);
    if (selectedMode === undefined) throw new Error('Select a valid Bitcoin address format for the custom path.');
    const parsed = parseCustomPathTemplate(config.customPathTemplate ?? '');
    profiles.push({
      id: 'custom',
      label: `Custom path · ${selectedMode.label}`,
      mode: selectedMode.mode,
      initialCount: config.customPathCount ?? 0,
      path: parsed.path,
    });
  }
  return profiles;
}

async function scanBitcoin(
  input: RecoverySeedInput,
  config: RecoveryScanConfig,
  context: Parameters<RecoveryCoinAdapter['scan']>[2],
): Promise<RecoveryWalletResult> {
  assertIndex(config.account, 'Account');
  if (!Number.isSafeInteger(config.coreReceiveCount) || config.coreReceiveCount < 0
    || !Number.isSafeInteger(config.coreChangeCount) || config.coreChangeCount < 0
    || config.coreReceiveCount > MAX_BIP32_INDEX + 1
    || config.coreChangeCount > MAX_BIP32_INDEX + 1
    || config.coreReceiveCount + config.coreChangeCount < 1) {
    throw new Error(`Bitcoin receive/change counts must be within 0–${MAX_BIP32_INDEX + 1}, with at least one selected.`);
  }
  if (config.scanCustomPath === true
    && (!Number.isSafeInteger(config.customPathCount)
      || (config.customPathCount ?? 0) < 1
      || (config.customPathCount ?? 0) > MAX_BIP32_INDEX + 1)) {
    throw new Error(`Custom path address minimum must be within 1–${MAX_BIP32_INDEX + 1}.`);
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
  const network = getBitcoinNetwork(config.network);
  const root = rootFromSeed(seed, network.versions);
  const profiles = pathProfiles(config, network.coinType);
  const findings: RecoveryFinding[] = [];
  const findingsByAddress = new Map<string, RecoveryFinding>();
  const addressStates = new Map<string, UtxoAddressView>();
  let totalBalance = 0n;
  let fundedCount = 0;
  let usedCount = 0;
  let scanned = 0;
  const startedAt = new Date().toISOString();
  try {
    for (const profile of profiles) {
      let target = profile.initialCount;
      for (let offset = 0; offset < target;) {
        if (context.signal.aborted) throw new DOMException('Bitcoin scan cancelled.', 'AbortError');
        const end = Math.min(offset + RECOVERY_UTXO_ADDRESS_BATCH, target);
        const derived = Array.from({ length: end - offset }, (_, relativeIndex) => {
          const index = offset + relativeIndex;
          const path = profile.path(index);
          const child = root.derive(path);
          const publicKey = requirePublic(child, path);
          try {
            return {
              address: addressFor(profile.mode, publicKey, network),
              index,
              path,
              publicKey: bytesToHex(publicKey),
            };
          } finally {
            wipe(publicKey);
            child.wipePrivateData();
          }
        });
        const missing = derived.filter(({ address }) => !addressStates.has(address));
        if (missing.length > 0) {
          const addresses = missing.map(({ address }) => address);
          const entries = validatedEntries(await gateway.runPublic(
            { network: config.network, addresses },
            'utxo.addresses',
            () => gateway.networkApi.utxoAddresses(config.network, addresses, context.signal),
            context.signal,
          ), addresses);
          for (const entry of entries) {
            addressStates.set(entry.address, entry);
            const balance = BigInt(entry.balance);
            const used = entry.transactionCount > 0 || balance > 0n;
            if (used) usedCount += 1;
            if (balance > 0n) fundedCount += 1;
            totalBalance += balance;
          }
        }
        for (const item of derived) {
          const entry = addressStates.get(item.address);
          if (entry === undefined) throw new Error('Bitcoin account state cache omitted a derived address.');
          const balance = BigInt(entry.balance);
          const used = entry.transactionCount > 0 || balance > 0n;
          if (used) target = extendAddressTarget(target, item.index).target;
          if (balance > 0n || (config.includeUsedZeroBalance && used)) {
            const existing = findingsByAddress.get(item.address);
            if (existing !== undefined) {
              if (!existing.fields.some(({ value }) => value === item.path)) {
                existing.fields.push({ label: 'Alternate derivation path', value: item.path, copyable: true });
              }
              continue;
            }
            const finding: RecoveryFinding = {
              id: `bitcoin:${profile.id}:${item.index}`,
              title: item.address,
              subtitle: `${profile.label} · index ${item.index}`,
              balanceAtomic: balance,
              balanceLabel: formatBitcoin(balance),
              fields: [
                { label: 'Scan family', value: profile.label },
                { label: 'Derivation path', value: item.path, copyable: true },
                { label: 'Profile index', value: String(item.index) },
                { label: 'Transactions reported', value: String(entry.transactionCount) },
                { label: 'Public key', value: item.publicKey, copyable: true },
              ],
            };
            findingsByAddress.set(item.address, finding);
            findings.push(finding);
            context.onFinding(input.id, 'core', finding);
          }
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
    const section: RecoverySection = {
      id: 'core',
      title: 'Bitcoin wallet addresses',
      description: `Scans BIP44 legacy, BIP49 nested SegWit, BIP84 native SegWit, BIP86 Taproot${config.scanCustomPath === true ? ', and the selected custom path' : ''}.`,
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
      proof: 'Indexed Bitcoin chain and mempool state · batch lookup where available · bounded retry with provider failover · 20-address post-use gap per path profile',
      warning: 'Public Bitcoin indexes can lag or disagree. Verify every funded address in a standard Bitcoin wallet before recovery.',
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
        { label: 'Path profiles', value: String(profiles.length) },
        { label: 'Unique addresses queried', value: String(addressStates.size) },
      ],
      sections: [section],
      warnings: ['Restore discovered paths in a standard Bitcoin wallet and independently verify balances before moving funds.'],
    };
  } finally {
    root.wipePrivateData();
    wipe(seed);
    guard.clear();
  }
}

export const BITCOIN_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  id: 'bitcoin',
  label: 'Bitcoin',
  networks: ['mainnet', 'testnet'],
  customPath: {
    description: 'Optional; four standard families stay enabled.',
    placeholder: "m/84'/0'/7'/0/{index}",
    formats: [
      { id: 'legacy', label: 'Legacy · P2PKH' },
      { id: 'nested-segwit', label: 'Nested SegWit · P2SH-P2WPKH' },
      { id: 'native-segwit', label: 'Native SegWit · P2WPKH' },
      { id: 'taproot', label: 'Taproot · BIP86 P2TR' },
    ],
  },
  scan: scanBitcoin,
};
