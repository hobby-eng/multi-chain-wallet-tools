import { DESCRIPTOR_FRAGMENTS } from "./descriptor-fragments.js";
import { descriptorChecksum } from "@ckd/core/descriptor-checksum.js";
import { materializeDescriptorKey, validateDescriptorPublicKey } from "@ckd/core/descriptor-key.js";
import { CONSENSUS_LIMITS, RelativeSequence } from "./consensus-limits.js";
import { analyzeMusigDescriptor } from "./musig-descriptor.js";
import {
  compiledDescriptorOutput,
  validateDescriptorMiniscript,
  validateNodeKeys,
} from "./descriptor-compiler.js";
import {
  calls,
  collectKeyExpressions,
  collectWrappers,
  describeAbsolute,
  describeCondition,
  describeTaprootKey,
  DescriptorPolicy,
  expression,
  hashAlgorithm,
  matchingClose,
  miniscriptAnalysis,
  relativeLock,
  shortenedKey,
  splitTopLevel,
  treeLeaves,
  WRAPPER_MEANINGS,
  type DescriptorPathCard,
  type ExpressionNode,
} from "./descriptor-policy.js";
import type { DecodedDescriptor, DescriptorRow } from "./descriptor-types.js";
import type { PsbtNetwork } from "./psbt-types.js";
import { InspectorNetworkChoice } from "./network-choice.js";
import { IntegerInput } from "@ckd/core/validation.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { MAX_SCRIPT_TEXT_UNITS } from "./script-text-limit.js";

/** Seconds of a block, about ten minutes: only for an estimate of a block-based lock. */
const APPROXIMATE_BLOCK_SECONDS = 600;
// Analysis admission bound in UTF-16 code units, including text before preprocessing.
const MAX_DESCRIPTOR_TEXT_UNITS = MAX_SCRIPT_TEXT_UNITS;
const REFUSALS = {
  input: "Descriptor is empty, malformed or unreasonably large.",
  options: "Select valid descriptor decoding options.",
  checksumFormat: "Invalid descriptor checksum: the checksum must contain eight characters.",
  checksum:
    "Invalid descriptor checksum: it covers the exact descriptor text, including every derivation wildcard and space.",
  removedWildcard:
    'Invalid descriptor checksum: a wildcard was removed. Restore "/*" at derivation paths ending with "/".',
  whitespace:
    "Whitespace is not permitted inside a descriptor expression; its checksum covers the exact spaced text.",
  expression: "Input is neither Script hex nor a recognized output descriptor.",
  root: "Unsupported top-level descriptor.",
  raw: "Malformed Script hex in raw(): only non-empty hexadecimal bytes are allowed.",
  oddRaw: "Malformed Script hex in raw(): odd-length hex is missing one nibble.",
  dash: "Dash Community descriptors are limited to legacy pk(), pkh(), sh(), multi(), sortedmulti(), addr(), raw(), and supported legacy Script/Miniscript fragments. SegWit, Taproot, and MuSig2 are unavailable on Dash.",
  policy: "Unsupported top-level Miniscript or malformed descriptor expression.",
  arity: "Invalid output descriptor arity.",
  combo: "combo() requires one public key expression.",
  silentArity: "Silent Payments descriptors require scan and spend keys.",
  silentKey: "Invalid Silent Payments key expression.",
  relative: "Invalid timelock: older() requires a positive value below the BIP68 disable flag.",
  absolute: "Invalid timelock: after() is outside the supported nLockTime range.",
  hash32: "Hashlock requires exactly 32 digest bytes encoded as hexadecimal.",
  hash20: "Hashlock requires exactly 20 digest bytes encoded as hexadecimal.",
} as const;

/** Stable descriptor refusals without supplied text, key expressions or lock operands. */
export class DescriptorError extends Error {
  readonly code: `descriptor.${keyof typeof REFUSALS}`;
  constructor(reason: keyof typeof REFUSALS) {
    super(REFUSALS[reason]);
    this.name = "DescriptorError";
    this.code = `descriptor.${reason}`;
  }
}

export { descriptorChecksum };
export type { DescriptorPathCard } from "./descriptor-policy.js";
export type {
  DecodedDescriptor,
  DescriptorCompiledOutput,
  DescriptorRow,
} from "./descriptor-types.js";

