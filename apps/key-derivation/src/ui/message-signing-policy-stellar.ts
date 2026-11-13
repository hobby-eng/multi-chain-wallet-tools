import { BASE64_SIGNATURE as output, TableMessageSigningPolicy } from "./message-signing-policy.js";

const SEP53_NOTE =
  "SEP-53: Freighter, the Stellar SDKs and stellar-cli verify this signature. It proves this account ID's key, not an account that also has other signers.";

/** Stellar's offer: SEP-53 for its account ID. */
export const STELLAR_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ stellar: { fields: ["address"], formats: ["stellar-sep53"] } }),
  new Map([
    ["stellar-sep53", { label: "Stellar SEP-53 signed message", output, notes: [SEP53_NOTE] }],
  ]),
);
