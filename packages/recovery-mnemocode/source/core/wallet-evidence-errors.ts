import { ErrorCatalog } from "./error-catalog.js";

/** Stable refusal codes and default messages owned by this module. */
export const ERRORS = new ErrorCatalog("core.wallet-evidence", {
  "address-not-valid-bitcoin": (value0: string) =>
    `The address is not valid for Bitcoin ${value0}.`,
  "address-not-valid-bitcoin-address": (value0: string, value1: string) =>
    `The address is not valid for Bitcoin ${value0}; it is a ${value1} address.`,
  "only-address-address-another-coin-compressed-public-key": () =>
    "Only an address, an address of another coin, a compressed public key or a WIF is compared with several addresses.",
  "unsupported-bitcoin-evidence-kind": () => "Unsupported Bitcoin evidence kind.",
  "unable-derive-private-key-wif-comparison": () =>
    "Unable to derive the private key for WIF comparison.",
  "bitcoin-network": (value0: string) => `Bitcoin network must be ${value0}.`,
  "at-least-one-bitcoin-address-profile-selected": () =>
    "At least one Bitcoin address profile must be selected.",
  "unknown-bitcoin-address-profile": () => "Unknown Bitcoin address profile.",
  "compressed-public-key-exactly-bytes-encoded-as-hexadecimal": (value0: string, value1: string) =>
    `A compressed public key must be exactly ${value0} bytes encoded as ${value1} hexadecimal characters.`,
  "compressed-public-key-start-02-03": () => "A compressed public key must start with 02 or 03.",
  "compressed-public-key-not-point-secp256k1-curve": () =>
    "The compressed public key is not a point of the secp256k1 curve.",
  "wif-not-valid-bitcoin": (value0: string) => `The WIF is not valid for Bitcoin ${value0}.`,
  "wif-holds-no-valid-secp256k1-private-key": () => "The WIF holds no valid secp256k1 private key.",
  "unsupported-extended-key-prefix-supported-public-forms-include": (value0: string) =>
    `Unsupported extended-key prefix. Supported public forms include ${value0}.`,
  "extended-key-prefix-does-not-match-selected-bitcoin": () =>
    "The extended-key prefix does not match the selected Bitcoin network.",
  "extended-public-key-not-valid": () => "The extended public key is not valid.",
});
