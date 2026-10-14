import type { PathRange } from "./derivation-path.js";
import { resolveCoinProtocol, type CoinRegistry } from "./coins/registry-base.js";

/** The first receiving path of account 0 on mainnet, which most known answers use. */
export const FIRST_MAINNET_PATH: PathRange = Object.freeze({
  network: "mainnet",
  account: 0,
  branch: 0,
  start: 0,
  count: 1,
});

/** Tiny path checks use only protocols admitted by the caller's composition. */
export class ProtocolMetadataSelfTest {
  readonly #registry: Pick<CoinRegistry, "COIN_ADAPTERS">;
  readonly #checks: string[] = [];

  constructor(registry: Pick<CoinRegistry, "COIN_ADAPTERS">) {
    this.#registry = registry;
  }

  path(id: string, input: PathRange, expected: string): void {
    const adapter = resolveCoinProtocol(this.#registry, id);
    if (adapter === undefined) return;
    if (adapter.pathPreview(input) !== expected)
      throw new Error(`Protocol metadata self-test failed: ${id} path.`);
    this.#checks.push(`${id} ${input.network} path metadata`);
  }

  refusal(id: string, input: PathRange): void {
    const adapter = resolveCoinProtocol(this.#registry, id);
    if (adapter === undefined) return;
    try {
      adapter.pathPreview(input);
    } catch {
      this.#checks.push(`${id} path boundary refusal`);
      return;
    }
    throw new Error(`Protocol metadata self-test failed: ${id} accepted an invalid path.`);
  }

  /**
   * Each protocol's known first mainnet path, and its refusal of that path changed by `invalid`.
   * A coin's check adds its own further cases to the returned object.
   */
  static firstPaths(
    registry: Pick<CoinRegistry, "COIN_ADAPTERS">,
    cases: readonly (readonly [id: string, expected: string])[],
    invalid: Partial<PathRange>,
  ): ProtocolMetadataSelfTest {
    const check = new ProtocolMetadataSelfTest(registry);
    for (const [id, expected] of cases) {
      check.path(id, FIRST_MAINNET_PATH, expected);
      check.refusal(id, { ...FIRST_MAINNET_PATH, ...invalid });
    }
    return check;
  }

  get checks(): string[] {
    return [...this.#checks];
  }
}
