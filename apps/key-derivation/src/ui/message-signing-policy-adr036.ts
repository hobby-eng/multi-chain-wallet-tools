// What the page says once about every ADR-036 signature, Cosmos's and Injective's alike: shared by
// both coins' policies and built only with one of them.
import { admitAdr036Message } from "@ckd/coins/message-signing-adr036.js";
import { ROW_PUBLIC_KEY_INPUT } from "@ckd/coins/message-signing-secp256k1.js";
import type { MessageFormatText } from "./message-signing-policy.js";

const ADR036_NOTE =
  "Keplr's signArbitrary (ADR-036, a Draft that the Cosmos SDK does not implement), which Keplr's verifyArbitrary checks. The signature names this address in what it signs; a verifier needs the public key, which the response carries.";

/** The texts of an ADR-036 format named `label`, with the coin's own `notes` after the shared one. */
export function adr036Text(label: string, notes: readonly string[] = []): MessageFormatText {
  return {
    label,
    output: "Signature (JSON: pub_key, signature)",
    notes: [ADR036_NOTE, ...notes],
    // ADR-036 writes r and s without a recovery id: verification checks the row's own key.
    rowInputs: [ROW_PUBLIC_KEY_INPUT],
    check: (message: string) => admitAdr036Message(message),
  };
}
