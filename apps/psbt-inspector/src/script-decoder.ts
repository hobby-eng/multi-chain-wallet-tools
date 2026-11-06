import { IntegerInputError } from "@ckd/core/validation.js";
import { DescriptorDecoder, type DecodedDescriptor } from "./descriptor.js";
import { MAX_SCRIPT_TEXT_UNITS } from "./script-text-limit.js";
import { decodeScript } from "./script.js";
import { InspectorNetworkChoice, InspectorNetworkChoiceError } from "./network-choice.js";

const REFUSALS = {
  INVALID_TEXT: "Enter Script hex or an output descriptor.",
  TEXT_TOO_LARGE: "Script or descriptor text exceeds the input limit.",
  DESCRIPTOR_EXCLUDED: "Descriptor decoding is not included in this build.",
  SCRIPT_EXCLUDED: "Raw Script decoding is not included in this build.",
  INVALID_ROLE: "Select an offered Script input role.",
  INVALID_FEATURES: "The decoder configuration is unavailable.",
  INVALID_SELECTION: "Select valid Script decoder options.",
  DECODE_FAILED:
    "The script or descriptor could not be decoded. Review its syntax and selected network.",
} as const;

/** A bounded input or unavailable operation, with no original text in the error. */
export class ScriptDecoderError extends Error {
  readonly code: keyof typeof REFUSALS;
  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "ScriptDecoderError";
    this.code = code;
  }
}

/** Exact external control values; the decoder validates them before parsing. */
export interface ScriptDecoderSelection {
  readonly chain: unknown;
  readonly network: unknown;
  readonly role: unknown;
  readonly branch: unknown;
  readonly wildcardIndex: unknown;
}
/** Compile-time capabilities, provided by the edition's composition. */
export interface ScriptDecoderFeatures {
  readonly script: boolean;
  readonly descriptor: boolean;
}
/** A successful decoding names its kind; refusals throw rather than returning an empty result. */
export type ScriptDecoderResult =
  | { readonly kind: "descriptor"; readonly value: DecodedDescriptor }
  | { readonly kind: "script"; readonly value: ReturnType<typeof decodeScript> };

/** Owns input admission and the choice of the existing Script/descriptor library operation. */
export class ScriptDecoder {
  readonly #features: ScriptDecoderFeatures;
  /** Raw UTF-16 code-unit limit, checked before trimming or allocating normalized text. */
  static readonly maximumTextUnits = MAX_SCRIPT_TEXT_UNITS;

  constructor(features: ScriptDecoderFeatures) {
    if (
      features === null ||
      typeof features !== "object" ||
      typeof features.script !== "boolean" ||
      typeof features.descriptor !== "boolean"
    )
      throw new ScriptDecoderError("INVALID_FEATURES");
    this.#features = { script: features.script, descriptor: features.descriptor };
  }

  /** Decodes one bounded input under the exact selected chain and network. */
  decode(text: unknown, selection: ScriptDecoderSelection): ScriptDecoderResult {
    try {
      return this.#decode(text, selection);
    } catch (cause) {
      if (
        cause instanceof ScriptDecoderError ||
        cause instanceof IntegerInputError ||
        cause instanceof InspectorNetworkChoiceError
      )
        throw cause;
      throw new ScriptDecoderError("DECODE_FAILED");
    }
  }

  #decode(text: unknown, selection: ScriptDecoderSelection): ScriptDecoderResult {
    if (selection === null || typeof selection !== "object")
      throw new ScriptDecoderError("INVALID_SELECTION");
    if (typeof text !== "string" || text.length === 0) throw new ScriptDecoderError("INVALID_TEXT");
    if (text.length > MAX_SCRIPT_TEXT_UNITS) throw new ScriptDecoderError("TEXT_TOO_LARGE");
    const chain = InspectorNetworkChoice.chain(selection.chain);
    const network = new InspectorNetworkChoice(chain, selection.network).network;
    const compact = text.trim().replaceAll(/\s+/gu, "");
    if (/[()#]/u.test(compact)) {
      if (!this.#features.descriptor) throw new ScriptDecoderError("DESCRIPTOR_EXCLUDED");
      return {
        kind: "descriptor",
        value: new DescriptorDecoder(
          text,
          DescriptorDecoder.selection({
            chain,
            network,
            multipathChoice: selection.branch,
            wildcardIndex: selection.wildcardIndex,
          }),
        ).decode(),
      };
    }
    if (!this.#features.script) throw new ScriptDecoderError("SCRIPT_EXCLUDED");
    if (selection.role !== "spending" && selection.role !== "script-pubkey")
      throw new ScriptDecoderError("INVALID_ROLE");
    return { kind: "script", value: decodeScript(text, chain, network, selection.role) };
  }
}
