import { admitHip820Message } from "@ckd/coins/hedera/message-signing-hip820.js";
import { ROW_PUBLIC_KEY_INPUT } from "@ckd/coins/message-signing-secp256k1.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import { TableMessageSigningPolicy, type MessageFormatText } from "./message-signing-policy.js";

const output = "SignatureMap (Base64)";
const SIGN_MESSAGE_NOTE =
  "HashPack and the other WalletConnect wallets return this SignatureMap (hedera_signMessage, HIP-820). It proves this key; an account whose key is a key list or a threshold key is not proven by one key's signature.";
/** Decision D5. */
const ASCII_NOTE =
  "Only ASCII text is signed, since Hedera wallets count the length of other text differently.";
const check = (message: string) => admitHip820Message(message);

/** Hedera's offers: HIP-820 for each key type's row. */
export const HEDERA_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({
    hedera: { fields: ["address"], formats: ["hedera-hip820-ed25519"] },
    "hedera-ecdsa": { fields: ["address"], formats: ["hedera-hip820-ecdsa"] },
  }),
  new Map<MessageSigningFormat, MessageFormatText>([
    [
      "hedera-hip820-ed25519",
      {
        label: "Hedera hedera_signMessage (HIP-820) · Ed25519",
        output,
        notes: [SIGN_MESSAGE_NOTE, ASCII_NOTE],
        check,
      },
    ],
    [
      "hedera-hip820-ecdsa",
      {
        label: "Hedera hedera_signMessage (HIP-820) · ECDSA",
        output,
        notes: [SIGN_MESSAGE_NOTE, ASCII_NOTE],
        // An ECDSA row's address is an EVM address: verification checks the row's own key.
        rowInputs: [ROW_PUBLIC_KEY_INPUT],
        check,
      },
    ],
  ]),
);
