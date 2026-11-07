// A shared m-of-n wallet built from its cosigners' account keys: each cosigner's child key at
// branch/index, the OP_CHECKMULTISIG script over them, and the coin's addresses and descriptor for
// that script. A coin brings only its scheme (wrapper, encodings, key limit), so a Dash-only build
// carries no other coin's text. Cosigners given as recovery phrases also yield their child private
// keys, marked secret; cosigners given as extended public keys yield public keys only.
import { HDKey } from "@scure/bip32";
import { assertBatch } from "@ckd/core/bip32.js";
import { assertIndex } from "@ckd/core/bip32-limits.js";
import { addDescriptorChecksum } from "@ckd/core/descriptor-checksum.js";
import { bytesToHex, concatBytes, wipe } from "@ckd/core/crypto.js";
import {
  field,
  type DerivationResult,
  type NetworkName,
  type ResultField,
  type ResultFieldGroup,
} from "@ckd/core/types.js";
import type { Bip32Versions } from "@ckd/core/networks.js";

/** `sorted` is BIP67 / sortedmulti; `entered` keeps the cosigners' order, as createmultisig does. */
export type MultisigKeyOrder = "sorted" | "entered";
export type MultisigBranch = 0 | 1;

/** One cosigner path family a scheme offers for cosigners given as recovery phrases. */
export interface MultisigCosignerPath {
  readonly id: string;
  readonly label: string;
  /** The account path, such as m/44'/5'/0'. */
  path(network: NetworkName, account: number): string;
}

/** How one coin wraps, encodes and limits a multisig script. */
export interface MultisigScheme {
  readonly id: string;
  readonly label: string;
  /** The most keys the wrapper admits: 15 for P2SH (520-byte redeem script), 20 for P2WSH. */
  readonly maxKeys: number;
  readonly cosignerPaths: readonly MultisigCosignerPath[];
  versions(network: NetworkName): Bip32Versions;
  /** Wraps `sortedmulti(…)` or `multi(…)` into the coin's descriptor form. */
  descriptor(inner: string): string;
  /** The addresses and scripts that the multisig script gives, as result fields. */
  outputs(script: Uint8Array, network: NetworkName): readonly ResultField[];
  /** The coin's WIF of a cosigner's child private key. */
  wif(privateKey: Uint8Array, network: NetworkName): string;
}

/** A cosigner's account: its public node, its key origin when known, and whether it can sign. */
export interface MultisigCosigner {
  readonly label: string;
  /** The account node; it carries a private key only for a cosigner given as a recovery phrase. */
  readonly account: HDKey;
  /** The master fingerprint (8 hex digits) and the account path in descriptor form (44h/5h/0h). */
  readonly origin?: { readonly fingerprint: string; readonly path: string };
}

export interface MultisigWalletRequest {
  readonly scheme: MultisigScheme;
  readonly network: NetworkName;
  readonly required: number;
  readonly order: MultisigKeyOrder;
  readonly cosigners: readonly MultisigCosigner[];
  readonly branch: MultisigBranch;
  readonly start: number;
  readonly count: number;
}

const OP_CHECKMULTISIG = 0xae;
const COMPRESSED_KEY_BYTES = 33;

/** Script's minimal number push, as Bitcoin and Dash Core write `CScript() << n` for 1…20. */
function pushNumber(value: number): Uint8Array {
  return value <= 16 ? Uint8Array.of(0x50 + value) : Uint8Array.of(0x01, value);
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1)
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  return left.length - right.length;
}

/** The keys in script order: BIP67's byte order, or as entered. */
export function orderMultisigKeys(
  keys: readonly Uint8Array[],
  order: MultisigKeyOrder,
): Uint8Array[] {
  return order === "sorted" ? [...keys].sort(compareBytes) : [...keys];
}

/**
 * `OP_m <key_1> … <key_n> OP_n OP_CHECKMULTISIG` over compressed keys already in script order.
 * Equal keys are refused: they lower the real threshold without showing it.
 */
export function multisigScript(required: number, keys: readonly Uint8Array[]): Uint8Array {
  if (!Number.isSafeInteger(required) || required < 1 || required > keys.length)
    throw new Error("The required signatures must be between 1 and the number of cosigners.");
  if (keys.length > 20) throw new Error("A multisig script has at most 20 keys.");
  const seen = new Set<string>();
  for (const key of keys) {
    if (key.length !== COMPRESSED_KEY_BYTES || (key[0] !== 2 && key[0] !== 3))
      throw new Error("Every multisig key must be a compressed public key.");
    const hex = bytesToHex(key);
    if (seen.has(hex)) throw new Error("Two cosigners give the same public key.");
    seen.add(hex);
  }
  return concatBytes(
    pushNumber(required),
    ...keys.flatMap((key) => [Uint8Array.of(COMPRESSED_KEY_BYTES), key]),
    pushNumber(keys.length),
    Uint8Array.of(OP_CHECKMULTISIG),
  );
}

