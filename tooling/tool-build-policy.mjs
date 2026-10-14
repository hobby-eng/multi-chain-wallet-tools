import { TOOL_MANIFESTS } from "./tool-manifests.mjs";

class InvalidBuildSelection extends Error {}

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
      if (this.#toolId !== "key-derivation") return true;
      if (feature === "silent-payments")
        return this.#profile.capabilities.bitcoinSilentPayments && coins.includes("bitcoin");
      if (feature === "bip38-encrypt" || feature === "message-signing")
        return coins.includes("bitcoin") || coins.includes("dash");
      return true;
    });
  }

  features(coins, included = [], excluded = []) {
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
    const ordered = this.#definition.features.filter((feature) => selected.has(feature));
    this.admit(coins, ordered);
    return ordered;
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
      if (
        (selected.has("bip38-encrypt") || selected.has("message-signing")) &&
        !coins.includes("bitcoin") &&
        !coins.includes("dash")
      )
        refuse("BIP38 encryption and message signing require Bitcoin or Dash.");
    }
    if (this.#toolId === "discovery-scanner") {
      if (!selected.has("seed-discovery") && !selected.has("watch-only-discovery"))
        refuse("Discovery Scanner requires seed-discovery, watch-only-discovery, or both.");
      if (selected.has("wallet-matcher") && !selected.has("seed-discovery"))
        refuse("Discovery Scanner wallet-matcher requires seed-discovery.");
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
