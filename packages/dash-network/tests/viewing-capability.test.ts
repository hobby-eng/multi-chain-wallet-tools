import { describe, expect, it, vi } from "vitest";
import { OrchardViewingCapability } from "../src/viewing-capability.js";
import type { NormalizedViewingKey } from "../src/viewing-key.js";

describe("Orchard viewing capability lifetime", () => {
  it("disposes normalized material when canonical validation refuses it", () => {
    const key: NormalizedViewingKey = { kind: "full", hex: "ab".repeat(96) };
    expect(() =>
      OrchardViewingCapability.open("synthetic", "automatic", "mainnet", {
        normalize: () => key,
        canonical: () => {
          throw new Error("canonical refusal");
        },
      }),
    ).toThrow("canonical refusal");
    expect(key.hex).toBe("");
  });

  it("rejects a bundle from another network before canonical or network work", () => {
    const canonical = vi.fn();
    const key: NormalizedViewingKey = {
      kind: "full",
      hex: "ab".repeat(96),
      bundleNetwork: "testnet",
    };
    expect(() =>
      OrchardViewingCapability.open("synthetic", "automatic", "mainnet", {
        normalize: () => key,
        canonical,
      }),
    ).toThrow(/testnet/u);
    expect(key.hex).toBe("");
    expect(canonical).not.toHaveBeenCalled();
  });

  it("retains a validated capability only until its owner disposes it", () => {
    const key: NormalizedViewingKey = { kind: "incoming", hex: "ab".repeat(64) };
    const capability = OrchardViewingCapability.open("synthetic", "automatic", "mainnet", {
      normalize: () => key,
    });
    expect(capability.kind).toBe("incoming");
    expect(capability.normalized.hex).toHaveLength(128);
    capability.dispose();
    capability.dispose();
    expect(key.hex).toBe("");
  });
});
