// What the page says once about every EIP-191 personal_sign signature, Ethereum's and Ethereum
// Classic's alike: shared by both coins' policies and built only with one of them.

/** The same signature proves the same 0x address on every EVM chain. */
export const EVM_SAME_SIGNATURE =
  "Ethereum, Ethereum Classic and every EVM network sign messages with these same bytes, and personal_sign carries no chain ID: EIP-155 covers transactions only. This signature is valid for this 0x address on all of them. Put the chain's name in the message if that matters.";

/** The page signs text, where MetaMask reads a 0x… message as bytes. */
export const UTF8_TEXT =
  "The message is signed as UTF-8 text, as eth-account and viem sign a string; MetaMask reads a message that starts with 0x as bytes instead.";
