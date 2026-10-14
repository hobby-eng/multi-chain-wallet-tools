import { DerivationPathProfile } from "../../derivation-path.js";

/** Ethereum's BIP44 coin type is chain-independent. */
export const ETHEREUM_PATHS = /* @__PURE__ */ new DerivationPathProfile(
  ({ account }) => `m/44'/60'/${account}'`,
);
