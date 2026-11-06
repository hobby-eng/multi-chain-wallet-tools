// The coins whose addresses the Deriver's wallet questions compare, and the words MnemoCode's menu
// uses for them; MnemoCode reads the coin from the address. The full build offers every coin of
// its MnemoCode file (OFFERED_COIN_IDS undefined here). A selective build with fewer coins, and the
// Dash Community Edition, get a generated module of their own coins in place of this one
// (tooling/key-derivation-composition.mjs), as the owner chose on 2026-10-07, so that it offers,
// and names, no coin it leaves out.
export const OFFERED_COIN_IDS: readonly string[] | undefined = undefined;

/** The name and address forms of each coin of MnemoCode's full file, as its menu words them. */
export const COIN_WORDS: Readonly<
  Record<string, { readonly name: string; readonly addressForms: string }>
> = Object.freeze({
  bitcoin: { name: "Bitcoin", addressForms: "1…, 3…, bc1q… or bc1p…" },
  "bitcoin-cash": { name: "Bitcoin Cash", addressForms: "bitcoincash:q… or 1…" },
  cosmos: { name: "Cosmos", addressForms: "cosmos1…" },
  dash: { name: "Dash", addressForms: "X… or dash1k…" },
  dogecoin: { name: "Dogecoin", addressForms: "D…" },
  ethereum: { name: "Ethereum and EVM networks", addressForms: "0x…" },
  "ethereum-classic": { name: "Ethereum Classic", addressForms: "0x…" },
  injective: { name: "Injective", addressForms: "inj1…" },
  litecoin: { name: "Litecoin", addressForms: "L…, M…, 3… or ltc1q…" },
  tron: { name: "Tron", addressForms: "T…" },
  xrp: { name: "XRP", addressForms: "r…" },
  zcash: { name: "Zcash", addressForms: "t1…" },
});
