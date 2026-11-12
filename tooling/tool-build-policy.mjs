import { isAccountCoin } from "./account-coins.mjs";
import { messageSigningCoinsOf } from "./message-signing-coins.mjs";
import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

class InvalidBuildSelection extends Error {}

/** Whether any of `coins` signs messages (tooling/message-signing-coins.mjs). */
function signsMessages(coins) {
  return messageSigningCoinsOf((coin) => coins.includes(coin)).length > 0;
}

/** Owns profile, coin and feature legality for parsers and matrix planning. */
export class ToolBuildPolicy {
  #toolId;
  #profile;
  #definition;

  constructor(toolId, profile) {
    this.#definition = TOOL_MANIFESTS[toolId];
    if (this.#definition === undefined)
      throw new Error(`No selective-build definition exists for ${toolId}.`);
    this.#toolId = toolId;
    this.#profile = profile;
  }

  get definition() {
    return this.#definition;
  }

  normalize(names, option) {
    const coins = option === "--coins" || option === "--exclude-coins";
    const allowed = coins ? this.#definition.coins : this.#definition.features;
    const aliases =
      !coins && this.#toolId === "key-derivation"
        ? { matcher: "wallet-matcher", silent: "silent-payments" }
        : {};
    return names.map((name) => {
      const normalized = Object.hasOwn(aliases, name) ? aliases[name] : name;
      if (!allowed.includes(normalized))
        throw new InvalidBuildSelection(
          `Unknown ${option} value "${name}". Expected: ${allowed.join(", ")}.`,
        );
      return normalized;
    });
  }

  profileCoins() {
    return this.#profile.id === "dash-community" ? ["dash"] : this.#definition.coins;
  }

  coins(included = [], excluded = []) {
    included = this.normalize(included, "--coins");
    excluded = this.normalize(excluded, "--exclude-coins");
    const selected = new Set(included.length > 0 ? included : this.profileCoins());
    for (const coin of excluded) selected.delete(coin);
    this.#admitCoins([...selected]);
    return this.#definition.coins.filter((coin) => selected.has(coin));
  }

  #admitCoins(coins) {
    this.normalize(coins, "--coins");
    if (coins.length === 0)
      throw new InvalidBuildSelection(`Select at least one coin for ${this.#toolId}.`);
    if (this.#profile.id === "dash-community" && coins.some((coin) => coin !== "dash"))
      throw new InvalidBuildSelection(
        "Dash Community builds may include only Dash. Use --profile multi-chain for the general design.",
      );
  }

  defaultFeatures(coins) {
    return this.#definition.features.filter((feature) => {
      // Public-key scans need a coin that has them; an account coin has none.
      if (this.#toolId === "discovery-scanner" && feature === "watch-only-discovery")
        return !coins.every(isAccountCoin);
      if (this.#toolId !== "key-derivation") return true;
      if (feature === "silent-payments")
        return this.#profile.capabilities.bitcoinSilentPayments && coins.includes("bitcoin");
      if (feature === "message-signing") return signsMessages(coins);
      if (feature === "bip38-encrypt" || feature === "multisig")
        return coins.includes("bitcoin") || coins.includes("dash");
      return true;
    });
  }

  /**
   * The coins of `coins` that `features` can scan: a Discovery Scanner without seed-discovery
   * leaves out the account coins, which it scans from seed phrases only.
   */
  scannableCoins(coins, features) {
    if (this.#toolId !== "discovery-scanner" || features.includes("seed-discovery")) return coins;
    return coins.filter((coin) => !isAccountCoin(coin));
  }

  /**
   * The coins and features of a build's options: coins left to the profile's defaults drop those
   * the features cannot scan, while named coins are kept, so that a request the features cannot
   * serve is refused rather than shrunk.
   */
  select(includedCoins = [], excludedCoins = [], included = [], excluded = []) {
    const coins = this.coins(includedCoins, excludedCoins);
    const features = this.#chosenFeatures(coins, included, excluded);
    const selected = includedCoins.length > 0 ? coins : this.scannableCoins(coins, features);
    if (selected.length === 0)
      throw new InvalidBuildSelection(
        `No coin left for ${this.#toolId}: ${coins.join(", ")} ${coins.length === 1 ? "is" : "are"} scanned from seed phrases only, which needs the seed-discovery feature.`,
      );
    this.admit(selected, features);
    return { coins: selected, features };
  }

  features(coins, included = [], excluded = []) {
    const ordered = this.#chosenFeatures(coins, included, excluded);
    this.admit(coins, ordered);
    return ordered;
  }

  /** The features `included` names, else the profile's defaults, without those `excluded` names. */
  #chosenFeatures(coins, included, excluded) {
    included = this.normalize(included, "--features");
    excluded = this.normalize(excluded, "--exclude");
    const selected = new Set(included.length > 0 ? included : this.defaultFeatures(coins));
    for (const feature of excluded) selected.delete(feature);
    // Implicit card export follows MnemoCode; an explicit unsupported request is refused.
    if (
      this.#toolId === "key-derivation" &&
      !selected.has("mnemocode") &&
      !included.includes("mnemocode-cards")
    )
      selected.delete("mnemocode-cards");
    return this.#definition.features.filter((feature) => selected.has(feature));
  }

  admit(coins, features) {
    this.#admitCoins(coins);
    this.normalize(features, "--features");
    const selected = new Set(features);
    const refuse = (message) => {
      throw new InvalidBuildSelection(message);
    };
    if (this.#toolId === "key-derivation") {
      if (!selected.has("derive"))
        refuse(
          'The base "derive" feature is required by the Key Derivation Tool and cannot be excluded.',
        );
      if (selected.has("mnemocode-cards") && !selected.has("mnemocode"))
        refuse('The "mnemocode-cards" feature requires the "mnemocode" feature.');
      if (
        selected.has("silent-payments") &&
        (!this.#profile.capabilities.bitcoinSilentPayments || !coins.includes("bitcoin"))
      )
        refuse(
          'The "silent-payments" feature requires Bitcoin in the general multi-chain profile.',
        );
      if (selected.has("bip38-encrypt") && !coins.includes("bitcoin") && !coins.includes("dash"))
        refuse("BIP38 encryption requires Bitcoin or Dash.");
      if (selected.has("message-signing") && !signsMessages(coins))
        refuse("Message signing needs a coin with a message-signing standard.");
      if (selected.has("multisig") && !coins.includes("bitcoin") && !coins.includes("dash"))
        refuse('The "multisig" feature requires Bitcoin or Dash.');
    }
    if (this.#toolId === "discovery-scanner") {
      if (!selected.has("seed-discovery") && !selected.has("watch-only-discovery"))
        refuse("Discovery Scanner requires seed-discovery, watch-only-discovery, or both.");
      if (selected.has("wallet-matcher") && !selected.has("seed-discovery"))
        refuse("Discovery Scanner wallet-matcher requires seed-discovery.");
      // An account coin is scanned from a phrase only; a single address belongs to the Viewer.
      const accountCoins = coins.filter(isAccountCoin);
      if (accountCoins.length > 0 && !selected.has("seed-discovery"))
        refuse(
          `Discovery Scanner scans the account coins (${accountCoins.join(", ")}) from seed phrases only: add seed-discovery or leave them out with --exclude-coins.`,
        );
      if (accountCoins.length === coins.length && selected.has("watch-only-discovery"))
        refuse(
          "Discovery Scanner watch-only-discovery needs a coin with public-key scans; the account coins have none.",
        );
    }
    if (this.#toolId === "psbt-inspector" && features.length === 0)
      refuse("PSBT Inspector requires at least one workflow feature.");
  }

  isLegal(coins, features) {
    try {
      this.admit(coins, features);
      return true;
    } catch (error) {
      if (error instanceof InvalidBuildSelection) return false;
      throw error;
    }
  }
}
