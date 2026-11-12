import {
  HEX_RSV_SIGNATURE as output,
  TableMessageSigningPolicy,
} from "./message-signing-policy.js";

const V2_NOTE =
  "TronLink and TronWeb's verifyMessageV2 verify this signature. TronWeb's deprecated hex-only signMessage is not offered.";

/** Tron's offer: TronWeb's signMessageV2 (TIP-191) for its T… address. */
export const TRON_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ tron: { fields: ["address"], formats: ["tron-tip191"] } }),
  new Map([["tron-tip191", { label: "Tron signMessageV2 (TIP-191)", output, notes: [V2_NOTE] }]]),
);
