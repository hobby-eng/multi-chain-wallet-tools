import { keccak_256 } from "@noble/hashes/sha3.js";
import { EthereumAddress } from "@ckd/core/eip55.js";
import { bytesToHex, secp256k1, wipe } from "@ckd/core/crypto.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
} from "@ckd/core/types.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { withAccountBranch } from "../../account-branch.js";
import { ETHEREUM_PATHS } from "./profiles.js";

export function toEip55(lowercaseAddress: string): string {
  return EthereumAddress.fromHex(lowercaseAddress).checksummed;
}

export function ethereumAddressFromPublicKey(uncompressedPublicKey: Uint8Array): {
  raw: string;
  checksummed: string;
} {
  if (uncompressedPublicKey.length !== 65 || uncompressedPublicKey[0] !== 0x04) {
    throw new Error("Ethereum address derivation requires a 65-byte uncompressed secp256k1 key.");
  }
  const digest = keccak_256(uncompressedPublicKey.slice(1));
  const raw = bytesToHex(digest.slice(-20));
  return { raw, checksummed: toEip55(raw) };
}

/** The checksummed address of a secp256k1 public key in either SEC1 form; an expanded copy is wiped. */
export function ethereumAddressOfKey(publicKey: Uint8Array): string {
  const uncompressed =
    publicKey.length === 65
      ? publicKey
      : secp256k1.Point.fromHex(bytesToHex(publicKey)).toBytes(false);
  try {
    return ethereumAddressFromPublicKey(uncompressed).checksummed;
  } finally {
    if (uncompressed !== publicKey) wipe(uncompressed);
  }
}

export function deriveEthereum(options: Bip32BatchOptions): DerivationResult {
  // Ethereum keys use the mainnet serialization on every chain.
  const layout = { versions: BIP32_MAINNET_VERSIONS, paths: ETHEREUM_PATHS };
  return withAccountBranch(options, layout, (chain) => {
    const rows = chain.rows(({ index, path, node, privateKey, publicKey }) => {
      const uncompressedPublicKey = secp256k1.getPublicKey(privateKey, false);
      try {
        const address = ethereumAddressFromPublicKey(uncompressedPublicKey);
        return {
          index,
          path,
          title: `Account #${index}`,
          basic: [
            paymentAddressField(
              "address",
              "Ethereum address (EIP55)",
              address.checksummed,
              "ethereum",
            ),
            field("publicKey", "Uncompressed public key", bytesToHex(uncompressedPublicKey)),
            field("privateKey", "Private key (32-byte hex)", bytesToHex(privateKey), true),
          ],
          advanced: [
            field("path", "Derivation path", path),
            field("rawAddress", "Raw lowercase address", `0x${address.raw}`),
            field("compressedPublicKey", "Compressed public key", bytesToHex(publicKey)),
            field(
              "publicKeyPayload",
              "Uncompressed X || Y (without 0x04)",
              bytesToHex(uncompressedPublicKey.slice(1)),
            ),
            field("childXprv", "Child xprv", node.privateExtendedKey, true),
            field("childXpub", "Child xpub", node.publicExtendedKey),
          ],
        };
      } finally {
        wipe(uncompressedPublicKey);
      }
    });
    return {
      id: "ethereum",
      title: "Ethereum EOA (BIP44)",
      networkLabel: "Ethereum EOA · address format is chain-independent",
      pathTemplate: `${chain.branchPath}/i`,
      basicSummary: [],
      summary: chain.summary,
      rows,
      notices: ["Ethereum private keys are canonical 32-byte hexadecimal values, not WIF."],
    };
  });
}
