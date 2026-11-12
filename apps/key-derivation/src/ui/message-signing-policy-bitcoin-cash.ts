import type { MessageSigningFormat } from "../workers/protocol.js";
import {
  BASE64_SIGNATURE as output,
  TableMessageSigningPolicy,
  type MessageFormatText,
} from "./message-signing-policy.js";

/** The mirror of Bitcoin's compact note: both chains sign with Bitcoin's message format. */
const SAME_AS_BITCOIN =
  "Bitcoin Cash signs with Bitcoin's message format: this signature is also valid for the Bitcoin address 1… of the same key. Put the chain's name in the message if that matters.";

/** Both coin types sign from the CashAddr and from its legacy form: the signature is the same. */
const offer = Object.freeze({
  fields: ["address", "legacyAddress"],
  formats: ["bitcoin-cash-compact"] as const,
});

/** Bitcoin Cash's offers: Bitcoin's compact signature, for either form of the address. */
export const BITCOIN_CASH_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ "bitcoin-cash": offer, "bitcoin-cash-coin-type-0": offer }),
  new Map<MessageSigningFormat, MessageFormatText>([
    [
      "bitcoin-cash-compact",
      {
        label: "Bitcoin Cash compact P2PKH (Bitcoin's message format)",
        output,
        notes: [SAME_AS_BITCOIN],
        compact: true,
      },
    ],
  ]),
);
