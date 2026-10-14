import { PLATFORM_EXPLORER_HTTP } from "./platform-explorer.js";
import { assertPlatformExplorerNetwork } from "./provider-json.js";
import { validatePlatformAddress } from "./public-address.js";
import type { ViewerNetwork } from "./types.js";

/** Binds auxiliary indexed history to the locally admitted DIP18 resource and network. */
export class PlatformAddressHistoryAdmission {
  readonly #address: string;
  readonly #network: ViewerNetwork;

  constructor(address: string, network: ViewerNetwork) {
    this.#address = validatePlatformAddress(address, network);
    this.#network = network;
  }

  admitResource(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("Platform Explorer address info omitted its resource address.");
    }
    const address = validatePlatformAddress(value, this.#network);
    if (address !== this.#address) {
      throw new Error("Platform Explorer address info did not match the requested address.");
    }
    return address;
  }

  admitInfo(value: unknown): Record<string, unknown> {
    const info = PLATFORM_EXPLORER_HTTP.object(value, "address info");
    this.admitResource(info.bech32mAddress);
    // The info contract has no mandatory network field; /status supplies that binding.
    if (info.network !== undefined) assertPlatformExplorerNetwork(info.network, this.#network);
    return info;
  }
}
