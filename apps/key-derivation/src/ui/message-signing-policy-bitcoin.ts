import type { MessageSigningFormat } from "../workers/protocol.js";
import {
  BASE64_SIGNATURE as OUTPUT,
  type MessageFormatText,
  type MessageSigningPolicy,
} from "./message-signing-policy.js";

const CHOICE_NOTE =
  "BIP-322 is the current general-purpose Bitcoin message-signing standard. Use compact BIP137 only for software that does not support BIP-322.";

/** Each Bitcoin address type's BIP-322 format; only legacy P2PKH also offers the compact one. */
const OFFERS: Readonly<Record<string, readonly MessageSigningFormat[]>> = Object.freeze({
  "bitcoin-legacy": Object.freeze(["bitcoin-bip322-legacy", "bitcoin-compact"] as const),
  "bitcoin-nested-segwit": Object.freeze(["bitcoin-bip322-nested"] as const),
  "bitcoin-native-segwit": Object.freeze(["bitcoin-bip322-native"] as const),
  "bitcoin-taproot": Object.freeze(["bitcoin-bip322-taproot"] as const),
});

const TEXTS: ReadonlyMap<unknown, MessageFormatText> = new Map<
  MessageSigningFormat,
  MessageFormatText
>([
  [
    "bitcoin-compact",
    {
      label: "Bitcoin compact P2PKH (BIP137)",
      output: OUTPUT,
      notes: [CHOICE_NOTE],
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

/** Bitcoin's offers: BIP-322 for each address type, and the compact signature for P2PKH. */
export class BitcoinMessageSigningPolicy implements MessageSigningPolicy {
  /** The row's own address signs; the result's address type selects its formats. */
  offer(resultId: string, addressKey: string): readonly MessageSigningFormat[] {
    if (addressKey !== "address" || !Object.hasOwn(OFFERS, resultId)) return [];
    return OFFERS[resultId] ?? [];
  }
  /** Texts only for formats this coin offers. */
  describe(format: unknown): MessageFormatText | undefined {
    return TEXTS.get(format);
  }
}

/** The stateless Bitcoin policy used by the edition's browser binding. */
export const BITCOIN_MESSAGE_SIGNING_POLICY = new BitcoinMessageSigningPolicy();
