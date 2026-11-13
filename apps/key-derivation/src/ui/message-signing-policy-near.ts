import { NEP413_INPUTS, admitNep413Inputs } from "@ckd/coins/near/message-signing-nep413.js";
import { TableMessageSigningPolicy } from "./message-signing-policy.js";

/** Decision D8: the implicit account, and the network for a named one. */
const ACCOUNT_NOTE =
  "The response names this key's implicit account. A named account (name.near) that holds the key is checked only on the network, as near-api-js's verifyMessage does, which also requires a full-access key.";

/** NEAR's offer: NEP-413's signMessage for its implicit account, with the payload's fields. */
export const NEAR_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ near: { fields: ["address"], formats: ["near-nep413"] } }),
  new Map([
    [
      "near-nep413",
      {
        label: "NEAR NEP-413 signMessage",
        output: "Signed message (JSON: accountId, publicKey, signature)",
        notes: [ACCOUNT_NOTE],
        inputs: [
          {
            key: NEP413_INPUTS.recipient,
            label: "Recipient",
            help: "Who the message is for, such as the app's domain or account.",
          },
          {
            key: NEP413_INPUTS.nonce,
            label: "Nonce",
            help: "32 random bytes in hex, new each time the dialog opens. To answer a service's challenge, enter its nonce, in hex or Base64.",
            initial: "nonce",
          },
          {
            key: NEP413_INPUTS.callbackUrl,
            label: "Callback URL (optional)",
            help: "Signed only when the service gives one.",
            optional: true,
          },
        ],
        check: (_message: string, inputs: Readonly<Record<string, string>>) =>
          admitNep413Inputs(inputs),
      },
    ],
  ]),
);
