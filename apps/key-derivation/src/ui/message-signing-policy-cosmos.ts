import { TableMessageSigningPolicy } from "./message-signing-policy.js";
import { adr036Text } from "./message-signing-policy-adr036.js";

/** The Cosmos Hub's offer: Keplr's ADR-036 for its cosmos1 address. */
export const COSMOS_MESSAGE_SIGNING_POLICY = new TableMessageSigningPolicy(
  Object.freeze({ cosmos: { fields: ["address"], formats: ["cosmos-adr036"] } }),
  new Map([["cosmos-adr036", adr036Text("Cosmos signArbitrary (ADR-036)")]]),
);
