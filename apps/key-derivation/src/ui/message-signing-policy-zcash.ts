import { BASE64_SIGNATURE as output, TableMessageSigningPolicy } from "./message-signing-policy.js";

const TRANSPARENT_NOTE =
  "Transparent t1 addresses only: shielded addresses have no message-signing standard.";

/** Zcash's offer: zcashd's compact signature of its transparent t1 address. */
export const ZCASH_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ zcash: { fields: ["address"], formats: ["zcash-compact"] } }),
  new Map([
    [
      "zcash-compact",
      { label: "Zcash compact t1 P2PKH", output, notes: [TRANSPARENT_NOTE], compact: true },
    ],
  ]),
);
