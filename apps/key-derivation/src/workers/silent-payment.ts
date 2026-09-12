import { rootFromSeed, requirePrivate, requirePublic } from '@ckd/core/bip32.js';
import { bytesToHex, concatBytes, secp256k1, wipe } from '@ckd/core/crypto.js';
import { getBitcoinNetwork } from '@ckd/core/networks.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { bech32m } from '@scure/base';

export interface SilentPaymentResult {
  account: number;
  scanPath: string;
  spendPath: string;
  scanPublicKey: string;
  spendPublicKey: string;
  address: string;
  changeAddress: string;
  /** @deprecated Use {@link labeledAddresses}. Kept only for the first requested label so older result readers keep working. */
  labeledAddress?: string;
  labeledAddresses: Array<{ label: number; address: string }>;
}

function encodeAddress(scanPublic: Uint8Array, spendPublic: Uint8Array, network: 'mainnet' | 'testnet'): string {
  return bech32m.encode(
    network === 'mainnet' ? 'sp' : 'tsp',
    [0, ...bech32m.toWords(concatBytes(scanPublic, spendPublic))],
    1023,
  );
}

function labeledSpendPublic(scanPrivate: Uint8Array, spendPublic: Uint8Array, labelIndex: number): Uint8Array {
  const serialized = new Uint8Array(4);
  new DataView(serialized.buffer).setUint32(0, labelIndex, false);
  const label = schnorr.utils.taggedHash(
    'BIP0352/Label',
    concatBytes(scanPrivate, serialized),
  );
  try {
    if (!secp256k1.utils.isValidSecretKey(label)) throw new Error('BIP352 change label derived an invalid scalar.');
    return secp256k1.Point.fromHex(bytesToHex(spendPublic))
      .add(secp256k1.Point.BASE.multiply(BigInt(`0x${bytesToHex(label)}`)))
      .toBytes(true);
  } finally {
    wipe(label);
  }
}

const MAX_LABELS_PER_REQUEST = 200;

export async function deriveSilentPayment(
  seed: Uint8Array,
  networkName: 'mainnet' | 'testnet',
  account: number,
  labelIndexes?: readonly number[],
): Promise<SilentPaymentResult> {
  if (!Number.isSafeInteger(account) || account < 0 || account > 0x7fffffff) {
    throw new Error('Silent Payment account must be an integer from 0 to 2147483647.');
  }
  const labels = [...new Set(labelIndexes ?? [])].sort((left, right) => left - right);
  if (labels.length > MAX_LABELS_PER_REQUEST) {
    throw new Error(`Request at most ${MAX_LABELS_PER_REQUEST} labels at a time.`);
  }
  for (const label of labels) {
    if (!Number.isSafeInteger(label) || label < 1 || label > 0xffffffff) {
      throw new Error('Silent Payment labels must be integers from 1 to 4294967295; label 0 is reserved for change.');
    }
  }
  const network = getBitcoinNetwork(networkName);
  const root = rootFromSeed(seed, network.versions);
  const scanPath = `m/352'/${network.coinType}'/${account}'/1'/0`;
  const spendPath = `m/352'/${network.coinType}'/${account}'/0'/0`;
  const scan = root.derive(scanPath);
  const spend = root.derive(spendPath);
  let scanPrivate: Uint8Array | null = null;
  let scanPublic: Uint8Array | null = null;
  let spendPublic: Uint8Array | null = null;
  let changePublic: Uint8Array | null = null;
  const labeledPublics: Uint8Array[] = [];
  try {
    scanPrivate = requirePrivate(scan, scanPath);
    scanPublic = requirePublic(scan, scanPath);
    spendPublic = requirePublic(spend, spendPath);
    changePublic = labeledSpendPublic(scanPrivate, spendPublic, 0);
    const labeledAddresses = labels.map((label) => {
      const labeledPublic = labeledSpendPublic(scanPrivate!, spendPublic!, label);
      labeledPublics.push(labeledPublic);
      return { label, address: encodeAddress(scanPublic!, labeledPublic, networkName) };
    });
    return {
      account,
      scanPath,
      spendPath,
      scanPublicKey: bytesToHex(scanPublic),
      spendPublicKey: bytesToHex(spendPublic),
      address: encodeAddress(scanPublic, spendPublic, networkName),
      changeAddress: encodeAddress(scanPublic, changePublic, networkName),
      labeledAddresses,
      ...(labeledAddresses.length > 0 ? { labeledAddress: labeledAddresses[0]!.address } : {}),
    };
  } finally {
    wipe(scanPrivate, scanPublic, spendPublic, changePublic, ...labeledPublics);
    scan.wipePrivateData();
    spend.wipePrivateData();
    root.wipePrivateData();
  }
}
