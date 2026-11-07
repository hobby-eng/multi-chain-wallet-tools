import { base58 } from "@scure/base";
import { assertBatch, rootFromSeed } from "@ckd/core/bip32.js";
import {
  bytesToHex,
  concatBytes,
  encodeP2pkh,
  encodeWif,
  hash160,
  hexToBytes,
  wipe,
} from "@ckd/core/crypto.js";
import { getDashNetwork } from "@ckd/core/networks.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
} from "@ckd/core/types.js";
import { Dip14PrivateNode, isCompatibilityIndex, ser32 } from "./dip14.js";
import { DASH_DASHPAY_PATHS, DASH_PAY_INPUT_MESSAGES } from "./profiles.js";

/** The two identities of one DashPay contact, as the person types them. */
export interface DashPayContact {
  /** The identity of the recovery phrase's owner, who receives on this chain. */
  readonly ownIdentityId: string;
  /** The contact who pays to this chain. */
  readonly contactIdentityId: string;
}

export type DashPayOptions = Bip32BatchOptions & DashPayContact;

/** Which of the two identity IDs is meant, for the page's message of a refused one. */
export type DashPayIdentity = "own" | "contact";

/** A refused DashPay input, with a stable code that crosses the worker boundary. */
export class DashPayInputError extends Error {
  readonly code: keyof typeof DASH_PAY_INPUT_MESSAGES;

  constructor(code: DashPayInputError["code"]) {
    super(DASH_PAY_INPUT_MESSAGES[code]);
    this.name = "DashPayInputError";
    this.code = code;
  }
}

/**
 * A Platform identity ID: Base58 with the Bitcoin alphabet and no checksum, or 64 hex digits, that
 * is 32 bytes used as they are, big-endian. An ID starting with 28 zero bytes is refused: Dash Core
 * would read it as a 32-bit index and the Platform wallet library would not, and no real ID is one.
 */
export function parseDashIdentityId(text: string, identity: DashPayIdentity): Uint8Array {
  const value = text.trim();
  if (value === "") throw new DashPayInputError(`dashpay.${identity}.empty`);
  let bytes: Uint8Array;
  try {
    bytes = /^[0-9a-f]{64}$/iu.test(value) ? hexToBytes(value.toLowerCase()) : base58.decode(value);
  } catch {
    throw new DashPayInputError(`dashpay.${identity}.format`);
  }
  if (bytes.length !== 32) {
    wipe(bytes);
    throw new DashPayInputError(`dashpay.${identity}.length`);
  }
  if (isCompatibilityIndex(bytes)) throw new DashPayInputError(`dashpay.${identity}.form`);
  return bytes;
}

function contactPayload(ownNode: Dip14PrivateNode, friendship: Dip14PrivateNode): Uint8Array {
  const parentPublicKey = ownNode.publicKey();
  const parentHash = hash160(parentPublicKey);
  const chainCode = friendship.chainCode();
  const publicKey = friendship.publicKey();
  try {
    return concatBytes(parentHash.subarray(0, 4), chainCode, publicKey);
  } finally {
    wipe(parentPublicKey, parentHash, chainCode, publicKey);
  }
}

/**
 * The addresses on which a DashPay contact pays the owner of the recovery phrase (DIP15):
 * m/9'/coin_type'/15'/account'/(own identity ID)/(contact identity ID)/index, the two IDs as
 * DIP14 256-bit normal children. The chain's extended public key, in DIP15's 69-byte contact form,
 * is what the owner's wallet encrypts into the contact request.
 */
export function deriveDashPay(options: DashPayOptions): DerivationResult {
  const network = getDashNetwork(options.network);
  assertBatch(options.start, options.count);
  const own = parseDashIdentityId(options.ownIdentityId, "own");
  const contact = parseDashIdentityId(options.contactIdentityId, "contact");
  const accountPath = DASH_DASHPAY_PATHS.accountPath(options.network, options.account);
  const nodes: Dip14PrivateNode[] = [];
  const root = rootFromSeed(options.seed, network.versions);
  try {
    if (bytesToHex(own) === bytesToHex(contact)) throw new DashPayInputError("dashpay.same");
    const accountNode = root.derive(accountPath);
    let start: Dip14PrivateNode;
    try {
      start = Dip14PrivateNode.fromBip32(accountNode);
    } finally {
      accountNode.wipePrivateData();
    }
    nodes.push(start);
    const ownNode = start.normalChild(own);
    nodes.push(ownNode);
    const friendship = ownNode.normalChild(contact);
    nodes.push(friendship);
    const payload = contactPayload(ownNode, friendship);
    const chainPath = DASH_DASHPAY_PATHS.chainPath(options.network, options.account);
    const rows = [];
    for (let offset = 0; offset < options.count; offset += 1) {
      const index = options.start + offset;
      const leaf = friendship.normalChild(ser32(index));
      const privateKey = leaf.privateKey();
      const publicKey = leaf.publicKey();
      const publicKeyHash = hash160(publicKey);
      try {
        rows.push({
          index,
          path: `${chainPath}/${index}`,
          title: `Address #${index}`,
          basic: [
            paymentAddressField(
              "address",
              "Address (Dash Core P2PKH)",
              encodeP2pkh(publicKeyHash, network.p2pkh),
              "dash",
            ),
            field("publicKey", "Compressed public key", bytesToHex(publicKey)),
            field("privateKey", "Private key (Dash WIF)", encodeWif(privateKey, network.wif), true),
          ],
          advanced: [
            field("path", "DIP15 derivation path", `${chainPath}/${index}`),
            field("publicKeyHash", "HASH160(public key)", bytesToHex(publicKeyHash)),
            field("privateKeyHex", "Private key (raw 32-byte hex)", bytesToHex(privateKey), true),
          ],
        });
      } finally {
        wipe(privateKey, publicKey, publicKeyHash);
        leaf.wipe();
      }
    }
    return {
      id: "dash-dashpay",
      title: "DashPay incoming payments from one contact (DIP15)",
      networkLabel: network.label,
      pathTemplate: `${chainPath}/i`,
      basicSummary: [
        field("ownIdentityId", "Your identity ID", base58.encode(own)),
        field("contactIdentityId", "Contact's identity ID", base58.encode(contact)),
      ],
      summary: [
        field("ownIdentityIdHex", "Your identity ID (hex)", bytesToHex(own)),
        field("contactIdentityIdHex", "Contact's identity ID (hex)", bytesToHex(contact)),
        field(
          "contactPayload",
          "DIP15 extended public key for the contact (69 bytes)",
          bytesToHex(payload),
          false,
          "Parent fingerprint, chain code and public key of this receiving chain, the value your wallet encrypts into the contact request. Anyone who has it can see these payments.",
        ),
      ],
      rows,
      notices: [
        "These are the addresses on which this contact pays you. Payments that you sent to the contact use the contact's own chain, which cannot be derived from your recovery phrase.",
        "Identity IDs are used as they decode, big-endian. Check them against your wallet: with the two IDs swapped, the phrase derives another chain that no wallet uses.",
      ],
    };
  } finally {
    for (const node of nodes) node.wipe();
    root.wipePrivateData();
    wipe(own, contact);
  }
}
