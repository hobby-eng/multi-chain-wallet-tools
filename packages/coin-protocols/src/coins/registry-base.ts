import type { NetworkName } from "@ckd/core/types.js";

export interface CoinDerivationInput {
  seed: Uint8Array;
  network: NetworkName;
  account: number;
  branch: number;
  start: number;
  count: number;
  /** Public text that the protocol needs beyond indexes, by the keys of its text controls. */
  text?: Readonly<Record<string, string>>;
}

/** A public text input of one protocol, such as the identity IDs of a DashPay contact. */
export interface TextControl {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
  /** The longest accepted text, in UTF-16 code units, after trimming. */
  readonly maxLength: number;
}

export interface ControlOption {
  value: number;
  label: string;
}

export interface BranchControl {
  label: string;
  max: number;
  options?: ControlOption[];
}

export interface AddressBranches {
  receive: number;
  change: number;
  help?: string;
}

/** Non-hardened branch indices for an optional DIP9 CoinJoin chain, separate from BIP44 receive/change. */
export interface CoinJoinBranches {
  external: number;
  internal: number;
}

export interface CoinJoinPathPreview {
  external: string;
  internal: string;
}

export interface CoinJoinSupport {
  readonly label: string;
  branches: CoinJoinBranches;
  /** Worker-dispatch id for this chain's derive() function; distinct from the adapter id because the path template differs from the adapter's own protocol. */
  workerAdapterId: string;
  pathPreview(input: {
    network: NetworkName;
    account: number;
    start: number;
    count: number;
  }): CoinJoinPathPreview;
}

export interface CoinLimits {
  accountMax?: number;
  startMax?: number;
}

export interface CoinFieldRoles {
  addresses: string[];
  publicKeys: string[];
  privateKeys: string[];
}

/**
 * A seed that is not BIP39's: "ton-phrase", the 64-byte entropy of a TON phrase
 * (@ckd/core/ton-mnemonic.js), which is not a BIP39 phrase; "cardano-icarus" and
 * "cardano-icarus-trezor", the 96-byte CIP-3 root of a BIP39 phrase and its passphrase
 * (@ckd/core/cardano-icarus.js).
 */
export type SeedSource = "ton-phrase" | "cardano-icarus" | "cardano-icarus-trezor";

/** The seed sources read from a BIP39 phrase, which a BIP85 child phrase has too. */
export type PhraseSeedSource = Exclude<SeedSource, "ton-phrase">;

/** How the page reads a phrase's seed under a seed source; the caller wipes the seed. */
export type PhraseSeedReader = (phrase: string, passphrase: string) => Uint8Array;

/** The readers of the phrase seed sources a build holds, each composed only with its coin. */
export type PhraseSeedReaders = Readonly<Partial<Record<PhraseSeedSource, PhraseSeedReader>>>;

/** Extension contract: the UI renders and exports only this protocol-neutral API. */
export interface CoinAdapter {
  /** Labels for fixed leading path segments, sourced from pathPreview. */
  readonly fixedPathLabels?: readonly string[];
  id: string;
  group: string;
  label: string;
  variantLabel: string;
  defaultVariant?: boolean;
  hiddenByDefault?: boolean;
  networkControl: boolean;
  /** Receive/internal selectors exposed as Receive/Change tabs; the adapter defines their path and hardening. */
  addressBranches?: AddressBranches;
  /** Optional DIP9 CoinJoin chain, exposed as its own opt-in result tab with nested External/Internal branches. */
  coinJoin?: CoinJoinSupport;
  branchControl?: BranchControl;
  limits?: CoinLimits;
  accountControl?: boolean;
  /** False when the protocol has one key: the page shows no start index or number of results. */
  rangeControl?: false;
  /**
   * Where the derivation's seed comes from: BIP39's seed of the phrase and its passphrase when
   * absent; otherwise its SeedSource.
   */
  seedSource?: SeedSource;
  controlLabels?: {
    account?: string;
    start?: string;
    count?: string;
  };
  /** Text inputs the protocol needs; a host without them does not offer the protocol. */
  textControls?: readonly TextControl[];
  /** The page's texts of the protocol's own input refusals, by error code; never typed text. */
  inputMessages?: Readonly<Record<string, string>>;
  /** Internal work chunk. This is not a user-visible total-result limit. */
  batchSize?: number;
  defaults: { network: NetworkName; account: number; branch: number; start: number; count: number };
  fieldRoles: CoinFieldRoles;
  /** Optional protocol-specific equality (for example EVM hexadecimal address case). */
  addressesEqual?(derived: string, expected: string): boolean;
  pathPreview(input: Omit<CoinDerivationInput, "seed">): string;
}

export interface CoinFamily {
  id: string;
  label: string;
  adapters: readonly CoinAdapter[];
}

export interface CoinRegistry {
  readonly COIN_ADAPTERS: readonly CoinAdapter[];
  readonly COIN_FAMILIES: readonly CoinFamily[];
  getAdapterFamilyId(adapter: CoinAdapter): string;
  getCoinAdapter(id: string): CoinAdapter;
  getCoinFamily(id: string): CoinFamily;
  getDefaultCoinAdapter(id: string): CoinAdapter;
}

export const BIP44_ADDRESS_BRANCHES: AddressBranches = { receive: 0, change: 1 };

/** The two BIP44 branches of an account-based coin (Ethereum's model), offered as one choice. */
export const ADDRESS_BRANCH_CONTROL: BranchControl = {
  label: "Address branch",
  max: 1,
  options: [
    { value: 0, label: "0 — common path" },
    { value: 1, label: "1 — alternate path" },
  ],
};

