import { DESCRIPTOR_FRAGMENTS } from "./descriptor-fragments.js";
import { analyzeMiniscript } from "@bitcoinerlab/miniscript";
import { CONSENSUS_LIMITS, RelativeSequence } from "./consensus-limits.js";
import { findMatchingClose, fragmentBodies, splitTopLevelArguments } from "./balanced-syntax.js";

/** A spending-path explanation; null obligations mean unknown, while an empty list means none. */
export interface DescriptorPathCard {
  readonly kind: "symbolic" | "impossible" | "conditions";
  readonly title: string;
  readonly availability: string;
  readonly requirement: string;
  readonly keys: readonly string[] | null;
  readonly locks: readonly string[] | null;
  readonly preimages: readonly string[] | null;
}

/** Parsed descriptor syntax; argument strings remain distinct from nested fragments. */
export interface ExpressionNode {
  readonly name: string;
  readonly wrappers: string;
  readonly args: readonly (ExpressionNode | string)[];
}

const MAX_DESCRIPTOR_PATH_CARDS = 64;
// Host analysis budget, independent of the consensus bound on a Taproot script tree.
const MAX_EXPRESSION_DEPTH = 128;
const POLICY_REFUSALS = {
  argument: "The descriptor policy has a missing or malformed argument.",
  tree: "Taproot tree requires exactly two children per branch.",
  depth: "The descriptor expression exceeds the supported analysis depth.",
  analysis: "The Miniscript analysis could not be completed.",
} as const;

/** Input-free policy shape refusals; symbolic or incomplete path knowledge is returned as data. */
export class DescriptorPolicyError extends Error {
  readonly code: `descriptor.policy.${keyof typeof POLICY_REFUSALS}`;
  constructor(reason: keyof typeof POLICY_REFUSALS) {
    super(POLICY_REFUSALS[reason]);
    this.name = "DescriptorPolicyError";
    this.code = `descriptor.policy.${reason}`;
  }
}

function argumentAt(node: ExpressionNode, index: number): ExpressionNode | string {
  const value = node.args[index];
  if (value === undefined) throw new DescriptorPolicyError("argument");
  return value;
}

function argumentText(node: ExpressionNode, index = 0): string {
  const value = argumentAt(node, index);
  if (typeof value !== "string") throw new DescriptorPolicyError("argument");
  return value;
}

function hasDescriptorForm(value: ExpressionNode | string): boolean {
  return (
    typeof value !== "string" &&
    (DESCRIPTOR_FRAGMENTS.has("descriptorOnly", value.name) || value.args.some(hasDescriptorForm))
  );
}

/** Optional Miniscript analysis; descriptor-only forms return null, backend failures throw. */
export function miniscriptAnalysis(miniscript: string, tapscript = false): string | null {
  const parsed = expression(miniscript);
  if (parsed !== null && hasDescriptorForm(parsed)) return null;
  try {
    const analysis = analyzeMiniscript(miniscript, { tapscript });
    if (!analysis.valid) return null;
    return [
      analysis.issane ? "sane" : "not sane",
      analysis.nonMalleable ? "non-malleable satisfactions available" : "malleability warning",
      analysis.needsSignature ? "signature required" : "no signature required",
      analysis.timelockMix ? "mixed timelock units" : "compatible timelock units",
      analysis.hasDuplicateKeys ? "duplicate keys detected" : "no duplicate keys",
    ].join(" · ");
  } catch {
    throw new DescriptorPolicyError("analysis");
  }
}

/** Finds a descriptor's closing parenthesis; malformed delimiter pairs are refused. */
export const matchingClose = (text: string, open: number): number =>
  findMatchingClose(text, open, "(", ")", "Descriptor");
/** Splits outer descriptor arguments while respecting origins, trees and multipath tuples. */
export const splitTopLevel = (text: string): string[] =>
  splitTopLevelArguments(text, { context: "Descriptor", includeAngles: true });

