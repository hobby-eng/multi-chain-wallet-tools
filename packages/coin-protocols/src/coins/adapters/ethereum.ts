import {
  indexRange,
  TRANSPARENT_ROLES,
  type BranchControl,
  type CoinAdapter,
} from '../registry-base.js';

const ETHEREUM_ADDRESS_BRANCH_CONTROL: BranchControl = {
  label: 'Address branch',
  max: 1,
  options: [
    { value: 0, label: '0 — common EOA path' },
    { value: 1, label: '1 — alternate path' },
  ],
};

export const ETHEREUM_COIN_ADAPTERS: readonly CoinAdapter[] = [{
  id: 'ethereum',
  group: 'Ethereum',
  label: 'Ethereum EOA · BIP44',
  variantLabel: 'EOA · BIP44',
  defaultVariant: true,
  networkControl: false,
  branchControl: ETHEREUM_ADDRESS_BRANCH_CONTROL,
  defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
  fieldRoles: TRANSPARENT_ROLES,
  addressesEqual: (derived, expected) => derived.toLowerCase() === expected.toLowerCase(),
  pathPreview: ({ account, branch, start, count }) =>
    `m/44'/60'/${account}'/${branch}/${indexRange(start, count)}`,
}] as const;
