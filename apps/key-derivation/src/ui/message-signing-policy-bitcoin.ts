import type { MessageSigningFormat } from "../workers/protocol.js";
import type { MessageSigningPolicy } from "./message-signing-policy.js";

/** Bitcoin's offered labels and result-specific legacy choice. */
export class BitcoinMessageSigningPolicy implements MessageSigningPolicy {
  /** The result address type selects the default BIP-322 format. */
  format(resultId: string): MessageSigningFormat | null {
    if (resultId === "bitcoin-legacy") return "bitcoin-bip322-legacy";
    if (resultId === "bitcoin-nested-segwit") return "bitcoin-bip322-nested";
    if (resultId === "bitcoin-native-segwit") return "bitcoin-bip322-native";
    if (resultId === "bitcoin-taproot") return "bitcoin-bip322-taproot";
    return null;
  }
  /** Labels only formats this coin offers. */
  label(format: unknown): string {
    if (format === "bitcoin-compact") return "Bitcoin compact P2PKH (BIP137)";
    if (format === "bitcoin-bip322-legacy") return "Bitcoin BIP-322 full · P2PKH";
    if (format === "bitcoin-bip322-nested") return "Bitcoin BIP-322 full · P2SH-P2WPKH";
    if (format === "bitcoin-bip322-native") return "Bitcoin BIP-322 simple · P2WPKH";
    if (format === "bitcoin-bip322-taproot") return "Bitcoin BIP-322 simple · P2TR";
    return "";
  }
  /** Only legacy P2PKH offers a compact-signature alternative. */
  allowsLegacyChoice(resultId: string): boolean {
    return resultId === "bitcoin-legacy";
  }
  /** An arbitrary selector value never changes the active address mode. */
  choose(resultId: string, selection: unknown): MessageSigningFormat | null {
    const format = this.format(resultId);
    if (format !== null && selection === format) return format;
    return this.allowsLegacyChoice(resultId) && selection === "bitcoin-compact"
      ? "bitcoin-compact"
      : null;
  }
}

/** The stateless Bitcoin policy used by the edition's browser binding. */
export const BITCOIN_MESSAGE_SIGNING_POLICY = new BitcoinMessageSigningPolicy();