/** Display-only origin and suffix summary; no key derivation or key validation is performed. */
export function shortenedKey(key: string): string {
  const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
  const fingerprint = origin?.split("/")[0] ?? "origin not supplied";
  const suffix =
    key.match(/\/(?:[01]|<[^>]+>)\/\*$/u)?.[0] ?? (key.endsWith("/*") ? "/*" : "fixed key");
  return `${fingerprint} · ${suffix}`;
}

function describedKey(key: string): string {
  const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
  const fingerprint = origin?.split("/")[0];
  const originPath = origin?.split("/").slice(1).join("/");
  const suffix =
    key.match(/\/(?:[0-9]+|<[^>]+>|\*)+(?:\/\*)?$/u)?.[0] ??
    (key.endsWith("/*") ? "/*" : "fixed key");
  const parts = [
    fingerprint === undefined ? "fingerprint not supplied" : `fingerprint ${fingerprint}`,
  ];
  if (originPath !== undefined && originPath.length > 0) parts.push(`origin m/${originPath}`);
  parts.push(`derivation ${suffix}`);
  return parts.join(", ");
}

function expressionAtDepth(text: string, depth: number): ExpressionNode | null {
  if (depth > MAX_EXPRESSION_DEPTH) throw new DescriptorPolicyError("depth");
  let body = text;
  let wrappers = "";
  const wrapper = /^([a-z]+):/u.exec(body);
  if (wrapper !== null) {
    const letters = wrapper[1];
    if (letters === undefined) throw new DescriptorPolicyError("argument");
    wrappers = letters;
    body = body.slice(wrapper[0].length);
  }
  if (body === "0" || body === "1") return { name: body, wrappers, args: [] };
  const match = /^([a-z0-9_]+)\(/u.exec(body);
  if (match === null) return null;
  const open = match[0].length - 1;
  const close = matchingClose(body, open);
  const name = match[1];
  if (name === undefined) throw new DescriptorPolicyError("argument");
  const rawArguments = splitTopLevel(body.slice(open + 1, close));
  const numericFirstArgument = DESCRIPTOR_FRAGMENTS.has("numericFirst", name);
  if (
    close !== body.length - 1 &&
    !(
      name === "musig" &&
      /^\/(?:[0-9]+|<[^>]+>|\*)(?:\/(?:[0-9]+|<[^>]+>|\*))*$/u.test(body.slice(close + 1))
    )
  )
    return null;
  const args = rawArguments.map((argument, index): ExpressionNode | string => {
    if (
      (!numericFirstArgument || index !== 0) &&
      (/^(?:[a-z]+:)?[a-z0-9_]+\(/u.test(argument) || /^(?:[a-z]+:)?[01]$/u.test(argument))
    ) {
      return expressionAtDepth(argument, depth + 1) ?? argument;
    }
    return argument;
  });
  return { name, wrappers, args };
}

/** Parses bounded descriptor syntax; unrecognized forms return null, malformed or deep forms fail. */
export function expression(text: string): ExpressionNode | null {
  return expressionAtDepth(text, 0);
}

function nodeText(value: ExpressionNode | string): string {
  return typeof value === "string" ? value : describeCondition(value);
}

/** Describes a Taproot key or MuSig expression without claiming ownership of its private key. */
export function describeTaprootKey(value: ExpressionNode | string): string {
  if (typeof value !== "string") return describeCondition(value);
  const parsed = expression(value);
  return parsed === null ? `one signature from ${describedKey(value)}` : describeCondition(parsed);
}

function unwrapWrapper(node: ExpressionNode): ExpressionNode {
  if (
    DESCRIPTOR_FRAGMENTS.has("wrappers", node.name) &&
    node.args[0] !== undefined &&
    typeof node.args[0] !== "string"
  )
    return unwrapWrapper(node.args[0]);
  return node;
}

/** Explains a lock operand in block heights or Unix seconds under the consensus threshold. */
export function describeAbsolute(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return `invalid absolute lock ${value}`;
  if (value < CONSENSUS_LIMITS.absoluteLockTimeThreshold) return `after block height ${value}`;
  const date = new Date(value * 1000);
  return Number.isNaN(date.valueOf())
    ? `after Unix time ${value}`
    : `after approximately ${date.toISOString()} (Unix time ${value}, enforced using median-time-past)`;
}

/** Display meanings of the admitted Miniscript wrapper letters. */
export const WRAPPER_MEANINGS: Readonly<Record<string, string>> = {
  a: "move the input through the alternate stack (TOALTSTACK … FROMALTSTACK)",
  s: "swap the top two stack values before evaluating the fragment",
  c: "apply CHECKSIG to a public-key fragment",
  t: "append true after a VERIFY-type fragment",
  d: "duplicate the top value and conditionally evaluate the fragment",
  v: "convert the fragment to VERIFY form so failure aborts the script",
  j: "evaluate the fragment only when the top stack item is non-empty",
  n: "normalize the result to canonical true or false",
  l: "provide the fragment as the false-selected branch of IF/ELSE",
  u: "provide the fragment as the true-selected branch of IF/ELSE",
};

/** Lists wrapper letters in an admitted expression, including those of nested fragments. */
export function collectWrappers(value: ExpressionNode | string): string[] {
  if (typeof value === "string") return [];
  // expression() admits wrappers through the ASCII [a-z] grammar.
  return [...value.wrappers.split(""), ...value.args.flatMap(collectWrappers)];
}

/** Symbolic conditions; this description does not establish a concrete transaction satisfaction. */
export function describeCondition(node: ExpressionNode): string {
  if (DESCRIPTOR_FRAGMENTS.has("wrappers", node.name))
    return `${node.name} wrapper: ${node.args.map(nodeText).join("; ")}`;
  if (DESCRIPTOR_FRAGMENTS.has("multisig", node.name)) {
    const required = Number(node.args[0]);
    const keys = node.args.slice(1);
    return `${required}-of-${keys.length} signatures (${keys
      .map((key) => (typeof key === "string" ? describedKey(key) : describeTaprootKey(key)))
      .join("; ")})`;
  }

  if (node.name === "musig") {
    const keys = node.args.filter((value): value is string => typeof value === "string");
    return `MuSig2 aggregate key from ${keys.length} participants (${keys.map(describedKey).join("; ")}); cooperative spend uses one aggregate Schnorr signature`;
  }
  if (DESCRIPTOR_FRAGMENTS.has("descriptorKeys", node.name))
    return describeTaprootKey(argumentAt(node, 0));
  if (node.name === "older")
    return `relative timelock ${relativeLock(Number(node.args[0]))} after confirmation of the spent UTXO`;
  if (node.name === "after") return describeAbsolute(Number(node.args[0]));
  if (DESCRIPTOR_FRAGMENTS.has("hashes", node.name)) {
    return `reveal an exact 32-byte preimage whose ${hashAlgorithm(node.name)} digest is ${argumentText(node)}`;
  }
  if (DESCRIPTOR_FRAGMENTS.has("and", node.name)) return node.args.map(nodeText).join(" AND ");
  if (node.name === "andor" && node.args.length === 3)
    return `if ${nodeText(argumentAt(node, 0))}, then ${nodeText(argumentAt(node, 1))}, otherwise ${nodeText(argumentAt(node, 2))}`;
  if (DESCRIPTOR_FRAGMENTS.has("or", node.name)) return node.args.map(nodeText).join(" OR ");
  if (node.name === "thresh")
    // Miniscript thresh sums child truth values and compares them with k using EQUAL.
    return `satisfy exactly ${argumentText(node)} of these conditions; provide dissatisfaction witnesses for the others: ${node.args.slice(1).map(nodeText).join("; ")}`;
  if (node.name === "0") return "an impossible branch";
  if (node.name === "1") return "no additional condition";
  return `${node.wrappers.length > 0 ? `${node.wrappers}:` : ""}${node.name}(…) — standard fragment not yet translated; inspect it manually`;
}

function treeLabel(node: ExpressionNode): string {
  const prefix = node.wrappers.length > 0 ? `${node.wrappers}:` : "";
  if (node.name === "0") return `${prefix}false / impossible condition`;
  if (node.name === "1") return `${prefix}true / no additional condition`;
  if (DESCRIPTOR_FRAGMENTS.has("wrappers", node.name)) return `${node.name} wrapper`;
  if (DESCRIPTOR_FRAGMENTS.has("or", node.name)) return `${prefix}OR (${node.name})`;
  if (DESCRIPTOR_FRAGMENTS.has("and", node.name)) return `${prefix}AND (${node.name})`;
  if (node.name === "older") return `relative lock: ${relativeLock(Number(node.args[0]))}`;
  if (node.name === "after") return `absolute lock: ${describeAbsolute(Number(node.args[0]))}`;
  if (DESCRIPTOR_FRAGMENTS.has("hashes", node.name))
    return `${prefix}hashlock: ${hashAlgorithm(node.name)} ${argumentText(node)}`;
  if (DESCRIPTOR_FRAGMENTS.has("descriptorKeys", node.name)) {
    const key = argumentAt(node, 0);
    return `${prefix}${node.name}: ${typeof key === "string" ? shortenedKey(key) : treeLabel(key)}`;
  }
  if (node.name === "musig") return `${prefix}musig: aggregate ${node.args.length} keys`;
  if (DESCRIPTOR_FRAGMENTS.has("multisig", node.name)) {
    return `${prefix}${node.name}: ${argumentText(node)}-of-${Math.max(0, node.args.length - 1)} keys`;
  }
  if (node.name === "thresh")
    return `${prefix}threshold: ${argumentText(node)} of ${Math.max(0, node.args.length - 1)} conditions`;
  return `${prefix}${node.name}`;
}

/** Builds display lines for the full admitted syntax tree, including symbolic-only conditions. */
export function policyTree(node: ExpressionNode, prefix = "", last = true): string[] {
  const line = `${prefix}${prefix.length === 0 ? "" : last ? "└─ " : "├─ "}${treeLabel(node)}`;
  const children = node.args.filter(
    (argument): argument is ExpressionNode => typeof argument !== "string",
  );
  const childPrefix = prefix.length === 0 ? "" : `${prefix}${last ? "   " : "│  "}`;
  return [
    line,
    ...children.flatMap((child, index) =>
      policyTree(child, childPrefix, index === children.length - 1),
    ),
  ];
}

function directKeyExpressions(value: ExpressionNode): string[] {
  return DESCRIPTOR_FRAGMENTS.has("descriptorKeys", value.name) || value.name === "tr"
    ? typeof value.args[0] === "string"
      ? [value.args[0]]
      : []
    : value.name === "musig"
      ? value.args.filter((argument): argument is string => typeof argument === "string")
      : DESCRIPTOR_FRAGMENTS.has("multisig", value.name)
        ? value.args.slice(1).filter((argument): argument is string => typeof argument === "string")
        : [];
}

function collectKeys(value: ExpressionNode | string): string[] {
  if (typeof value === "string") return [];
  return [...directKeyExpressions(value).map(shortenedKey), ...value.args.flatMap(collectKeys)];
}

/** Lists original public key expressions for the separate derivation and validation owner. */
export function collectKeyExpressions(value: ExpressionNode | string): string[] {
  if (typeof value === "string") return [];
  return [...directKeyExpressions(value), ...value.args.flatMap(collectKeyExpressions)].filter(
    Boolean,
  );
}

function collectLocks(value: ExpressionNode | string): string[] {
  if (typeof value === "string") return [];
  const direct =
    value.name === "older"
      ? [`relative ${relativeLock(Number(value.args[0]))}`]
      : value.name === "after"
        ? [describeAbsolute(Number(value.args[0]))]
        : [];
  return [...direct, ...value.args.flatMap(collectLocks)];
}

/** Display name for an already admitted hashlock fragment. */
export function hashAlgorithm(name: string): string {
  return name === "sha256"
    ? "SHA-256"
    : name === "hash256"
      ? "HASH256"
      : name === "ripemd160"
        ? "RIPEMD-160"
        : "HASH160";
}

function collectPreimages(value: ExpressionNode | string): string[] {
  if (typeof value === "string") return [];
  const direct = DESCRIPTOR_FRAGMENTS.has("hashes", value.name)
    ? [`32-byte preimage for ${hashAlgorithm(value.name)} digest ${argumentText(value)}`]
    : [];
  return [...direct, ...value.args.flatMap(collectPreimages)];
}

interface PathEnumeration {
  readonly paths: ExpressionNode[][];
  readonly limited: boolean;
}

function combinePaths(left: PathEnumeration, right: PathEnumeration): PathEnumeration {
  if (
    left.limited ||
    right.limited ||
    left.paths.length * right.paths.length > MAX_DESCRIPTOR_PATH_CARDS
  ) {
    return { paths: [], limited: true };
  }
  return {
    paths: left.paths.flatMap((leftPath) =>
      right.paths.map((rightPath) => [...leftPath, ...rightPath]),
    ),
    limited: false,
  };
}

function pathAlternatives(value: ExpressionNode | string): PathEnumeration {
  if (typeof value === "string") return { paths: [], limited: false };
  const node = unwrapWrapper(value);
  if (node.name === "0") return { paths: [], limited: false };
  if (node.name === "1") return { paths: [[]], limited: false };
  if (DESCRIPTOR_FRAGMENTS.has("or", node.name)) {
    const children = node.args.map(pathAlternatives);
    if (children.some(({ limited }) => limited)) return { paths: [], limited: true };
    const paths = children.flatMap(({ paths }) => paths);
    return paths.length > MAX_DESCRIPTOR_PATH_CARDS
      ? { paths: [], limited: true }
      : { paths, limited: false };
  }
  if (node.name === "andor" && node.args.length === 3) {
    const condition = pathAlternatives(argumentAt(node, 0));
    const success = pathAlternatives(argumentAt(node, 1));
    const fallback = pathAlternatives(argumentAt(node, 2));
    const primary = combinePaths(condition, success);
    if (
      primary.limited ||
      fallback.limited ||
      primary.paths.length + fallback.paths.length > MAX_DESCRIPTOR_PATH_CARDS
    ) {
      return { paths: [], limited: true };
    }
    return { paths: [...primary.paths, ...fallback.paths], limited: false };
  }
  if (DESCRIPTOR_FRAGMENTS.has("and", node.name)) {
    return node.args.reduce<PathEnumeration>(
      (paths, argument) => combinePaths(paths, pathAlternatives(argument)),
      {
        paths: [[]],
        limited: false,
      },
    );
  }
  return { paths: [[node]], limited: false };
}

/** Interprets an already admitted expression; it does not validate a transaction satisfaction. */
export class DescriptorPolicy {
  readonly #node: ExpressionNode;
  constructor(node: ExpressionNode) {
    this.#node = node;
  }

  /** The complete symbolic condition, including alternatives that cards cannot enumerate. */
  describe(): string {
    return describeCondition(this.#node);
  }

  /** The expression tree for inspecting conditions absent from a concrete path summary. */
  tree(): string[] {
    return policyTree(this.#node);
  }

  /** Describes this leaf's own availability; an impossible script never inherits its key path. */
  spendingDescription(): string {
    const availability = this.cards().map((card) =>
      card.kind === "conditions" && card.locks?.length === 0
        ? "available immediately without a timelock"
        : card.availability,
    );
    return `${this.describe()}; ${[...new Set(availability)].join(" OR ")}.`;
  }

  static #symbolic(value: ExpressionNode | string): boolean {
    return (
      typeof value !== "string" &&
      (value.name === "thresh" ||
        DESCRIPTOR_FRAGMENTS.has("opaquePaths", value.name) ||
        value.args.some((argument) => DescriptorPolicy.#symbolic(argument)))
    );
  }

  /** Bounded path summaries; symbolic/overflow obligations remain explicitly unknown. */
  cards(): DescriptorPathCard[] {
    const enumerated = pathAlternatives(this.#node);
    if (enumerated.limited) {
      return [
        {
          kind: "symbolic",
          title: "Path summary",
          availability: "Too many alternatives to enumerate safely",
          requirement: `This descriptor has more than ${MAX_DESCRIPTOR_PATH_CARDS} possible spending-path combinations. Review the symbolic policy tree instead.`,
          keys: null,
          locks: null,
          preimages: null,
        },
      ];
    }
    if (enumerated.paths.length === 0)
      return [
        {
          kind: "impossible",
          title: "Unspendable policy",
          availability: "No satisfying path",
          requirement: "The decoded conditions have no satisfying path.",
          keys: [],
          locks: [],
          preimages: [],
        },
      ];
    return enumerated.paths.map<DescriptorPathCard>((alternative, index) => {
      const requirement = alternative.map(describeCondition).join(" AND ") || "No script condition";
      if (alternative.some((argument) => DescriptorPolicy.#symbolic(argument)))
        return {
          kind: "symbolic",
          title: `Path ${index + 1}`,
          availability: "Not summarized; review the symbolic policy",
          requirement,
          keys: null,
          locks: null,
          preimages: null,
        };
      const locks = alternative.flatMap(collectLocks);
      const keys = [...new Set(alternative.flatMap(collectKeys))];
      const preimages = [...new Set(alternative.flatMap(collectPreimages))];
      return {
        kind: "conditions",
        title: `Path ${index + 1}`,
        availability: locks.length === 0 ? "Immediate" : `After ${locks.join(" and ")}`,
        requirement,
        keys,
        locks,
        preimages,
      };
    });
  }
}

/** Compatibility entry point; the policy owner also exposes its complete tree and description. */
export function descriptorPathCards(node: ExpressionNode): DescriptorPathCard[] {
  return new DescriptorPolicy(node).cards();
}

function leavesAtDepth(tree: string, depth: number): string[] {
  if (depth > CONSENSUS_LIMITS.maximumTaprootTreeDepth) throw new DescriptorPolicyError("depth");
  if (tree.startsWith("{") && tree.endsWith("}")) {
    const children = splitTopLevel(tree.slice(1, -1));
    if (children.length !== 2) throw new DescriptorPolicyError("tree");
    return children.flatMap((child) => leavesAtDepth(child, depth + 1));
  }
  return [tree];
}

/** Lists binary Taproot tree leaves within the consensus depth bound; malformed branches fail. */
export function treeLeaves(tree: string): string[] {
  return leavesAtDepth(tree, 0);
}

/** The argument text of every `name(…)` fragment of a descriptor. */
export function calls(text: string, name: string): string[] {
  return fragmentBodies(text, name, "Descriptor");
}

/** Explains a BIP68 operand as blocks or 512-second units; a disable flag is explicitly named. */
export function relativeLock(value: number): string {
  const sequence = new RelativeSequence(value);
  if (sequence.disabled) return `${value} (disabled flag set; invalid as an active relative lock)`;
  if (sequence.timeBased) {
    const { seconds, units } = sequence;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${value} = ${units} × 512 seconds = ${seconds} seconds (${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")})`;
  }
  return `${value} = ${sequence.units} blocks`;
}
