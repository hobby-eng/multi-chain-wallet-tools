import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DerivationResult } from "@ckd/core/types.js";
import type { ShieldedEncryptedNote } from "@ckd/dash-network/types.js";
import { scanEncryptedPage } from "@ckd/dash-network/orchard-scanner.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { scanDashShielded } from "../src/coins/dash/shielded-scanner.js";
import type { RecoveryNetworkGateway } from "../src/network-gateway.js";
import type { RecoveryScanConfig } from "../src/types.js";

// Counting synthetic bytes only. The mocked engine never derives or contacts a provider.
const trace = vi.hoisted(() => ({
  keyHex: "01".repeat(96),
  decodedKeys: [] as Uint8Array[],
  copiedSeeds: [] as Uint8Array[],
  scanCalls: [] as Uint8Array[][],
  result: undefined as DerivationResult | undefined,
  deriveFails: false,
  canonicalFails: false,
  scanResult: '{"items":[]}',
  scanFails: false,
}));

vi.mock("@ckd/core/crypto.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ckd/core/crypto.js")>();
  return {
    ...actual,
    hexToBytes: (hex: string): Uint8Array => {
      const bytes = actual.hexToBytes(hex);
      if (hex === trace.keyHex) trace.decodedKeys.push(bytes);
      return bytes;
    },
  };
});

vi.mock("@ckd/dash-wasm/dash_shielded_wasm_bg.wasm", () => ({ default: new Uint8Array() }));
vi.mock("@ckd/dash-wasm/dash_shielded_wasm.js", () => {
  const scan = (key: Uint8Array, _position: bigint, ...notes: Uint8Array[]): string => {
    trace.scanCalls.push([key, ...notes]);
    if (trace.scanFails) throw new Error("Synthetic scan failure.");
    return trace.scanResult;
  };
  const validate = (): void => {
    if (trace.canonicalFails) throw new Error("Synthetic viewing-key validation failure.");
  };
  return {
    initSync: () => undefined,
    scan_shielded_batch_json: scan,
    scan_shielded_incoming_batch_json: scan,
    scan_shielded_outgoing_batch_json: scan,
    validate_full_viewing_key: validate,
    validate_incoming_viewing_key: validate,
    validate_outgoing_viewing_key: validate,
    derive_shielded_json: () => {
      throw new Error("Unexpected engine derivation.");
    },
  };
});

vi.mock("@ckd/coins/dash/shielded.js", () => ({
  deriveDashShielded: ({ seed }: { seed: Uint8Array }): DerivationResult => {
    trace.copiedSeeds.push(seed);
    if (trace.deriveFails) throw new Error("Synthetic derivation failure.");
    return trace.result!;
  },
}));

vi.mock("../src/coins/dash/shielded-stream.js", () => ({
  streamShieldedPool: vi.fn(async () => ({ complete: true, pageCount: 0, terminalPosition: 0n })),
}));

const wiped = (bytes: Uint8Array): boolean => bytes.every((byte) => byte === 0);
const note = (): ShieldedEncryptedNote => ({
  cmx: new Uint8Array(32).fill(2),
  nullifier: new Uint8Array(32).fill(3),
  cvNet: new Uint8Array(32).fill(4),
  encryptedNote: new Uint8Array(216).fill(5),
});

beforeEach(() => {
  trace.decodedKeys = [];
  trace.copiedSeeds = [];
  trace.scanCalls = [];
  trace.deriveFails = trace.canonicalFails = trace.scanFails = false;
  trace.scanResult = '{"items":[]}';
  trace.result = {
    id: "synthetic",
    title: "Synthetic",
    networkLabel: "testnet",
    pathTemplate: "synthetic",
    basicSummary: [],
    summary: [{ key: "fullViewingKey", label: "Synthetic FVK", value: trace.keyHex, secret: true }],
    rows: [],
    notices: [],
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const bytes of [...trace.decodedKeys, ...trace.copiedSeeds]) bytes.fill(0);
});

