import { deriveDashCoinJoin } from "./coinjoin.js";
import { deriveDashCore } from "./core.js";
import { deriveDashLegacyMobile } from "./legacy-mobile.js";
import { deriveDashIdentity } from "./identity.js";
import { deriveDashCoreMultisig, deriveDashMultisig } from "./multisig.js";
import { deriveDashPlatform } from "./platform.js";
import { resolveCoinProtocol, type CoinRegistry } from "../registry-base.js";
import type { RuntimeCoinAdapter } from "../runtime-types.js";
import { DASH_COINJOIN_PROTOCOL } from "./profiles.js";

/** Shared Dash dispatch; metadata admission still belongs to the edition's registry. */
export class DashRuntimeRegistry {
  static readonly #protocols: ReadonlyMap<string, RuntimeCoinAdapter["derive"]> = new Map<
    string,
    RuntimeCoinAdapter["derive"]
  >([
    ["dash-core", deriveDashCore],
    ["dash-legacy-mobile", deriveDashLegacyMobile],
    ["dash-platform", deriveDashPlatform],
    ["dash-identity", deriveDashIdentity],
    ["dash-multisig-p2sh", deriveDashMultisig],
    ["dash-multisig-core-pkh", deriveDashCoreMultisig],
    [
      "dash-shielded",
      async (input) => {
        const { deriveDashShielded } = await import("./shielded.js");
        return deriveDashShielded(input);
      },
    ],
    // DIP9 CoinJoin uses Core's controls but its own path and worker identity.
    [DASH_COINJOIN_PROTOCOL.workerAdapterId, deriveDashCoinJoin],
  ]);

  static adapter(
    id: string,
    registry: Pick<CoinRegistry, "COIN_ADAPTERS" | "getCoinAdapter">,
  ): RuntimeCoinAdapter | undefined {
    const protocol = this.derivationFor(id);
    if (protocol === undefined) return undefined;
    const metadata = resolveCoinProtocol(registry, id) ?? registry.getCoinAdapter(id);
    return { ...metadata, derive: protocol };
  }

  /** Generated workers share this dispatch without copying the protocol identities. */
  static derivationFor(id: string): RuntimeCoinAdapter["derive"] | undefined {
    return this.#protocols.get(id);
  }
}
