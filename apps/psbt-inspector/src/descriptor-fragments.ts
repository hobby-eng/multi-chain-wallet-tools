const SCRIPT_KEYS = ["pk", "pk_k", "pkh", "pk_h"];
const MULTISIG = ["multi", "sortedmulti", "multi_a", "sortedmulti_a"];
const WRAPPERS = ["sh", "wsh"];
const OUTPUT_WRAPPERS = ["wpkh", ...WRAPPERS, "tr", "rawtr", "addr", "raw"];
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
  outputWrappers: OUTPUT_WRAPPERS,
  // Descriptor expansion happens before compilation; these names are not backend Miniscript.
  descriptorOnly: [
    ...OUTPUT_WRAPPERS,
    "combo",
    "sp",
    "musig",
    ...MULTISIG.filter((name) => name.startsWith("sorted")),
  ],
  directOutputs: ["pk", "pkh", "wpkh", "rawtr"],
  // A Taproot tree's key and script alternatives are not enumerated by the Miniscript walker.
  opaquePaths: ["raw", "addr", "sp", "combo", "tr"],
  legacyRoots: LEGACY_ROOTS,
  roots: [...LEGACY_ROOTS, "tr", "rawtr", "sp", "wsh", "wpkh"],
  multipleArguments: [...MULTISIG.filter((name) => !name.endsWith("_a")), "sp"],
} as const;

type FragmentGroup = keyof typeof GROUPS;

/** An input-free refusal of a group outside this catalog's declared families. */
export class DescriptorFragmentError extends Error {
  readonly code = "descriptor.fragment.group";
  constructor() {
    super("Select a declared descriptor fragment group.");
    this.name = "DescriptorFragmentError";
  }
}

/** Context-specific fragment families used by every descriptor parser and walker. */
export class DescriptorFragmentCatalog {
  readonly #groups = new Map<string, ReadonlySet<string>>(
    Object.entries(GROUPS).map(([group, names]) => [group, new Set(names)] as const),
  );

  #group(name: FragmentGroup): ReadonlySet<string> {
    const group = this.#groups.get(name);
    if (group === undefined) throw new DescriptorFragmentError();
    return group;
  }

  /** Membership in one declared family; an unknown runtime family is a coded refusal. */
  has(group: FragmentGroup, name: string): boolean {
    return this.#group(group).has(name);
  }

  /** A separate list of one family's names; callers cannot change the catalog's sets. */
  names(group: FragmentGroup): readonly string[] {
    return [...this.#group(group)];
  }
}

/** Shared fragment facts for parser, compiler, policy summaries and page composition. */
export const DESCRIPTOR_FRAGMENTS = new DescriptorFragmentCatalog();
