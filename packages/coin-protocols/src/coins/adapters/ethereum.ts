import {
  ADDRESS_BRANCH_CONTROL,
  hexAddressesEqual,
  TRANSPARENT_ROLES,
  type CoinAdapter,
} from "../registry-base.js";
import { ETHEREUM_PATHS } from "../ethereum/profiles.js";

export const ETHEREUM_COIN_ADAPTERS: readonly CoinAdapter[] = [
  {
    id: "ethereum",
    group: "Ethereum",
    fixedPathLabels: ["Purpose", "Coin type"],
    label: "Ethereum EOA · BIP44",
    variantLabel: "EOA · BIP44",
    defaultVariant: true,
    networkControl: false,
    branchControl: ADDRESS_BRANCH_CONTROL,
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    addressesEqual: hexAddressesEqual,
    pathPreview: (input) => ETHEREUM_PATHS.pathPreview(input),
  },
] as const;
