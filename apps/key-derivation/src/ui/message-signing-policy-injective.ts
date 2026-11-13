import type { MessageSigningFormat } from "../workers/protocol.js";
import {
  HEX_RSV_SIGNATURE,
  TableMessageSigningPolicy,
  type MessageFormatText,
} from "./message-signing-policy.js";
import { adr036Text } from "./message-signing-policy-adr036.js";

const KECCAK_NOTE =
  "Injective signs Keccak-256 of the document, as Keplr does for an Ethermint chain; a Cosmos verifier that hashes it with SHA-256 refuses it.";
const EVM_FORM_NOTE =
  "MetaMask's form, as injective-ts's EVM wallets sign: the same signature as Ethereum's personal_sign for the 0x form of this address, which Advanced mode shows.";

/** Injective's offers: Keplr's ADR-036 by default (decision D6), then EIP-191. */
export const INJECTIVE_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({
    injective: { fields: ["address"], formats: ["injective-adr036", "injective-eip191"] },
  }),
  new Map<MessageSigningFormat, MessageFormatText>([
    [
      "injective-adr036",
      adr036Text("Injective signArbitrary (ADR-036, Keccak-256)", [KECCAK_NOTE]),
    ],
    [
      "injective-eip191",
      {
        label: "Injective personal_sign (EIP-191)",
        output: HEX_RSV_SIGNATURE,
        notes: [EVM_FORM_NOTE],
      },
    ],
  ]),
);
