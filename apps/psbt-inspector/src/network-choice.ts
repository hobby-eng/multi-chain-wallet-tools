import type { PsbtChain, PsbtNetwork } from "./psbt-types.js";

const CHOICES = {
  bitcoin: ["mainnet", "testnet", "regtest"],
  dash: ["mainnet", "testnet"],
} as const;
const REFUSALS = {
  INVALID_CHAIN: "Select a supported Inspector chain.",
  INVALID_NETWORK: "Select a network offered for the active Inspector chain.",
} as const;

/** Input-free refusal of an unknown chain or an unavailable network selection. */
export class InspectorNetworkChoiceError extends Error {
  readonly code: keyof typeof REFUSALS;
  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "InspectorNetworkChoiceError";
    this.code = code;
  }
}

/** Validates the Inspector's offered choices, independently of low-level encoding support. */
export class InspectorNetworkChoice {
  readonly #network: PsbtNetwork;

  constructor(chain: unknown, network: unknown) {
    const choices = InspectorNetworkChoice.#choices(chain);
    const selected = choices.find((candidate) => candidate === network);
    if (selected === undefined) throw new InspectorNetworkChoiceError("INVALID_NETWORK");
    this.#network = selected;
  }

  /** Validates an exact chain identifier without coercion or a default. */
  static chain(value: unknown): PsbtChain {
    if (value !== "bitcoin" && value !== "dash")
      throw new InspectorNetworkChoiceError("INVALID_CHAIN");
    return value;
  }

  static #choices(chain: unknown): readonly PsbtNetwork[] {
    return CHOICES[InspectorNetworkChoice.chain(chain)];
  }

  /** Whether the active chain offers a specific network control. */
  static offers(chain: unknown, network: unknown): boolean {
    return InspectorNetworkChoice.#choices(chain).some((candidate) => candidate === network);
  }

  /** A supported chain change preserves the test environment instead of choosing mainnet. */
  static transition(chain: unknown, previous: unknown): PsbtNetwork {
    return new InspectorNetworkChoice(
      chain,
      chain === "dash" && previous === "regtest" ? "testnet" : previous,
    ).network;
  }

  /** The exact admitted selection; no unsupported input falls back to mainnet. */
  get network(): PsbtNetwork {
    return this.#network;
  }
}
