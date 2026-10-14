import { secureRandomBytes } from "@ckd/core/secure-random.js";
import {
  decode_codex32_seed as decodeSeedWasm,
  codex32_parameters_json as parametersWasm,
  encode_codex32_random_share as encodeRandomShareWasm,
  encode_codex32_seed as encodeSeedWasm,
  initSync as initCodex32,
  interpolate_codex32 as interpolateWasm,
} from "@ckd/recovery-codex32-wasm/recovery_codex32_wasm.js";
import codex32WasmBytes from "@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm";

let initialized = false;
interface Codex32Parameters {
  readonly seedBytes: readonly number[];
  readonly shareIndices: string;
  readonly minThreshold: number;
  readonly maxThreshold: number;
  readonly seedLengthError: string;
}
let parameters: Codex32Parameters;

interface Codex32ShareSet {
  readonly identifier: string;
  readonly threshold: number;
  readonly shares: readonly string[];
}

function initialize(): void {
  if (initialized) return;
  initCodex32({ module: codex32WasmBytes });
  parameters = JSON.parse(parametersWasm()) as Codex32Parameters;
  initialized = true;
}

function validateSeedLength(seed: Uint8Array): void {
  initialize();
  if (!parameters.seedBytes.includes(seed.length)) {
    throw new Error(parameters.seedLengthError);
  }
}

/** The normalized BIP93 identifier, admitted once for every host. */
export class Codex32Identifier {
  readonly #value: string;

  constructor(input: string) {
    initialize();
    const value = input.trim().toLowerCase();
    const alphabet = `${parameters.shareIndices}s`;
    if (value.length !== 4 || [...value].some((character) => !alphabet.includes(character))) {
      throw new Error(
        "Codex32 identifier must contain exactly four Bech32 characters; b, i, o, and 1 are not available.",
      );
    }
    this.#value = value;
  }

  get value(): string {
    return this.#value;
  }
}

function validateInteger(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

function codex32Failure(action: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const threshold = /ThresholdNotPassed\s*\{\s*threshold:\s*(\d+),\s*n_shares:\s*(\d+)/u.exec(
    detail,
  );
  if (threshold !== null) {
    return new Error(
      `${action}: ${threshold[1]} distinct compatible shares are required; ${threshold[2]} were supplied.`,
    );
  }
  if (/RepeatedIndex/u.test(detail))
    return new Error(`${action}: the same Codex32 share index was supplied twice.`);
  if (/MismatchedId/u.test(detail))
    return new Error(`${action}: the Codex32 records use different identifiers.`);
  if (/MismatchedHrp/u.test(detail))
    return new Error(`${action}: the Codex32 records use incompatible prefixes.`);
  if (/InvalidChecksum/u.test(detail))
    return new Error(`${action}: a Codex32 record has an invalid checksum.`);
  return new Error(`${action}: ${detail}`);
}

function callCodex32<T>(action: string, operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    throw codex32Failure(action, cause);
  }
}

export function createCodex32Shares(
  masterSeed: Uint8Array,
  identifierInput: string,
  threshold: number,
  count: number,
): Codex32ShareSet {
  validateSeedLength(masterSeed);
  const identifier = new Codex32Identifier(identifierInput).value;
  initialize();
  if (threshold === 0) {
    if (count !== 1) throw new Error("An unsplit Codex32 secret creates exactly one record.");
    return {
      identifier,
      threshold,
      shares: [
        callCodex32("Codex32 encoding failed", () =>
          encodeSeedWasm(masterSeed, 0, identifier, "s"),
        ),
      ],
    };
  }
  const shareIndices = parameters.shareIndices.split("");
  validateInteger(threshold, "Codex32 threshold", parameters.minThreshold, parameters.maxThreshold);
  validateInteger(count, "Codex32 share count", threshold, shareIndices.length);

  const basis = [
    callCodex32("Codex32 encoding failed", () =>
      encodeSeedWasm(masterSeed, threshold, identifier, "s"),
    ),
  ];
  let random: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  try {
    for (let index = 0; index < threshold - 1; index += 1) {
      random.fill(0);
      // The final byte supplies independent random padding in the last GF(32)
      // symbol; random basis shares must not inherit the seed's zero padding.
      random = secureRandomBytes(masterSeed.length + 1);
      basis.push(
        callCodex32("Codex32 encoding failed", () =>
          encodeRandomShareWasm(
            random.subarray(0, masterSeed.length),
            threshold,
            identifier,
            shareIndices[index]!,
            random[masterSeed.length]!,
          ),
        ),
      );
    }
    const basisText = basis.join("\n");
    const shares = shareIndices
      .slice(0, count)
      .map((index) =>
        callCodex32("Codex32 share creation failed", () => interpolateWasm(basisText, index)),
      );
    return { identifier, threshold, shares };
  } finally {
    random.fill(0);
    basis.fill("");
  }
}

export function recoverCodex32Shares(values: readonly string[]): Uint8Array {
  const shares = values.map((value) => value.trim()).filter(Boolean);
  if (shares.length === 0) throw new Error("Enter at least one Codex32 secret or share.");
  initialize();
  const master =
    shares.length === 1 && shares[0]!.toLowerCase()[8] === "s"
      ? shares[0]!
      : callCodex32("Codex32 restoration failed", () => interpolateWasm(shares.join("\n"), "s"));
  const seed = callCodex32("Codex32 decoding failed", () => decodeSeedWasm(master));
  try {
    validateSeedLength(seed);
    return seed.slice();
  } finally {
    seed.fill(0);
  }
}