/** Equality of 0x hexadecimal addresses, whose EIP-55 case is only a checksum. */
export function hexAddressesEqual(derived: string, expected: string): boolean {
  return derived.toLowerCase() === expected.toLowerCase();
}

export const TRANSPARENT_ROLES: CoinFieldRoles = {
  addresses: ["address"],
  publicKeys: [
    "publicKey",
    "compressedPublicKey",
    "internalPublicKey",
    "taprootOutputPublicKey",
    "taprootOutputCompressedPublicKey",
    "childXpub",
  ],
  privateKeys: [
    "privateKey",
    "privateKeyHex",
    "privateKeyWif",
    "childPrivateKey",
    "taprootOutputPrivateKey",
    "taprootOutputPrivateKeyWif",
    "childXprv",
  ],
};

export function indexRange(start: number, count: number): string {
  return count > 1 ? `${start}…${start + count - 1}` : String(start);
}

/** Resolves only protocols admitted by this build, including an adapter's optional chain. */
export function resolveCoinProtocol(
  registry: Pick<CoinRegistry, "COIN_ADAPTERS">,
  id: string,
): CoinAdapter | undefined {
  for (const adapter of registry.COIN_ADAPTERS) {
    if (adapter.id === id) return adapter;
    const protocol = adapter.coinJoin;
    if (protocol?.workerAdapterId !== id) continue;
    return {
      ...adapter,
      id,
      label: protocol.label,
      variantLabel: protocol.label,
      defaults: { ...adapter.defaults, branch: protocol.branches.external },
      addressBranches: { receive: protocol.branches.external, change: protocol.branches.internal },
      pathPreview: (input) => {
        const paths = protocol.pathPreview(input);
        if (input.branch === protocol.branches.external) return paths.external;
        if (input.branch === protocol.branches.internal) return paths.internal;
        throw new Error("Unsupported optional protocol branch.");
      },
    };
  }
  return undefined;
}

function familyId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

const REGISTRY_MESSAGES = {
  "coin.registry.family": "Select a supported coin family.",
  "coin.registry.protocol": "Unsupported derivation protocol.",
  "coin.registry.defaults": "A coin family declares more than one default derivation variant.",
  "coin.registry.empty-family": "A coin family has no derivation variant.",
} as const;

/** Stable input-free registry refusals. */
export type CoinRegistryErrorCode = keyof typeof REGISTRY_MESSAGES;

/** A refused family/protocol selection or inconsistent build-controlled family metadata. */
export class CoinRegistryError extends Error {
  readonly code: CoinRegistryErrorCode;
  constructor(code: CoinRegistryErrorCode) {
    super(REGISTRY_MESSAGES[code]);
    this.name = "CoinRegistryError";
    this.code = code;
  }
}

/** Owns family selection and default-variant rules shared by registries and embedded views. */
export class CoinFamilyCatalog {
  readonly #families: readonly CoinFamily[];

  /** Borrows the build's public family metadata; no wallet data or derivation runtime is needed. */
  constructor(families: readonly CoinFamily[]) {
    this.#families = families;
  }

  /** Refuses unknown native selectors without coercion or reflecting their contents. */
  get(id: unknown): CoinFamily {
    const family = this.#families.find((candidate) => candidate.id === id);
    if (family === undefined) throw new CoinRegistryError("coin.registry.family");
    return family;
  }

  /** Exactly one explicit default wins; otherwise use the family's first admitted variant. */
  defaultAdapter(id: unknown): CoinAdapter {
    const family = this.get(id);
    const defaults = family.adapters.filter(({ defaultVariant }) => defaultVariant === true);
    if (defaults.length > 1) throw new CoinRegistryError("coin.registry.defaults");
    const adapter = defaults[0] ?? family.adapters[0];
    if (adapter === undefined) throw new CoinRegistryError("coin.registry.empty-family");
    return adapter;
  }
}

/**
 * Compatibility factory; metadata and lookup rules are owned by the shared family catalog.
 * `orderFamilies` puts the families' names in the Coin menu's order: a build of several coins
 * passes the rule of coin-order.ts, and a build of one coin, which has no order to keep, none.
 */
export function createCoinRegistry(
  coinAdapters: readonly CoinAdapter[],
  orderFamilies: (labels: string[]) => readonly string[] = (labels) => labels,
): CoinRegistry {
  const coinFamilies: readonly CoinFamily[] = orderFamilies([
    ...new Set(coinAdapters.map(({ group }) => group)),
  ]).map((label) => ({
    id: familyId(label),
    label,
    adapters: coinAdapters.filter(({ group }) => group === label),
  }));
  const families = new CoinFamilyCatalog(coinFamilies);

  return {
    COIN_ADAPTERS: coinAdapters,
    COIN_FAMILIES: coinFamilies,
    getCoinFamily(id: string): CoinFamily {
      return families.get(id);
    },
    getDefaultCoinAdapter(id: string): CoinAdapter {
      return families.defaultAdapter(id);
    },
    getAdapterFamilyId(adapter: CoinAdapter): string {
      return familyId(adapter.group);
    },
    getCoinAdapter(id: string): CoinAdapter {
      const adapter = coinAdapters.find((candidate) => candidate.id === id);
      if (adapter === undefined) throw new CoinRegistryError("coin.registry.protocol");
      return adapter;
    },
  };
}
