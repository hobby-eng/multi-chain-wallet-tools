import type { MessageSigningFormat } from "../workers/protocol.js";
import {
  BASE64_SIGNATURE as output,
  TableMessageSigningPolicy,
  type MessageFormatText,
} from "./message-signing-policy.js";

/** Who verifies Litecoin's SegWit signatures, BIP137's typed headers. */
const SEGWIT_NOTE =
  "Litecoin Core verifies only L… addresses. Trezor and Electrum-LTC verify this signature, and Electrum-LTC's own SegWit signatures verify here too.";

/** Each variant's own address signs in the format of its address type. */
const offer = (format: MessageSigningFormat) => ({ fields: ["address"], formats: [format] });

/** Litecoin's offers: Litecoin Core's compact P2PKH, and BIP137 for its SegWit addresses. */
export const LITECOIN_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({
    "litecoin-legacy": offer("litecoin-compact-legacy"),
    "litecoin-nested-segwit": offer("litecoin-compact-nested"),
    "litecoin-native-segwit": offer("litecoin-compact-native"),
  }),
  new Map<MessageSigningFormat, MessageFormatText>([
    [
      "litecoin-compact-legacy",
      { label: "Litecoin Core compact P2PKH", output, notes: [], compact: true },
    ],
    [
      "litecoin-compact-nested",
      {
        label: "Litecoin compact P2SH-P2WPKH (BIP137)",
        output,
        notes: [SEGWIT_NOTE],
        compact: true,
      },
    ],
    [
      "litecoin-compact-native",
      { label: "Litecoin compact P2WPKH (BIP137)", output, notes: [SEGWIT_NOTE], compact: true },
    ],
  ]),
);
