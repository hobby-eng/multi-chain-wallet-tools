import { describe, expect, it } from "vitest";
import { ScriptDecoder, ScriptDecoderError } from "../src/script-decoder.js";
import { InspectorNetworkChoice } from "../src/network-choice.js";

const SCRIPT = "76a914751e76e8199196d454941c45d1b3a323f1433bd688ac";
const DESCRIPTOR = "pkh(0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798)";
const selection = {
  chain: "bitcoin",
  network: "regtest",
  role: "script-pubkey",
  branch: "0",
  wildcardIndex: "0",
};

describe("the Script decoder admits exact external settings before its library call", () => {
  it("refuses malformed capability and selection objects with stable codes", () => {
    expect(() => {
      Reflect.construct(ScriptDecoder, [{}]);
    }).toThrow(new ScriptDecoderError("INVALID_FEATURES"));
    const decoder = new ScriptDecoder({ script: true, descriptor: true });
    expect(() => {
      Reflect.apply(decoder.decode.bind(decoder), undefined, [SCRIPT, null]);
    }).toThrow(new ScriptDecoderError("INVALID_SELECTION"));
  });

  it("keeps supported selections and changes only the known regtest-to-Dash transition", () => {
    for (const network of ["mainnet", "testnet", "regtest"])
      expect(new InspectorNetworkChoice("bitcoin", network).network).toBe(network);
    expect(InspectorNetworkChoice.transition("dash", "regtest")).toBe("testnet");
    expect(InspectorNetworkChoice.transition("bitcoin", "testnet")).toBe("testnet");
    expect(() => new InspectorNetworkChoice("dash", "regtest")).toThrow();
    expect(() => InspectorNetworkChoice.transition("unknown", "mainnet")).toThrow();
  });

  it("bounds raw whitespace before normalization while preserving its exact limit", () => {
    const decoder = new ScriptDecoder({ script: true, descriptor: true });
    const padded = SCRIPT + " ".repeat(ScriptDecoder.maximumTextUnits - SCRIPT.length);
    const result = decoder.decode(padded, selection);
    expect(result.kind).toBe("script");
    if (result.kind !== "script") throw new Error("The public fixture must decode as Script.");
    expect(result.value.hex).toBe(SCRIPT);
    expect(() => decoder.decode(padded + " ", selection)).toThrow(
      new ScriptDecoderError("TEXT_TOO_LARGE"),
    );
  });

  it.each(["", "2147483648", "0x1", "1.1"])(
    "refuses descriptor index %s without numeric fallback",
    (wildcardIndex) => {
      const decoder = new ScriptDecoder({ script: true, descriptor: true });
      expect(() => decoder.decode(DESCRIPTOR, { ...selection, wildcardIndex })).toThrow();
    },
  );

  it("refuses unoffered branches and roles without selecting another operation", () => {
    const decoder = new ScriptDecoder({ script: true, descriptor: true });
    expect(() => decoder.decode(DESCRIPTOR, { ...selection, branch: "2" })).toThrow();
    expect(() => decoder.decode(SCRIPT, { ...selection, role: "unknown" })).toThrow(
      new ScriptDecoderError("INVALID_ROLE"),
    );
  });

  it("keeps Script and descriptor capabilities independently enforced", () => {
    expect(() =>
      new ScriptDecoder({ script: false, descriptor: true }).decode(SCRIPT, selection),
    ).toThrow(new ScriptDecoderError("SCRIPT_EXCLUDED"));
    expect(() =>
      new ScriptDecoder({ script: true, descriptor: false }).decode(DESCRIPTOR, selection),
    ).toThrow(new ScriptDecoderError("DESCRIPTOR_EXCLUDED"));
  });

  it("keeps arbitrary parser input out of its failure", () => {
    const decoder = new ScriptDecoder({ script: true, descriptor: true });
    expect(() => decoder.decode("Public fake phrase in a wrong field", selection)).toThrow(
      new ScriptDecoderError("DECODE_FAILED"),
    );
  });
});
