/**
 * Network version bytes of compressed WIF transports; these do not change the private scalar. They
 * are named constants rather than a table keyed by coin, so that a build keeps only the names its
 * minifier renames: the Dash Community artifacts hold no other coin's name.
 */
const TESTNET_VERSION = 0xef;
export const BITCOIN_MAINNET_WIF = 0x80;
export const BITCOIN_TESTNET_WIF = TESTNET_VERSION;
export const DASH_MAINNET_WIF = 0xcc;
export const DASH_TESTNET_WIF = TESTNET_VERSION;

const MAX_VERSION = 0xff;
/** Stable refusal code for a transport prefix that cannot fit one byte. */
export const WIF_VERSION_ERROR = "key.wif-version";

/** Refusal of a WIF transport version; no caller input is retained. */
export class WifVersionError extends Error {
  constructor() {
    super(WIF_VERSION_ERROR);
    this.name = "WifVersionError";
  }

  /** Stable code for front-end wording. */
  get code(): typeof WIF_VERSION_ERROR {
    return WIF_VERSION_ERROR;
  }
}

/** An admitted one-byte WIF version shared by early admission and final encoding. */
export class WifVersion {
  readonly #value: number;

  constructor(value: unknown) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_VERSION)
      throw new WifVersionError();
    this.#value = value;
  }

  /** The validated public transport prefix. */
  get value(): number {
    return this.#value;
  }
}
