/** DIP17 assigns hardened key classes; these are not BIP44's non-hardened branches. */
export const DIP17_PAYMENT_CHAINS = [
  { keyClass: 0, label: 'Receive' },
  { keyClass: 1, label: 'Internal / change' },
] as const;
