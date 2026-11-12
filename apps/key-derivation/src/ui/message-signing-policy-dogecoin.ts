import { BASE64_SIGNATURE as output, TableMessageSigningPolicy } from "./message-signing-policy.js";

/** Dogecoin's offer: Dogecoin Core's compact signature of its P2PKH address. */
export const DOGECOIN_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ dogecoin: { fields: ["address"], formats: ["dogecoin-compact"] } }),
  new Map([
    [
      "dogecoin-compact",
      { label: "Dogecoin Core compact P2PKH", output, notes: [], compact: true },
    ],
  ]),
);
