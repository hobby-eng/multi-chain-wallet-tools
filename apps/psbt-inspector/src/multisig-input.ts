import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { validateDescriptorPublicKey } from "@ckd/core/descriptor-key.js";
import { InspectorNetworkChoice } from "./network-choice.js";
import type { PsbtChain, PsbtNetwork } from "./psbt-types.js";

const PARAMETERS = Object.freeze({ maxAddressesPerBranch: 200, maxKeyCodeUnits: 65536 });
const REFUSALS = {
  "multisig.branch": "Select branch 0 (receive) or 1 (change).",
  "multisig.range": `Select ordinary BIP32 indexes from 0 to ${MAX_BIP32_INDEX}, with end at least start.`,
  "multisig.count": `Build at most ${PARAMETERS.maxAddressesPerBranch} addresses per branch at once.`,
  "multisig.key": "Enter a valid public key or account xpub with a valid BIP32 origin.",
  "multisig.key-text": `Keep each public key expression within ${PARAMETERS.maxKeyCodeUnits} characters.`,
  "multisig.order": "Select supplied key order or BIP67 key order.",
  "multisig.wrapper": "Select P2SH or P2WSH for this multisig wallet.",
  "multisig.mainnet-xpub":
    "This looks like a mainnet xpub. Select mainnet, or export testnet cosigner keys as tpub from the deriver.",
  "multisig.testnet-tpub":
    "This looks like a testnet tpub. Select testnet, or export mainnet cosigner keys as xpub from the deriver.",
} as const;

/** Stable, input-free admission refusals shared by concrete and ranged multisig operations. */
export class MultisigWalletError extends Error {
  readonly code: keyof typeof REFUSALS;
  constructor(code: keyof typeof REFUSALS, options?: ErrorOptions) {
    super(REFUSALS[code], options);
    this.name = "MultisigWalletError";
    this.code = code;
  }
}

/** Owns supported multisig choices and bounded public derivation admission. */
export class MultisigInput {
  /** Host work limits, expressed in addresses per branch and UTF-16 code units per expression. */
  static get parameters(): typeof PARAMETERS {
    return PARAMETERS;
  }

  /** Only the receive and change branches have wallet-import semantics here. */
  static branch(value: unknown): 0 | 1 {
    if (value !== 0 && value !== 1) throw new MultisigWalletError("multisig.branch");
    return value;
  }

  /** One or both distinct wallet branches, with no coercion or duplicate work. */
  static branches(value: unknown): readonly (0 | 1)[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 2)
      throw new MultisigWalletError("multisig.branch");
    const branches = Array.from(value, (branch: unknown) => MultisigInput.branch(branch));
    if (new Set(branches).size !== branches.length)
      throw new MultisigWalletError("multisig.branch");
    return branches;
  }

  /** Refuses hardened, fractional, unsafe, reversed or excessive ranges before deriving a key. */
  static range(start: number, end: number): void {
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      start > MAX_BIP32_INDEX ||
      !Number.isSafeInteger(end) ||
      end < start ||
      end > MAX_BIP32_INDEX
    )
      throw new MultisigWalletError("multisig.range");
    if (end - start + 1 > PARAMETERS.maxAddressesPerBranch)
      throw new MultisigWalletError("multisig.count");
  }

  /** Bounds raw text before trimming, matching or Base58 decoding. */
  static text(value: unknown): string {
    if (typeof value !== "string" || value.length > PARAMETERS.maxKeyCodeUnits)
      throw new MultisigWalletError("multisig.key-text");
    return value.trim();
  }

  /** The shared descriptor validator is the sole owner of origin syntax and BIP32 step limits. */
  static publicKey(value: string, network: PsbtNetwork): void {
    const key = value.slice(value.lastIndexOf("]") + 1);
    if (key.startsWith("xpub") && network !== "mainnet")
      throw new MultisigWalletError("multisig.mainnet-xpub");
    if (key.startsWith("tpub") && network === "mainnet")
      throw new MultisigWalletError("multisig.testnet-tpub");
    try {
      validateDescriptorPublicKey(value, network);
    } catch (cause) {
      throw new MultisigWalletError("multisig.key", { cause });
    }
  }

  /** No unknown order silently changes the descriptor's key ordering. */
  static order(value: unknown): "supplied" | "bip67" {
    if (value !== "supplied" && value !== "bip67") throw new MultisigWalletError("multisig.order");
    return value;
  }

  /** Dash uses its existing legacy wrapper; other unknown choices are refused. */
  static wrapper(chain: PsbtChain, value: unknown): "p2sh" | "p2wsh" {
    InspectorNetworkChoice.chain(chain);
    if (value !== "p2sh" && value !== "p2wsh") throw new MultisigWalletError("multisig.wrapper");
    return chain === "dash" ? "p2sh" : value;
  }
}
