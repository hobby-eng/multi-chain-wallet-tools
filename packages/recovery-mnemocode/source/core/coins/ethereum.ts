// Ethereum and every EVM network: the account is the last 20 bytes of the Keccak-256 of the public
// key, written "0x" and 40 hexadecimal digits with the EIP-55 checksum. A module of its own, so that
// a host of Ethereum alone takes no other coin of these accounts (evm.ts reuses its reader).
//
// Host-neutral: it imports only coin.ts, keccak-account.ts, other-forms.ts, @scure/base and
// @noble/hashes (test/portable-modules.test.ts).

import { keccak_256 } from "@noble/hashes/sha3.js";
import { hex, utf8 } from "@scure/base";
import { Coin, invalidAddress, type CoinAddress } from "./coin.js";
import { KECCAK_RULES } from "./keccak-account.js";
import { hexAccountDigits, isHexAccount, HEX_ACCOUNT_DIGITS } from "./other-forms.js";

/** EIP-55: a letter is a capital where the matching digit of the hash is 8 or more. */
const EIP55_CAPITAL_FROM = 8;

/** A coin of Ethereum-style addresses. */
export class HexCoin extends Coin {
  /** In mixed case the capitals are the EIP-55 checksum, which must hold; in one case there is none. */
  protected read(text: string): CoinAddress {
    const digits = hexAccountDigits(text);
    if (digits === undefined) throw this.notOurs();
    if (!isHexAccount(digits))
      throw invalidAddress(`it is not ${HEX_ACCOUNT_DIGITS} hexadecimal digits after 0x`);
    const account = hex.decode(digits.toLowerCase());
    const checksummed = eip55(account);
    if (/[a-f]/u.test(digits) && /[A-F]/u.test(digits) && digits !== checksummed)
      throw invalidAddress("its EIP-55 checksum, the mix of capital and small letters, is wrong");
    return this.address("keccak", account, `0x${checksummed}`);
  }
}

/** The 40 hexadecimal digits of `account` with the EIP-55 checksum. */
function eip55(account: Uint8Array): string {
  const lowercase = hex.encode(account);
  const hash = keccak_256(utf8.decode(lowercase));
  return [...lowercase]
    .map((character, position) => {
      const byte = hash[position >> 1]!;
      const digit = position % 2 === 0 ? byte >> 4 : byte & 0x0f;
      return digit >= EIP55_CAPITAL_FROM ? character.toUpperCase() : character;
    })
    .join("");
}

export const ETHEREUM = new HexCoin({
  id: "ethereum",
  name: "Ethereum and EVM networks",
  addressForms: "0x…",
  coinTypes: [60],
  ...KECCAK_RULES,
});
