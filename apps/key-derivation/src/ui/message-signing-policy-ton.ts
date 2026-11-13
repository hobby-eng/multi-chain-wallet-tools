import {
  TON_BINARY_LIMIT,
  TON_SIGN_DATA_INPUTS,
  admitTonSignData,
  type TonSignDataKind,
} from "@ckd/coins/ton/message-signing-sign-data.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import { TableMessageSigningPolicy, type MessageFormatText } from "./message-signing-policy.js";

const BYTES_PER_KIB = 1024;
const SIGN_DATA_NOTE =
  "TON Connect's signData, as Tonkeeper and other TON Connect wallets sign it. The signature binds this wallet address, the domain and the timestamp: verify with the same values. Cell payloads and ton_proof are not offered.";

/** The texts of one payload kind, whose fields are the app's domain and the timestamp. */
function signData(kind: TonSignDataKind, label: string): MessageFormatText {
  return {
    label,
    output: "Response (JSON, as TON Connect's signData returns it)",
    notes: [SIGN_DATA_NOTE],
    inputs: [
      {
        key: TON_SIGN_DATA_INPUTS.domain,
        label: "Domain",
        help: "The domain of the app that asks for the signature, without the scheme, such as app.example.",
      },
      {
        key: TON_SIGN_DATA_INPUTS.timestamp,
        label: "Timestamp",
        help: "Unix seconds of the signing, now when the dialog opens. To verify a response, enter its timestamp.",
        initial: "now",
      },
    ],
    // A TON address is a contract's: verification checks the row's key against it.
    rowInputs: [TON_SIGN_DATA_INPUTS.publicKey],
    ...(kind === "binary"
      ? {
          message: {
            label: "Bytes (hex)",
            help: `Up to ${TON_BINARY_LIMIT / BYTES_PER_KIB} KiB, two hex digits per byte.`,
          },
        }
      : {}),
    check: (message: string, inputs: Readonly<Record<string, string>>) =>
      admitTonSignData(message, kind, inputs),
  };
}

/** Every wallet address of a row signs: the signature binds the clicked one. */
const offer = Object.freeze({
  fields: ["address", "addressW5", "addressv4R2", "addressv3R2"],
  formats: ["ton-sign-data-text", "ton-sign-data-binary"] as const,
});

/** TON's offers: TON Connect's signData, text by default, for each variant. */
export const TON_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ ton: offer, "ton-trust": offer, "ton-ledger": offer }),
  new Map<MessageSigningFormat, MessageFormatText>([
    ["ton-sign-data-text", signData("text", "TON Connect signData (text)")],
    ["ton-sign-data-binary", signData("binary", "TON Connect signData (binary)")],
  ]),
);
