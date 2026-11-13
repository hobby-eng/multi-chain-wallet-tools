import { admitSolanaOffchainLength } from "@ckd/coins/solana/message-signing-offchain.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import { TableMessageSigningPolicy, type MessageFormatText } from "./message-signing-policy.js";

const output = "Signature (Base58)";
const RAW_NOTE =
  "Phantom, Solflare and other Solana wallets sign a message's bytes as they are (signMessage). The signature is in Base58, as Solana writes signatures.";
const OFFCHAIN_NOTE =
  "The off-chain message (version 0) that the Solana CLI's sign-offchain-message writes and verify-offchain-signature checks. Its newer version 1 is not offered.";

/** Both variants' addresses sign raw bytes by default, or the CLI's off-chain message. */
const offer = Object.freeze({
  fields: ["address"],
  formats: ["solana-raw", "solana-offchain-v0"] as const,
});

/** Solana's offers: the wallets' signMessage and the CLI's off-chain message. */
export const SOLANA_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ solana: offer, "solana-ledger": offer }),
  new Map<MessageSigningFormat, MessageFormatText>([
    ["solana-raw", { label: "Solana signMessage (raw bytes)", output, notes: [RAW_NOTE] }],
    [
      "solana-offchain-v0",
      {
        label: "Solana off-chain message (version 0)",
        output,
        notes: [OFFCHAIN_NOTE],
        check: (message) => admitSolanaOffchainLength(new TextEncoder().encode(message).length),
      },
    ],
  ]),
);
