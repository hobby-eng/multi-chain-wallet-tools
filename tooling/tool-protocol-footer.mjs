import packageManifest from "../package.json" with { type: "json" };
import { orderCoins } from "../packages/coin-protocols/src/coins/coin-order.ts";
import { ACCOUNT_COIN_GROUP, ACCOUNT_COINS } from "./account-coins.mjs";
import { EVM_NETWORK_GROUP, EVM_NETWORKS } from "./evm-networks.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

/** The coins a build includes: the selected ones, else all of its edition. */
export function selectedCoins(profile, selection) {
  return new Set(
    selection?.coins ??
      // Every coin any tool has; each tool's copy names only its own.
      (profile.id === "dash-community"
        ? ["dash"]
        : Object.values(TOOL_MANIFESTS).flatMap(({ coins }) => coins)),
  );
}

/** User-visible protocol copy follows the actual selected coins, not the edition's maximum. */
export class ToolProtocolFooter {
  #coins;

  constructor(profile, selection) {
    this.#coins = selectedCoins(profile, selection);
  }

  render(toolId) {
    // Each part names its coin first; the parts come in the coin lists' order (coin-order.ts).
    const selected = (copy) =>
      orderCoins(
        Object.entries(copy).filter(([coin]) => this.#coins.has(coin)),
        ([, text]) => text,
      )
        .map(([, text]) => text)
        .join(" · ");
    if (toolId === "key-derivation")
      return `BIP39 · BIP32 · ${selected({
        bitcoin: "Bitcoin",
        ethereum: "Ethereum and EVM networks",
        dash: "Dash Core · Platform · Identity · Orchard",
        litecoin: "Litecoin",
        dogecoin: "Dogecoin",
        "bitcoin-cash": "Bitcoin Cash",
        zcash: "Zcash transparent",
        xrp: "XRP",
        tron: "Tron",
        "ethereum-classic": "Ethereum Classic",
        cosmos: "Cosmos",
        injective: "Injective",
        solana: "Solana",
        stellar: "Stellar",
        near: "NEAR",
        hedera: "Hedera",
        ton: "TON",
      })}`;
    if (toolId === "psbt-inspector")
      // Bitcoin's part does not begin with its name, so the parts are ordered by their coins' names.
      return orderCoins(
        [
          {
            coin: "bitcoin",
            name: "Bitcoin",
            text: "BIP-174 · BIP-370 · BIP-371 · BIP-373 · P2SH/P2WSH · Taproot · MuSig2 · CLTV/CSV",
          },
          {
            coin: "dash",
            name: "Dash",
            text: "Dash Core PSBT · P2SH · multisig · hashlocks · CLTV/CSV",
          },
        ].filter(({ coin }) => this.#coins.has(coin)),
        ({ name }) => name,
      )
        .map(({ text }) => text)
        .join(" · ");
    if (toolId === "discovery-scanner") {
      const labels = (rows) =>
        orderCoins(
          rows.filter(({ id }) => this.#coins.has(id)),
          ({ label }) => label,
        ).map(({ label }) => label);
      const evm = labels(EVM_NETWORKS);
      const accounts = labels(ACCOUNT_COINS);
      // The parts in the order of the Scanner's coin menu, a group of coins by the group's name.
      const parts = [
        {
          name: "Bitcoin",
          text: selected({ bitcoin: "Bitcoin BIP44/BIP49/BIP84/BIP86 public discovery" }),
        },
        {
          name: EVM_NETWORK_GROUP,
          text: evm.length === 0 ? "" : `EVM EOA account discovery: ${evm.join(", ")}`,
        },
        {
          name: "Dash",
          text: selected({
            dash: `Dash Core BIP44 · Platform DIP17/DIP18 · Identity DIP13 · Dash Orchard ZIP-32 · Evo SDK ${packageManifest.dependencies["@dashevo/evo-sdk"]}`,
          }),
        },
        {
          name: ACCOUNT_COIN_GROUP,
          text: accounts.length === 0 ? "" : `Account balance discovery: ${accounts.join(", ")}`,
        },
      ];
      return orderCoins(parts, ({ name }) => name)
        .map(({ text }) => text)
        .filter(Boolean)
        .join(" · ");
    }
    throw new Error(`No protocol footer for ${toolId}.`);
  }
}
