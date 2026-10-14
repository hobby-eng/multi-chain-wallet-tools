import packageManifest from "../package.json" with { type: "json" };
import { PRODUCT_FACTS } from "./project-metadata.mjs";

/** User-visible protocol copy follows the actual selected coins, not the edition's maximum. */
export class ToolProtocolFooter {
  #coins;

  constructor(profile, selection) {
    this.#coins = new Set(
      selection?.coins ??
        (profile.id === "dash-community" ? ["dash"] : PRODUCT_FACTS.multiChainCoinIds),
    );
  }

  render(toolId) {
    const selected = (copy) =>
      Object.entries(copy)
        .filter(([coin]) => this.#coins.has(coin))
        .map(([, text]) => text)
        .join(" · ");
    if (toolId === "key-derivation")
      return `BIP39 · BIP32 · ${selected({
        bitcoin: "Bitcoin",
        ethereum: "Ethereum",
        dash: "Dash Core · Platform · Identity · Orchard",
      })}`;
    if (toolId === "psbt-inspector")
      return selected({
        bitcoin: "BIP-174 · BIP-370 · BIP-371 · BIP-373 · P2SH/P2WSH · Taproot · MuSig2 · CLTV/CSV",
        dash: "Dash Core PSBT · P2SH · multisig · hashlocks · CLTV/CSV",
      });
    if (toolId === "discovery-scanner")
      return selected({
        bitcoin: "Bitcoin BIP44/BIP49/BIP84/BIP86 public discovery",
        ethereum: "Ethereum EOA account discovery",
        dash: `Dash Core BIP44 · Platform DIP17/DIP18 · Identity DIP13 · Dash Orchard ZIP-32 · Evo SDK ${packageManifest.dependencies["@dashevo/evo-sdk"]}`,
      });
    throw new Error(`No protocol footer for ${toolId}.`);
  }
}
