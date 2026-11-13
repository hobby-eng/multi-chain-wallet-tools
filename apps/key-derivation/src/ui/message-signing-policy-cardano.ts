import { CARDANO_ROW_PUBLIC_KEY_INPUT } from "@ckd/coins/cardano/message-signing-inputs.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import { TableMessageSigningPolicy, type MessageFormatText } from "./message-signing-policy.js";

const SIGN_DATA_NOTE =
  "The DataSignature that Eternl, Lace, Yoroi and other CIP-30 wallets return for signData: a COSE_Sign1 of the message as UTF-8 text and the COSE_Key. A base or enterprise address signs with its payment key, a stake address with its stake key.";
const VERIFY_NOTE =
  "To verify, paste the DataSignature or its COSE_Sign1 alone; it is checked with this row's key. Trezor's signatures made without an address name a key hash, which no address matches, and are not valid here.";

/**
 * Every address a row signs for: the base address and the enterprise address of a receive or
 * change key; on a stake key's row, its stake address.
 */
const offer = Object.freeze({
  fields: ["address", "enterpriseAddress"],
  formats: ["cardano-cip30"] as const,
});

/** Cardano's offer: CIP-30's signData, for each of its variants. */
export const CARDANO_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ cardano: offer, "cardano-ledger": offer, "cardano-icarus-trezor": offer }),
  new Map<MessageSigningFormat, MessageFormatText>([
    [
      "cardano-cip30",
      {
        label: "CIP-30 signData (CIP-8 COSE_Sign1)",
        output: "DataSignature (COSE_Sign1 and COSE_Key, hex)",
        notes: [SIGN_DATA_NOTE, VERIFY_NOTE],
        // The address holds only a key hash: verification checks the row's key against it.
        rowInputs: [CARDANO_ROW_PUBLIC_KEY_INPUT],
      },
    ],
  ]),
);
