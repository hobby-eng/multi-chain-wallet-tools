import {
  HEX_RSV_SIGNATURE as output,
  TableMessageSigningPolicy,
} from "./message-signing-policy.js";
import { EVM_SAME_SIGNATURE, UTF8_TEXT } from "./message-signing-policy-evm.js";

/** Ethereum's offer: EIP-191 personal_sign for its EOA row, valid on every EVM network. */
export const ETHEREUM_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ ethereum: { fields: ["address"], formats: ["ethereum-eip191"] } }),
  new Map([
    [
      "ethereum-eip191",
      {
        label: "Ethereum personal_sign (EIP-191), every EVM network",
        output,
        notes: [EVM_SAME_SIGNATURE, UTF8_TEXT],
      },
    ],
  ]),
);
