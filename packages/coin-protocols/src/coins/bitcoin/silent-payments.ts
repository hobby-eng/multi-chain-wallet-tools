import { rootFromSeed } from "@ckd/core/bip32.js";
import { Bip32Key } from "@ckd/core/bip32-key.js";
import { bytesToHex, concatBytes, secp256k1, wipe } from "@ckd/core/crypto.js";
import { getBitcoinNetwork } from "@ckd/core/networks.js";
import { schnorr } from "@noble/curves/secp256k1.js";
import { bech32m } from "@scure/base";
import { SilentPaymentError, SilentPaymentParameters } from "./silent-payment-parameters.js";

// BIP352 address version, BIP44 purpose and label encoding.
const ADDRESS_VERSION = 0;
const PURPOSE = 352;
const LABEL_BYTES = 4;
const CHANGE_LABEL = 0;
const SCAN_BRANCH = 1;
const SPEND_BRANCH = 0;
const BECH32_MAX_LENGTH = 1023;

/** Public addresses, paths and compressed public keys; no private key is returned. */
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

function encodeAddress(
  scanPublic: Uint8Array,
  spendPublic: Uint8Array,
  network: "mainnet" | "testnet",
): string {
  return bech32m.encode(
    network === "mainnet" ? "sp" : "tsp",
    [ADDRESS_VERSION, ...bech32m.toWords(concatBytes(scanPublic, spendPublic))],
    BECH32_MAX_LENGTH,
  );
}

function labeledSpendPublic(
  scanPrivate: Uint8Array,
  spendPublic: Uint8Array,
  labelIndex: number,
): Uint8Array {
  const serialized = new Uint8Array(LABEL_BYTES);
  new DataView(serialized.buffer).setUint32(0, labelIndex, false);
  let label: Uint8Array | undefined;
  const labelInput = concatBytes(scanPrivate, serialized);
  try {
    label = schnorr.utils.taggedHash("BIP0352/Label", labelInput);
    if (!secp256k1.utils.isValidSecretKey(label))
      throw new SilentPaymentError("silent-payment.scalar");
    return secp256k1.Point.fromHex(bytesToHex(spendPublic))
      .add(secp256k1.Point.BASE.multiply(BigInt(`0x${bytesToHex(label)}`)))
      .toBytes(true);
  } finally {
    wipe(label, labelInput, serialized);
  }
}

/** BIP352 receiving/change/labeled addresses from a borrowed seed; derived private keys are disposed. */
export class SilentPaymentWallet {
  /**
   * Validates public parameters before key derivation, borrows the caller-owned seed and returns
   * public metadata. Refuses malformed parameters or an unusable label scalar with a stable code.
   */
  static async derive(
    this: void,
    seed: Uint8Array,
    networkName: "mainnet" | "testnet",
    account: number,
    labelIndexes?: readonly number[],
  ): Promise<SilentPaymentResult> {
    const parameters = new SilentPaymentParameters(networkName, account, labelIndexes);
    const labels = parameters.labels;
    const network = getBitcoinNetwork(networkName);
    using root = Bip32Key.take(rootFromSeed(seed, network.versions));
    const scanPath = `m/${PURPOSE}'/${network.coinType}'/${account}'/${SCAN_BRANCH}'/0`;
    const spendPath = `m/${PURPOSE}'/${network.coinType}'/${account}'/${SPEND_BRANCH}'/0`;
    using scan = Bip32Key.take(root.node.derive(scanPath));
    using spend = Bip32Key.take(root.node.derive(spendPath));
    const scanPrivate = scan.privateKey(scanPath);
    const scanPublic = scan.publicKey(scanPath);
    const spendPublic = spend.publicKey(spendPath);
    let changePublic: Uint8Array | null = null;
    const labeledPublics: Uint8Array[] = [];
    try {
      changePublic = labeledSpendPublic(scanPrivate, spendPublic, CHANGE_LABEL);
      const labeledAddresses = labels.map((label) => {
        const labeledPublic = labeledSpendPublic(scanPrivate, spendPublic, label);
        labeledPublics.push(labeledPublic);
        return { label, address: encodeAddress(scanPublic, labeledPublic, networkName) };
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
        ...(labeledAddresses[0] === undefined
          ? {}
          : { labeledAddress: labeledAddresses[0].address }),
      };
    } finally {
      wipe(changePublic, ...labeledPublics);
    }
  }
}
