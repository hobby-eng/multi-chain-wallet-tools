const SCRIPT_KEYS = ["pk", "pk_k", "pkh", "pk_h"];
const MULTISIG = ["multi", "sortedmulti", "multi_a", "sortedmulti_a"];
const WRAPPERS = ["sh", "wsh"];
const LEGACY_ROOTS = [
  "pk",
  "pkh",
  "sh",
  "combo",
  "addr",
  "raw",
  ...MULTISIG.filter((name) => !name.endsWith("_a")),
];

const GROUPS = {
  scriptKeys: SCRIPT_KEYS,
  // Output key forms belong to descriptor walkers, not Miniscript satisfaction cards.
  descriptorKeys: [...SCRIPT_KEYS, "wpkh", "combo", "rawtr"],
  // rawtr has a separate x-only validation path; it must not use ordinary key validation.
  regularKeys: [...SCRIPT_KEYS, "wpkh", "combo"],
  multisig: MULTISIG,
  numericFirst: ["thresh", ...MULTISIG],
  wrappers: WRAPPERS,
  hashes: ["sha256", "hash256", "ripemd160", "hash160"],
  and: ["and_v", "and_b", "and_n"],
  or: ["or_b", "or_c", "or_d", "or_i"],
  // These are output descriptors, never valid as a nested Miniscript fragment.
  outputWrappers: ["wpkh", ...WRAPPERS, "tr", "rawtr", "addr", "raw"],
  directOutputs: ["pk", "pkh", "wpkh", "rawtr"],
  legacyRoots: LEGACY_ROOTS,
  roots: [...LEGACY_ROOTS, "tr", "rawtr", "sp", "wsh", "wpkh"],
  multipleArguments: [...MULTISIG.filter((name) => !name.endsWith("_a")), "sp"],
} as const;

type FragmentGroup = keyof typeof GROUPS;

/** Context-specific fragment families used by every descriptor parser and walker. */
export class DescriptorFragmentCatalog {
  readonly #groups = new Map<FragmentGroup, ReadonlySet<string>>(
    Object.entries(GROUPS).map(([group, names]) => [group as FragmentGroup, new Set(names)]),
  );

  has(group: FragmentGroup, name: string): boolean {
    return this.#groups.get(group)!.has(name);
  }

  names(group: FragmentGroup): readonly string[] {
    return [...this.#groups.get(group)!];
  }
}

export const DESCRIPTOR_FRAGMENTS = new DescriptorFragmentCatalog();
