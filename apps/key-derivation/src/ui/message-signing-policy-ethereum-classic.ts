import {
  HEX_RSV_SIGNATURE as output,
  TableMessageSigningPolicy,
} from "./message-signing-policy.js";
import { EVM_SAME_SIGNATURE, UTF8_TEXT } from "./message-signing-policy-evm.js";

/** Ethereum Classic's offer: EIP-191 personal_sign for its rows at coin type 61. */
export const ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({
    "ethereum-classic": { fields: ["address"], formats: ["ethereum-classic-eip191"] },
  }),
  new Map([
    [
      "ethereum-classic-eip191",
      {
        label: "Ethereum Classic personal_sign (EIP-191)",
        output,
        notes: [EVM_SAME_SIGNATURE, UTF8_TEXT],
      },
    ],
  ]),
);
