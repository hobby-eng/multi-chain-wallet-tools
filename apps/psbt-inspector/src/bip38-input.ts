import { Bip38PasswordMaterial } from "@ckd/core/bip38-password-material.js";
import { InspectorNetworkChoice, InspectorNetworkChoiceError } from "./network-choice.js";
import type { PsbtChain, PsbtNetwork } from "./psbt-types.js";

const PARAMETERS = Object.freeze({ maxKeys: 200, maxFieldCodeUnits: 65536 });
const REFUSALS = {
  text: "Enter text within the BIP38 input limit.",
  empty: "Enter at least one BIP38 encrypted private key.",
  count: `Decrypt at most ${PARAMETERS.maxKeys} BIP38 keys in one batch.`,
  password: "Enter the BIP38 password.",
  key: "Enter a BIP38 encrypted private key beginning with 6P, not its public address.",
  failed: "The key could not be decrypted with this password and network.",
  released: "This BIP38 request has been released.",
  index: "Select a key index in the current BIP38 batch.",
} as const;

/** Input-free, stable refusals shared by the library and its page. */
export class Bip38InputError extends Error {
  readonly code: keyof typeof REFUSALS;
  constructor(code: keyof typeof REFUSALS, options?: ErrorOptions) {
    super(REFUSALS[code], options);
    this.name = "Bip38InputError";
    this.code = code;
  }
}

/** Owns batch admission and BIP38-specific choices before normalization, copies or expensive work. */
export class Bip38Input {
  /** Shared bounds for request admission and the page's documented field limits. */
  static get parameters(): typeof PARAMETERS {
    return PARAMETERS;
  }

  static #field(value: unknown): string {
    if (typeof value !== "string" || value.length > PARAMETERS.maxFieldCodeUnits)
      throw new Bip38InputError("text");
    return value;
  }

  /** A literal key field, split by the supported delimiters and deduplicated in its original order. */
  static batch(value: unknown): string[] {
    const keys = [
      ...new Set(
        Bip38Input.#field(value)
          .split(/[\s,;]+/u)
          .filter(Boolean),
      ),
    ];
    if (keys.length === 0) throw new Bip38InputError("empty");
    if (keys.length > PARAMETERS.maxKeys) throw new Bip38InputError("count");
    return keys;
  }

  /** Keeps the protocol's password normalization in the cryptographic library. */
  static password(value: unknown): string {
    const password = Bip38Input.#field(value);
    try {
      Bip38PasswordMaterial.assertPassphrase(password);
    } catch (cause) {
      throw new Bip38InputError("password", { cause });
    }
    return password;
  }

  /** Early key-kind admission; the cryptographic library checks its wire format and checksum. */
  static key(value: unknown): string {
    const key = Bip38Input.#field(value).trim();
    if (!key.startsWith("6P")) throw new Bip38InputError("key");
    return key;
  }

  /** Reuses the Inspector's exact supported-chain admission. */
  static chain(value: unknown): PsbtChain {
    return InspectorNetworkChoice.chain(value);
  }

  /** Uses the same offered choices as the page, including Bitcoin's regtest address parameters. */
  static network(chain: unknown, value: unknown): PsbtNetwork {
    return new InspectorNetworkChoice(chain, value).network;
  }

  /** Only known, input-free diagnostic classes may reach the page. */
  static message(cause: unknown): string {
    if (cause instanceof Bip38InputError) return REFUSALS[cause.code];
    return cause instanceof InspectorNetworkChoiceError ? cause.message : REFUSALS.failed;
  }
}
