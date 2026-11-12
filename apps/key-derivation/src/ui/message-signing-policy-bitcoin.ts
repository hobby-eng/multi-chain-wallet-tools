import type { MessageSigningFormat } from "../workers/protocol.js";
import {
  BASE64_SIGNATURE as OUTPUT,
  TableMessageSigningPolicy,
  type MessageFormatText,
} from "./message-signing-policy.js";

const CHOICE_NOTE =
  "BIP-322 is the current general-purpose Bitcoin message-signing standard. Use compact BIP137 only for software that does not support BIP-322.";
/** The mirror of Bitcoin Cash's note: both chains sign with Bitcoin's message format. */
const SAME_AS_BITCOIN_CASH =
  "Bitcoin Cash uses the same message format: this signature is also valid for the Bitcoin Cash address of the same key. Put the chain's name in the message if that matters.";

/** The row's own address of each type signs in BIP-322; only legacy P2PKH also offers compact. */
const offer = (...formats: MessageSigningFormat[]) => ({ fields: ["address"], formats });
const OFFERS = Object.freeze({
  "bitcoin-legacy": offer("bitcoin-bip322-legacy", "bitcoin-compact"),
  "bitcoin-nested-segwit": offer("bitcoin-bip322-nested"),
  "bitcoin-native-segwit": offer("bitcoin-bip322-native"),
  "bitcoin-taproot": offer("bitcoin-bip322-taproot"),
});

const TEXTS = new Map<MessageSigningFormat, MessageFormatText>([
  [
    "bitcoin-compact",
    {
      label: "Bitcoin compact P2PKH (BIP137)",
      output: OUTPUT,
      notes: [CHOICE_NOTE, SAME_AS_BITCOIN_CASH],
      compact: true,
    },
  ],
  [
    "bitcoin-bip322-legacy",
    { label: "Bitcoin BIP-322 full · P2PKH", output: OUTPUT, notes: [CHOICE_NOTE] },
  ],
  [
    "bitcoin-bip322-nested",
    { label: "Bitcoin BIP-322 full · P2SH-P2WPKH", output: OUTPUT, notes: [] },
  ],
  [
    "bitcoin-bip322-native",
    { label: "Bitcoin BIP-322 simple · P2WPKH", output: OUTPUT, notes: [] },
  ],
  ["bitcoin-bip322-taproot", { label: "Bitcoin BIP-322 simple · P2TR", output: OUTPUT, notes: [] }],
]);

/** The stateless Bitcoin policy used by the edition's browser binding. */
export const BITCOIN_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(OFFERS, TEXTS);
