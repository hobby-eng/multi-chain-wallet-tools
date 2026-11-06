import { hexToBytes, wipe } from "@ckd/core/crypto.js";
import { signCompactP2pkhMessage } from "@ckd/core/compact-message.js";
import type { ResultField } from "@ckd/core/types.js";
import type { MessageSigningFormat } from "./protocol.js";
import { signBip322Message } from "./bip322-signer.js";
import { Bip322Signing } from "@ckd/core/bip322-signing.js";

export async function signDerivedMessage(
  privateKeyHex: string,
  address: string,
  message: string,
  network: "mainnet" | "testnet",
  format: MessageSigningFormat,
  fields: readonly ResultField[],
) {
  if (format === "bitcoin-compact" || format === "dash-compact") {
    const privateKey = hexToBytes(privateKeyHex);
    try {
      return signCompactP2pkhMessage(
        privateKey,
        address,
        message,
        format === "bitcoin-compact" ? "bitcoin" : "dash",
        network,
      );
    } finally {
      wipe(privateKey);
    }
  }
  return signBip322Message(
    privateKeyHex,
    address,
    message,
    network,
    Bip322Signing.mode(format),
    fields.find((field) => field.key === "scriptPubKey")?.value ?? "",
    fields.find((field) => field.key === "redeemScript")?.value,
    fields.find((field) => field.key === "internalPublicKey")?.value,
  );
}