/** Network and derivation selection; indexes count unhardened BIP32 children. */
export interface DescriptorOptions {
  readonly chain?: "bitcoin" | "dash";
  readonly network?: PsbtNetwork;
  readonly multipathChoice?: 0 | 1;
  readonly wildcardIndex?: number;
}
interface DescriptorSource {
  readonly payload: string;
  readonly type: string;
  readonly supplied: string | null;
  readonly expected: string;
}
interface DescriptorCounts {
  readonly scriptPaths: number;
  readonly locks: number;
  readonly musigs: number;
  readonly hashlocks: number;
}
const OPTION_NAMES = ["chain", "network", "multipathChoice", "wildcardIndex"] as const;
function selectedIndex(value: unknown, label: string, maximum: number): number {
  // Library options use numbers; native controls use text. All integer rules stay with IntegerInput.
  return IntegerInput.parse(
    typeof value === "number" ? value.toString() : value,
    label,
    0,
    maximum,
  );
}
function admittedDescriptor(input: string, options: DescriptorOptions): DescriptorSource {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_DESCRIPTOR_TEXT_UNITS)
    throw new DescriptorError("input");
  const normalized = input.trim().replaceAll("\\_", "_").replaceAll("\\*", "*");
  const separator = normalized.lastIndexOf("#");
  const payload = separator === -1 ? normalized : normalized.slice(0, separator);
  const supplied = separator === -1 ? null : normalized.slice(separator + 1);
  if (payload.length === 0) throw new DescriptorError("input");
  if (supplied !== null && !/^[a-z0-9]{8}$/u.test(supplied))
    throw new DescriptorError("checksumFormat");
  const expected = descriptorChecksum(payload);
  if (supplied !== null && supplied !== expected) {
    const restoredWildcards = payload.replaceAll(/\/(?=[,)}])/gu, "/*");
    if (restoredWildcards !== payload && descriptorChecksum(restoredWildcards) === supplied) {
      throw new DescriptorError("removedWildcard");
    }
    throw new DescriptorError("checksum");
  }
  if (/\s/u.test(payload)) throw new DescriptorError("whitespace");
  const type = /^([a-z0-9_]+)\(/u.exec(payload)?.[1];
  if (type === undefined) throw new DescriptorError("expression");
  if (!DESCRIPTOR_FRAGMENTS.has("roots", type)) throw new DescriptorError("root");
  if (type === "raw") {
    const open = payload.indexOf("(");
    const rawScript = payload.slice(open + 1, matchingClose(payload, open));
    if (rawScript.length === 0 || !/^[0-9a-fA-F]+$/u.test(rawScript))
      throw new DescriptorError("raw");
    if (rawScript.length % 2 !== 0) throw new DescriptorError("oddRaw");
  }
  if (options.chain === "dash") {
    if (
      !DESCRIPTOR_FRAGMENTS.has("legacyRoots", type) ||
      /(?:^|[,(])(?:wpkh|wsh|tr|rawtr|sp|multi_a|sortedmulti_a|musig)\(/u.test(payload)
    ) {
      throw new DescriptorError("dash");
    }
  }

  return { payload, type, supplied, expected };
}
/** Owns one descriptor and composes validation, policy knowledge and concrete output. */
export class DescriptorDecoder {
  readonly #source: DescriptorSource;
  readonly #options: Required<DescriptorOptions>;
  readonly #parsed: ExpressionNode;

  /** Shared raw Script/descriptor admission limit, measured in UTF-16 code units before trimming. */
  static get maximumTextUnits(): number {
    return MAX_DESCRIPTOR_TEXT_UNITS;
  }

  /** Snapshots options and refuses malformed syntax before interpreting spending conditions. */
  constructor(input: string, options: DescriptorOptions = {}) {
    this.#options = DescriptorDecoder.selection(options);
    this.#source = admittedDescriptor(input, this.#options);
    this.#parsed = this.#readPolicy();
  }

  /** Admits library options or raw UI selections; returns exact chain/network and bounded indexes. */
  static selection(options: unknown): Required<DescriptorOptions> {
    if (options === null || typeof options !== "object" || Array.isArray(options))
      throw new DescriptorError("options");
    const prototype: unknown = Object.getPrototypeOf(options);
    if (prototype !== Object.prototype && prototype !== null) throw new DescriptorError("options");
    if (Object.keys(options).some((key) => !OPTION_NAMES.some((name) => name === key)))
      throw new DescriptorError("options");
    const chain = InspectorNetworkChoice.chain("chain" in options ? options.chain : "bitcoin");
    const network = new InspectorNetworkChoice(
      chain,
      "network" in options ? options.network : "mainnet",
    ).network;
    const branch = selectedIndex(
      "multipathChoice" in options ? options.multipathChoice : 0,
      "Descriptor branch",
      1,
    );
    if (branch !== 0 && branch !== 1) throw new DescriptorError("options");
    const wildcardIndex = selectedIndex(
      "wildcardIndex" in options ? options.wildcardIndex : 0,
      "Descriptor wildcard index",
      MAX_BIP32_INDEX,
    );
    return { chain, network, multipathChoice: branch, wildcardIndex };
  }
  #readPolicy(): ExpressionNode {
    const { payload, type } = this.#source;
    const options = this.#options;
    const parsedDescriptor = expression(payload);
    if (parsedDescriptor === null) throw new DescriptorError("policy");
    if (
      type === "tr"
        ? parsedDescriptor.args.length < 1 || parsedDescriptor.args.length > 2
        : !DESCRIPTOR_FRAGMENTS.has("multipleArguments", type) && parsedDescriptor.args.length !== 1
    )
      throw new DescriptorError("arity");
    if (type === "combo" && typeof parsedDescriptor.args[0] !== "string")
      throw new DescriptorError("combo");
    if (type === "sp") {
      if (parsedDescriptor.args.length !== 2) throw new DescriptorError("silentArity");
      for (const key of parsedDescriptor.args) {
        if (typeof key === "string")
          validateDescriptorPublicKey(key, options.network, {
            wildcardIndex: options.wildcardIndex,
          });
        else if (key.name !== "musig") throw new DescriptorError("silentKey");
      }
    }
    validateNodeKeys(parsedDescriptor, options.network, type === "tr", options.wildcardIndex);
    validateDescriptorMiniscript(payload, type);
    return parsedDescriptor;
  }
  #baseRows(): DescriptorRow[] {
    const { payload, type } = this.#source;
    const rows: DescriptorRow[] = [];
    const xpubs = [
      ...payload.matchAll(
        /(?:\[[0-9a-fA-F]{8}(?:\/[^\]]+)?\])?[xt]pub[1-9A-HJ-NP-Za-km-z]+(?:\/(?:[0-9]+['hH]?|<[^>]+>|\*))*/gu,
      ),
    ].map((match) => match[0]);
    rows.push({
      label: "Extended public keys",
      value: `${xpubs.length} occurrences · ${new Set(xpubs).size} distinct expressions`,
    });
    xpubs.forEach((key, index) =>
      rows.push({ label: `Key expression ${index + 1}`, value: shortenedKey(key) }),
    );

    if (type === "tr" || type === "rawtr") {
      const close = matchingClose(payload, payload.indexOf("("));
      const argumentsList = splitTopLevel(payload.slice(payload.indexOf("(") + 1, close));
      rows.unshift({
        label: "Taproot key path",
        value: argumentsList[0] === undefined ? "Missing" : shortenedKey(argumentsList[0]),
      });
      if (argumentsList[1] !== undefined) {
        treeLeaves(argumentsList[1]).forEach((leaf, index) => {
          const analysis = miniscriptAnalysis(leaf, true);
          if (analysis !== null)
            rows.push({ label: `Tapscript analysis ${index + 1}`, value: analysis });
        });
      }
    } else if (type === "wsh" || type === "sh") {
      const open = payload.indexOf("(");
      const inner = payload.slice(open + 1, matchingClose(payload, open));
      const analysis = miniscriptAnalysis(inner);
      if (analysis !== null) rows.push({ label: "Miniscript analysis", value: analysis });
    }
    return rows;
  }
  #keyRows(rows: DescriptorRow[]): void {
    const options = this.#options;
    const parsedDescriptor = this.#parsed;
    const keyExpressions = [...new Set(collectKeyExpressions(parsedDescriptor))];
    keyExpressions.forEach((key, index) => {
      const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
      const extendedKey = /([xt]pub[1-9A-HJ-NP-Za-km-z]+)/u.exec(key)?.[1];
      const bareKey = key.replace(/^\[[^\]]+\]/u, "");
      const suffix =
        extendedKey === undefined
          ? "fixed key"
          : key.slice(key.indexOf(extendedKey) + extendedKey.length) || "none";
      rows.push(
        {
          label: `Key ${index + 1} · master fingerprint`,
          value: origin?.split("/")[0] ?? "Not supplied",
        },
        {
          label: `Key ${index + 1} · origin path`,
          value:
            origin?.includes("/") === true
              ? `m/${origin.split("/").slice(1).join("/")}`
              : "Not supplied",
        },
        {
          label: `Key ${index + 1} · ${extendedKey === undefined ? "public key" : "extended key"}`,
          value: extendedKey ?? bareKey,
        },
        { label: `Key ${index + 1} · descriptor suffix`, value: suffix },
        {
          label: `Key ${index + 1} · selected branch / index`,
          value: `${options.multipathChoice} / ${options.wildcardIndex}`,
        },
        {
          label: `Key ${index + 1} · derived public key`,
          value: /^[0-9a-fA-F]{64}$/u.test(bareKey)
            ? bareKey.toLowerCase()
            : materializeDescriptorKey(
                key,
                options.network,
                options.multipathChoice,
                options.wildcardIndex,
              ),
        },
      );
    });
    if (parsedDescriptor !== null) {
      [...new Set(collectWrappers(parsedDescriptor))].forEach((wrapper) => {
        rows.push({
          label: `Wrapper ${wrapper}:`,
          value:
            WRAPPER_MEANINGS[wrapper] ??
            "recognized wrapper; inspect the compiled operations for its exact stack transformation",
        });
      });
    }
  }
  #aggregateRows(
    rows: DescriptorRow[],
    musigAnalysis: ReturnType<typeof analyzeMusigDescriptor>,
  ): void {
    musigAnalysis?.keys.forEach((key, index) => {
      rows.push(
        {
          label: `MuSig2 aggregate ${index + 1}`,
          value: `${key.participantCount} participants · ${key.aggregateCompressedKey}`,
        },
        { label: `MuSig2 derivation ${index + 1}`, value: key.derivation },
        {
          label: `MuSig2 sorted participants ${index + 1}`,
          value: key.sortedParticipantKeys.join(" · "),
        },
      );
      if (key.syntheticXpub !== null)
        rows.push({ label: `BIP-328 synthetic xpub ${index + 1}`, value: key.syntheticXpub });
    });
    if (musigAnalysis?.outputScript !== null && musigAnalysis?.outputScript !== undefined)
      rows.push({ label: "Derived output script", value: musigAnalysis.outputScript });
    if (musigAnalysis?.address !== null && musigAnalysis?.address !== undefined)
      rows.push({ label: "Derived address", value: musigAnalysis.address });
  }
  #multisigRows(rows: DescriptorRow[]): number {
    const { payload } = this.#source;
    const multisigs = [
      ...calls(payload, "multi_a").map((body) => ({ body, sorted: false })),
      ...calls(payload, "sortedmulti_a").map((body) => ({ body, sorted: true })),
    ];
    const classicMultisigs = [
      ...calls(payload, "multi").map((body) => ({ body, sorted: false })),
      ...calls(payload, "sortedmulti").map((body) => ({ body, sorted: true })),
    ];
    classicMultisigs.forEach(({ body, sorted }, index) => {
      const argumentsList = splitTopLevel(body);
      rows.push(
        {
          label: `Multisig ${index + 1} · threshold`,
          value: `${String(argumentsList[0])}-of-${Math.max(0, argumentsList.length - 1)}`,
        },
        {
          label: `Multisig ${index + 1} · key order`,
          value: sorted
            ? "BIP67 lexicographic sort · sortedmulti()"
            : "Supplied order preserved · multi()",
        },
      );
    });
    multisigs.forEach(({ body, sorted }, index) => {
      const argumentsList = splitTopLevel(body);
      const threshold = Number(argumentsList[0]);
      rows.push({
        label: `Tapscript multisig ${index + 1}`,
        value: `${threshold}-of-${Math.max(0, argumentsList.length - 1)} · ${sorted ? "lexicographic x-only key sort · sortedmulti_a()" : "supplied key order · multi_a()"}`,
      });
    });
    return multisigs.length;
  }
  #lockRows(rows: DescriptorRow[]): number {
    const { payload } = this.#source;
    const locks = calls(payload, "older");
    locks.forEach((body, index) => {
      const value = Number(body);
      if (!Number.isSafeInteger(value) || value < 1 || value >= CONSENSUS_LIMITS.bip68DisableFlag)
        throw new DescriptorError("relative");
      const { timeBased, units, seconds } = new RelativeSequence(value);
      // A block takes about ten minutes; a time-based lock's units are exactly 512 seconds.
      const approximateSeconds = timeBased ? seconds : units * APPROXIMATE_BLOCK_SECONDS;
      rows.push(
        { label: `Relative lock ${index + 1}`, value: relativeLock(value) },
        ...(units === 0
          ? [
              {
                label: `Timelock ${index + 1} · effective constraint`,
                value:
                  "None · BIP68 masks this value to a zero delay; reserved bits do not add a lock.",
              },
            ]
          : []),
        { label: `Timelock ${index + 1} · type`, value: "Relative" },
        { label: `Timelock ${index + 1} · opcode`, value: "OP_CHECKSEQUENCEVERIFY" },
        { label: `Timelock ${index + 1} · BIPs`, value: "BIP68 / BIP112" },
        { label: `Timelock ${index + 1} · value`, value: relativeLock(value) },
        { label: `Timelock ${index + 1} · starts from`, value: "Confirmation of the spent UTXO" },
        {
          label: `Timelock ${index + 1} · approximate duration`,
          value: `~${Math.round(approximateSeconds / 3600)} hours${timeBased ? " (512-second units)" : " (assuming ~10-minute blocks)"}`,
        },
      );
    });
    const absoluteLocks = calls(payload, "after");
    absoluteLocks.forEach((body, index) => {
      const value = Number(body);
      if (!Number.isSafeInteger(value) || value < 1 || value >= CONSENSUS_LIMITS.bip68DisableFlag)
        throw new DescriptorError("absolute");
      rows.push(
        {
          label: `Absolute timelock ${index + 1} · type`,
          value:
            value < CONSENSUS_LIMITS.absoluteLockTimeThreshold
              ? "Absolute block height"
              : "Absolute median-time-past",
        },
        { label: `Absolute timelock ${index + 1} · opcode`, value: "OP_CHECKLOCKTIMEVERIFY" },
        { label: `Absolute timelock ${index + 1} · BIP`, value: "BIP65" },
        { label: `Absolute timelock ${index + 1} · value`, value: describeAbsolute(value) },
      );
    });
    return locks.length;
  }
  #hashRows(rows: DescriptorRow[]): number {
    const { payload } = this.#source;
    const hashlocks = DESCRIPTOR_FRAGMENTS.names("hashes").flatMap((name) =>
      calls(payload, name).map((digest) => ({ name, digest })),
    );
    hashlocks.forEach(({ name, digest }, index) => {
      const expectedLength = name === "sha256" || name === "hash256" ? 64 : 40;
      if (!new RegExp(`^[0-9a-fA-F]{${expectedLength}}$`, "u").test(digest)) {
        throw new DescriptorError(expectedLength === 64 ? "hash32" : "hash20");
      }
      rows.push({
        label: `Hashlock ${index + 1}`,
        value: `${hashAlgorithm(name)} digest ${digest.toLowerCase()} · spending requires the exact 32-byte preimage`,
      });
    });
    return hashlocks.length;
  }
  #summary(counts: DescriptorCounts): string {
    const { type } = this.#source;
    const summaryParts = [
      type === "tr"
        ? "Taproot descriptor with key-path spending"
        : type === "rawtr"
          ? "Raw Taproot output descriptor"
          : type === "sp"
            ? "Silent Payments descriptor"
            : `${type} output descriptor`,
    ];
    if (counts.scriptPaths > 0)
      summaryParts.push(
        `${counts.scriptPaths} multi_a script-path ${counts.scriptPaths === 1 ? "branch" : "branches"}`,
      );
    if (counts.locks > 0)
      summaryParts.push(
        `${counts.locks} relative timelock ${counts.locks === 1 ? "condition" : "conditions"}`,
      );
    if (counts.musigs > 0)
      summaryParts.push(
        `${counts.musigs} MuSig2 aggregate ${counts.musigs === 1 ? "key" : "keys"}`,
      );
    if (counts.hashlocks > 0)
      summaryParts.push(
        `${counts.hashlocks} preimage/hashlock ${counts.hashlocks === 1 ? "condition" : "conditions"}`,
      );
    return summaryParts.join(" · ");
  }
  #paths(rows: DescriptorRow[]): {
    spendingPaths: string[];
    cards: DescriptorPathCard[];
    tree: string[];
  } {
    const { payload, type } = this.#source;
    const spendingPaths: string[] = [];
    let cards: DescriptorPathCard[] = [];
    let tree: string[] = [];
    if (type === "tr") {
      const close = matchingClose(payload, payload.indexOf("("));
      const argumentsList = splitTopLevel(payload.slice(payload.indexOf("(") + 1, close));
      if (argumentsList[0] !== undefined) {
        spendingPaths.push(
          `Taproot key path: ${describeTaprootKey(argumentsList[0])}; available without a script timelock if the corresponding private key is spendable.`,
        );
      }
      if (argumentsList[1] !== undefined)
        treeLeaves(argumentsList[1]).forEach((leaf, index) => {
          const parsed = expression(leaf);
          if (parsed === null) throw new DescriptorError("policy");
          const policy = new DescriptorPolicy(parsed);
          spendingPaths.push(`Tapscript path ${index + 1}: ${policy.spendingDescription()}`);
        });
      const outer = this.#parsed;
      if (outer !== null) {
        const policy = new DescriptorPolicy(outer);
        cards = policy.cards();
        tree = policy.tree();
      }
    } else {
      const outer = this.#parsed;
      if (outer !== null) {
        spendingPaths.push(`Script path: ${describeCondition(outer)}.`);
        const policy = new DescriptorPolicy(outer);
        cards = policy.cards();
        tree = policy.tree();
      }
      const hasHtlcShape =
        cards.some(
          (card) =>
            card.preimages !== null && card.preimages.length > 0 && card.locks?.length === 0,
        ) &&
        cards.some(
          (card) => card.preimages?.length === 0 && card.locks !== null && card.locks.length > 0,
        );
      if (hasHtlcShape) {
        rows.push({
          label: "HTLC-like structure",
          value:
            "One branch spends with a 32-byte hash preimage; an alternative branch spends after a timelock. Required signatures are listed separately for each path.",
        });
      }
    }
    rows.unshift(
      ...spendingPaths.map((path, index) => ({
        label: `Spending alternative ${index + 1}`,
        value: path,
      })),
    );
    return { spendingPaths, cards, tree };
  }

  /** Returns fresh explanatory rows and output; unknown obligations remain null. */
  decode(): DecodedDescriptor {
    const { payload, type, supplied, expected } = this.#source;
    const options = this.#options;
    const rows = this.#baseRows();
    // Aggregate-level paths are admitted before ordinary derived-key rows, as in the public API.
    const musigAnalysis = analyzeMusigDescriptor(
      payload,
      options.network,
      options.wildcardIndex,
      options.multipathChoice,
    );
    this.#keyRows(rows);
    this.#aggregateRows(rows, musigAnalysis);
    const compiledOutput = compiledDescriptorOutput(
      payload,
      type,
      options.chain,
      options.network,
      options.multipathChoice,
      options.wildcardIndex,
    );
    const counts: DescriptorCounts = {
      scriptPaths: this.#multisigRows(rows),
      locks: this.#lockRows(rows),
      musigs: calls(payload, "musig").length,
      hashlocks: this.#hashRows(rows),
    };
    const { spendingPaths, cards, tree } = this.#paths(rows);
    return {
      classification:
        type === "tr"
          ? "BIP-386 Taproot output descriptor + Tapscript Miniscript"
          : type === "rawtr"
            ? "Bitcoin Core raw Taproot descriptor (referenced by BIP-390)"
            : type === "sp"
              ? "BIP-352 Silent Payments descriptor"
              : `${type} output descriptor`,
      summary: this.#summary(counts),
      checksum: supplied === null ? `not supplied (calculated ${expected})` : `valid · ${supplied}`,
      ranged: payload.includes("*"),
      spendingPaths,
      pathCards: cards,
      policyTree: tree,
      rows,
      compiledOutput,
    };
  }
}

/** Compatibility facade for a descriptor interpretation under the supplied selection. */
export function decodeDescriptor(
  input: string,
  options: DescriptorOptions = {},
): DecodedDescriptor {
  return new DescriptorDecoder(input, options).decode();
}