describe("Orchard owned preparation cleanup", () => {
  it.each(["cmx", "nullifier", "cvNet", "encryptedNote"] as const)(
    "wipes the key and partially prepared pages when a later %s has an invalid width",
    (field) => {
      const notes = [note(), note()];
      notes[1]![field] = Uint8Array.of(9);
      const originals = notes.map((item) => structuredClone(item));
      const prepared: Uint8Array[] = [];
      const sources = new Set(notes.flatMap((item) => Object.values(item)));
      const originalSet = Uint8Array.prototype.set;
      vi.spyOn(Uint8Array.prototype, "set").mockImplementation(function (
        this: Uint8Array,
        source: ArrayLike<number>,
        offset?: number,
      ): void {
        if (sources.has(source as Uint8Array)) prepared.push(this);
        originalSet.call(this, source, offset);
      });
      expect(() =>
        scanEncryptedPage({ kind: "full", hex: trace.keyHex }, 0n, notes, "testnet"),
      ).toThrow(`DAPI returned ${field} with an invalid byte length.`);
      expect(trace.decodedKeys).toHaveLength(1);
      expect(trace.decodedKeys.every(wiped)).toBe(true);
      expect(prepared.length).toBeGreaterThan(0);
      expect(prepared.every(wiped)).toBe(true);
      expect(trace.scanCalls).toEqual([]);
      expect(notes).toEqual(originals);
    },
  );

  it.each(["success", "engine", "parse"] as const)(
    "wipes every owned engine input on %s while preserving caller notes",
    (outcome) => {
      trace.scanFails = outcome === "engine";
      trace.scanResult = outcome === "parse" ? "invalid JSON" : '{"items":[]}';
      const notes = [note()];
      const originals = structuredClone(notes);
      const scan = () =>
        scanEncryptedPage({ kind: "full", hex: trace.keyHex }, 0n, notes, "testnet");
      if (outcome === "success") expect(scan()).toEqual([]);
      else expect(scan).toThrow(outcome === "engine" ? /Synthetic scan/u : /malformed JSON/u);
      expect(trace.scanCalls).toHaveLength(1);
      expect(trace.scanCalls[0]!.every(wiped)).toBe(true);
      expect(notes).toEqual(originals);
    },
  );
});

describe("Discovery Orchard seed-copy ownership", () => {
  it.each(["derive", "missing-field", "register", "session-register", "validate", "success"])(
    "wipes its copied seed and completed derivation on %s",
    async (boundary) => {
      const seed = Uint8Array.from({ length: 64 }, (_, index) => index + 1);
      const original = seed.slice();
      const guard = new SecretEgressGuard();
      const sessionGuard = new SecretEgressGuard();
      const resultField = trace.result!.summary[0]!;
      trace.deriveFails = boundary === "derive";
      trace.canonicalFails = boundary === "validate";
      if (boundary === "missing-field") trace.result!.summary[0]!.key = "other";
      const fail = (): never => {
        throw new Error("Synthetic registration failure.");
      };
      if (boundary === "register") vi.spyOn(guard, "registerString").mockImplementation(fail);
      if (boundary === "session-register")
        vi.spyOn(sessionGuard, "registerString").mockImplementation(fail);
      const config = {
        scanShieldedPool: true,
        network: "testnet",
        account: 0,
        includeUsedZeroBalance: false,
      } as RecoveryScanConfig;
      try {
        const scanning = scanDashShielded(
          "synthetic",
          seed,
          config,
          { guard } as unknown as RecoveryNetworkGateway,
          new AbortController().signal,
          () => undefined,
          () => undefined,
          sessionGuard,
        );
        if (boundary === "success")
          await expect(scanning).resolves.toMatchObject({ state: "complete" });
        else await expect(scanning).rejects.toThrow();
        expect(trace.copiedSeeds).toHaveLength(1);
        expect(trace.copiedSeeds[0]).not.toBe(seed);
        expect(trace.copiedSeeds.every(wiped)).toBe(true);
        expect(seed).toEqual(original);
        if (boundary !== "derive") {
          expect(resultField.value).toBe("");
          expect(trace.result!.summary).toEqual([]);
        }
      } finally {
        seed.fill(0);
        original.fill(0);
        guard.clear();
        sessionGuard.clear();
      }
    },
  );
});