/** Reads `[fingerprint/path]xpub`, `[fingerprint/path]tpub` or a bare account xpub/tpub. */
export function parseCosignerKey(
  text: string,
  versions: Bip32Versions,
): { account: HDKey; origin?: { fingerprint: string; path: string } } {
  const match =
    /^(?:\[([0-9a-fA-F]{8})((?:\/[0-9]+['hH]?)*)\])?([1-9A-HJ-NP-Za-km-z]{100,120})$/u.exec(
      text.trim(),
    );
  if (match === null)
    throw new Error(
      "A cosigner key must be an account xpub or tpub, optionally with [fingerprint/path].",
    );
  let account: HDKey;
  try {
    account = HDKey.fromExtendedKey(match[3]!, versions);
  } catch {
    throw new Error("A cosigner key is not an extended public key of the selected network.");
  }
  if (account.privateKey !== null) {
    account.wipePrivateData();
    throw new Error("Enter a cosigner's extended public key, not its private key.");
  }
  if (match[1] === undefined) return { account };
  const path = match[2]!
    .split("/")
    .filter((part) => part !== "")
    .map((part) => part.replace(/['H]$/u, "h"))
    .join("/");
  return { account, origin: { fingerprint: match[1].toLowerCase(), path } };
}

/** The descriptor form of an account path m/44'/5'/0' (44h/5h/0h). */
export function descriptorPath(path: string): string {
  return path.replace(/^m\/?/u, "").replaceAll("'", "h");
}

function cosignerKeyText(cosigner: MultisigCosigner, branch: MultisigBranch): string {
  const origin =
    cosigner.origin === undefined
      ? ""
      : `[${cosigner.origin.fingerprint}${cosigner.origin.path === "" ? "" : `/${cosigner.origin.path}`}]`;
  return `${origin}${cosigner.account.publicExtendedKey}/${branch}/*`;
}

/** The ranged watch-only descriptor of one branch, with its checksum. */
export function multisigDescriptor(request: MultisigWalletRequest): string {
  const keys = request.cosigners.map((cosigner) => cosignerKeyText(cosigner, request.branch));
  const inner = `${request.order === "sorted" ? "sortedmulti" : "multi"}(${request.required},${keys.join(",")})`;
  return addDescriptorChecksum(request.scheme.descriptor(inner));
}

function assertWallet(request: MultisigWalletRequest): void {
  const { cosigners, scheme } = request;
  if (cosigners.length < 2) throw new Error("A multisig wallet needs at least two cosigners.");
  if (cosigners.length > scheme.maxKeys)
    throw new Error(`${scheme.label} admits at most ${scheme.maxKeys} cosigners.`);
  if (request.required < 1 || request.required > cosigners.length)
    throw new Error("The required signatures must be between 1 and the number of cosigners.");
  const accounts = new Set(cosigners.map(({ account }) => account.publicExtendedKey));
  if (accounts.size !== cosigners.length)
    throw new Error(
      "Two cosigners have the same account key: the same phrase or xpub was entered twice.",
    );
  assertBatch(request.start, request.count);
  assertIndex(request.branch, "Branch");
}

function cosignerGroup(
  request: MultisigWalletRequest,
  cosigner: MultisigCosigner,
  place: number,
  child: HDKey,
): ResultFieldGroup {
  const key = `cosigner${place + 1}`;
  const suffix = `${request.branch}/${child.index}`;
  const basic: ResultField[] = [
    field(`${key}PublicKey`, "Child public key", bytesToHex(child.publicKey!)),
  ];
  const advanced: ResultField[] = [
    field(
      `${key}Path`,
      "Child path",
      cosigner.origin === undefined
        ? `(account)/${suffix}`
        : `m/${cosigner.origin.path === "" ? "" : `${cosigner.origin.path}/`}${suffix}`.replaceAll(
            "h",
            "'",
          ),
    ),
  ];
  if (child.privateKey !== null) {
    const privateKey = Uint8Array.from(child.privateKey);
    try {
      basic.push(
        field(
          `${key}PrivateKeyWif`,
          "Child private key (WIF)",
          request.scheme.wif(privateKey, request.network),
          true,
        ),
      );
      advanced.push(
        field(
          `${key}PrivateKeyHex`,
          "Child private key (raw 32-byte hex)",
          bytesToHex(privateKey),
          true,
        ),
      );
    } finally {
      wipe(privateKey);
    }
  }
  return {
    key,
    title: cosigner.label,
    description:
      child.privateKey === null
        ? "Public key only: this cosigner was entered as an extended public key."
        : "This cosigner was entered as a recovery phrase, so its child private key is shown when private keys are revealed.",
    basic,
    advanced,
  };
}

/** One branch of a shared m-of-n wallet over an index range, as a derivation result. */
export function buildMultisigWallet(request: MultisigWalletRequest): DerivationResult {
  assertWallet(request);
  const branchNodes = request.cosigners.map(({ account }) => account.deriveChild(request.branch));
  try {
    const rows = [];
    for (let offset = 0; offset < request.count; offset += 1) {
      const index = request.start + offset;
      const children = branchNodes.map((node) => node.deriveChild(index));
      try {
        const keys = orderMultisigKeys(
          children.map((child) => child.publicKey!),
          request.order,
        );
        const script = multisigScript(request.required, keys);
        if (script.length > 520) throw new Error("The redeem script is longer than 520 bytes.");
        rows.push({
          index,
          path: `${request.branch}/${index}`,
          title: `Address #${index}`,
          basic: [...request.scheme.outputs(script, request.network)],
          advanced: [
            field("redeemScript", "Multisig script", bytesToHex(script)),
            field("scriptKeys", "Public keys in script order", keys.map(bytesToHex).join("\n")),
          ],
          groups: request.cosigners.map((cosigner, place) =>
            cosignerGroup(request, cosigner, place, children[place]!),
          ),
        });
      } finally {
        for (const child of children) child.wipePrivateData();
      }
    }
    const cosignerFields = request.cosigners.flatMap((cosigner, place) => [
      field(
        `cosigner${place + 1}AccountKey`,
        `${cosigner.label} · account key`,
        cosigner.origin === undefined
          ? cosigner.account.publicExtendedKey
          : `[${cosigner.origin.fingerprint}/${cosigner.origin.path}]${cosigner.account.publicExtendedKey}`,
      ),
    ]);
    return {
      id: `multisig-${request.scheme.id}`,
      title: `${request.scheme.label} · ${request.required} of ${request.cosigners.length}`,
      networkLabel: request.network === "mainnet" ? "Mainnet" : "Testnet",
      pathTemplate: `(each cosigner's account)/${request.branch}/i`,
      basicSummary: [
        field(
          "requirement",
          "Signatures required",
          `${request.required} of ${request.cosigners.length}`,
        ),
        field(
          "keyOrder",
          "Key order",
          request.order === "sorted"
            ? "Sorted (BIP67, sortedmulti)"
            : "As entered (multi, createmultisig)",
        ),
        field("descriptor", "Watch-only descriptor", multisigDescriptor(request)),
      ],
      summary: cosignerFields,
      rows,
      notices: [
        "Every cosigner's recovery phrase on one page undoes what multisig protects against. Use this for recovery and checking, offline, and keep private keys hidden unless you need them.",
        "The order of the keys changes the address. Sorted order is what descriptor wallets use (sortedmulti); Dash Core's createmultisig and addmultisigaddress keep the order in which the keys are given.",
      ],
    };
  } finally {
    for (const node of branchNodes) node.wipePrivateData();
  }
}

/** One cosigner as the page sends it: a seed's place in the request's seeds, or its account key. */
export type MultisigCosignerInput = { readonly seed: number } | { readonly key: string };

/** A multisig wallet request as the page sends it to the worker; the seeds travel beside it. */
export interface MultisigWalletOptions {
  readonly schemeId: string;
  readonly network: NetworkName;
  readonly required: number;
  readonly order: MultisigKeyOrder;
  /** The cosigner path of the cosigners given as recovery phrases. */
  readonly pathId: string;
  readonly account: number;
  readonly branch: MultisigBranch;
  readonly start: number;
  readonly count: number;
  readonly cosigners: readonly MultisigCosignerInput[];
}

/**
 * Builds the wallet of `options` with the schemes the build carries: each seed's account node at
 * the chosen cosigner path, origin-tagged with its master fingerprint, and each extended public key
 * as given. Every private node and the seeds are wiped before this returns.
 */
export function deriveMultisigWallet(
  seeds: readonly Uint8Array[],
  options: MultisigWalletOptions,
  schemes: readonly MultisigScheme[],
): DerivationResult {
  const cosigners: MultisigCosigner[] = [];
  try {
    const scheme = schemes.find(({ id }) => id === options.schemeId);
    if (scheme === undefined) throw new Error("This multisig type is not in this build.");
    const path = scheme.cosignerPaths.find(({ id }) => id === options.pathId);
    if (path === undefined) throw new Error("Choose a cosigner path of this multisig type.");
    const versions = scheme.versions(options.network);
    const accountPath = path.path(options.network, options.account);
    for (const [place, input] of options.cosigners.entries()) {
      if ("key" in input) {
        cosigners.push({
          label: `Cosigner ${place + 1} · extended public key`,
          ...parseCosignerKey(input.key, versions),
        });
        continue;
      }
      const seed = seeds[input.seed];
      if (seed === undefined) throw new Error(`Cosigner ${place + 1} has no seed.`);
      const root = HDKey.fromMasterSeed(seed, versions);
      try {
        cosigners.push({
          label: `Cosigner ${place + 1} · recovery phrase`,
          account: root.derive(accountPath),
          origin: {
            fingerprint: root.fingerprint.toString(16).padStart(8, "0"),
            path: descriptorPath(accountPath),
          },
        });
      } finally {
        root.wipePrivateData();
      }
    }
    return buildMultisigWallet({
      scheme,
      network: options.network,
      required: options.required,
      order: options.order,
      cosigners,
      branch: options.branch,
      start: options.start,
      count: options.count,
    });
  } finally {
    for (const { account } of cosigners) account.wipePrivateData();
    for (const seed of seeds) seed.fill(0);
  }
}
