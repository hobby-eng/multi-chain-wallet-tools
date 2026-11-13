import {
  cardanoSigningAddress,
  isCardanoMainnetAddress,
  isCardanoScriptOrPointerAddress,
} from "@ckd/coins/cardano/address.js";
import { CARDANO_PROFILES, CARDANO_ROLES } from "@ckd/coins/cardano/profiles.js";
import { UnsearchableAddressError, type MatcherCoin } from "./matcher-targets.js";
import type { TargetBranches } from "./matcher-types.js";

/**
 * Cardano's part of the Wallet Matcher: a mainnet address of keys (CIP-19), in bech32 of one case
 * and kept in lowercase, under each of Cardano's variants. Icarus and Icarus-Trezor derive from
 * the phrase's CIP-3 roots and Ledger from BIP39's seed, which the Matcher's seed readers give
 * each one. A base or enterprise address (addr1…) is a payment key's: its rows are role 0's, and
 * role 1's when change addresses are searched. A reward address (stake1…) is a stake key's,
 * compared with the address of role 2's rows. A base address is compared whole, so one whose
 * stake key is another wallet's is not found. A mainnet address of a script or a pointer is
 * refused, since no row shows one, and so is a malformed one, whose header, length and prefix
 * form no address; a testnet address is not recognized. Cardano gives other coins' addresses no
 * profile, since its rows show only Cardano's.
 */
const ADAPTERS = CARDANO_PROFILES.map((profile) => profile.adapterId);
const PAYMENT_ROLES: TargetBranches = Object.freeze({
  receive: [CARDANO_ROLES.external],
  change: [CARDANO_ROLES.internal],
});
const STAKE_ROLE: TargetBranches = Object.freeze({ receive: [CARDANO_ROLES.staking], change: [] });
/** The field of a stake key's row that holds its reward address. */
const REWARD_FIELD = Object.freeze(["address"]);

export const CARDANO_MATCHER: MatcherCoin = {
  recognize: (value, network) => {
    if (network !== "mainnet" || !isCardanoMainnetAddress(value)) return null;
    const normalized = value.toLowerCase();
    const address = cardanoSigningAddress(normalized);
    if (address === undefined)
      throw new UnsearchableAddressError(
        isCardanoScriptOrPointerAddress(normalized)
          ? "a Cardano address of a script or a pointer, which no key of a recovery phrase derives."
          : "a malformed Cardano address: its header, length and prefix form no address of CIP-19.",
      );
    return {
      input: value,
      network,
      normalized,
      adapterIds: ADAPTERS,
      ...(address.kind === "reward"
        ? { fieldKeys: REWARD_FIELD, branches: STAKE_ROLE }
        : { branches: PAYMENT_ROLES }),
    };
  },
  addressAdapters: [],
};
