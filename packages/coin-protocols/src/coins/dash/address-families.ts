/** Dash Core P2PKH families share address encoding and compact-message signing. */
export class DashAddressFamilies {
  readonly #core = ["dash-core", "dash-legacy-mobile", "dash-core-coinjoin"];

  coreAdapters(): readonly string[] {
    return [...this.#core];
  }

  addressAdapters(): readonly string[] {
    return [...this.#core, "dash-platform", "dash-shielded"];
  }

  signsCompact(adapterId: string): boolean {
    return this.#core.includes(adapterId);
  }
}

export const DASH_ADDRESS_FAMILIES = new DashAddressFamilies();
