/**
 * BIP32 extended-key version bytes this tool uses for Ethereum, regardless of
 * the selected network: Ethereum has no separate testnet xpub convention in
 * common wallet software, so both mainnet and Sepolia use the same
 * mainnet-style Bitcoin version bytes many EVM wallets already share.
 */
export const ETHEREUM_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e } as const;

export function formatEther(wei: bigint): string {
  const unit = 1_000_000_000_000_000_000n;
  const whole = wei / unit;
  const fraction = (wei % unit).toString().padStart(18, '0').replace(/0+$/u, '');
  return `${whole.toLocaleString('en-US')}${fraction.length > 0 ? `.${fraction}` : ''} ETH`;
}
