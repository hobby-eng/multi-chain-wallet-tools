// AUD-028 bounded architecture hypotheses. The coordinator supplies the Vitest configuration
// and executes this file serially. No browser, network, KDF, key derivation or build is invoked.
// These are conformance assertions, not expected-failure tests: reproduced defects fail the run.
// Duplicate source owners remain architecture findings independently of these runtime outcomes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext, Script } from "node:vm";
import { bech32 } from "@scure/base";
import { beforeAll, describe, expect, it } from "vitest";
import { hexToBytes } from "../../../packages/crypto-core/src/crypto.js";
import {
  decodeDescriptor,
  descriptorChecksum,
} from "../../../apps/psbt-inspector/src/descriptor.js";
import { describeScript } from "../../../apps/psbt-inspector/src/psbt-presentation.js";
import type { AddressSearchTarget } from "../../../packages/wallet-recovery/src/address-targets.js";
import { searchAcrossAddresses } from "../../../packages/wallet-recovery/src/multi-address-search.js";
import { searchAcrossSeedsAndAddresses } from "../../../packages/wallet-recovery/src/multi-seed-search.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// Hashes bind the direct production entry points, their affected implementations and the actual
// gate extractor. Dependency-closure/source-wide attribution belongs to the coordinator's ledger.
export const REVIEWED_SOURCE = {
  head: "c5b62c2d489e7525326071128095ba95ecca92ac",
  files: {
    "apps/psbt-inspector/src/descriptor.ts":
      "ecfcc106258e438728459f98681ea30e7f38547c1c797c984d6390d3843f4f86",
    "apps/psbt-inspector/src/descriptor-compiler.ts":
      "f300129a16d20d62b1494699f0002c65f8dd79a9daf8875cb555e3ab3a643eff",
    "apps/psbt-inspector/src/psbt-presentation.ts":
      "8ef160c75472b5f75523952861924e5ab8d89cd9620fe33550666f3148e1d020",
    "packages/wallet-recovery/src/multi-address-search.ts":
      "ea2a46b6d2d7386eee4b235613f139c59f504424b197a0e2531591bc30257389",
    "packages/wallet-recovery/src/multi-seed-search.ts":
      "dc1bd980d78c47211e57c2f2f228cc8fca3a4697cc0e3c1168ddde02fff3ea0f",
    "tooling/module-boundaries.test.mjs":
      "794d7d2d6afda29bc09266caf91f6a4311a5e46cfb5e604b6700147049faa203",
  },
} as const;

beforeAll(() => {
  for (const [path, expected] of Object.entries(REVIEWED_SOURCE.files)) {
    const actual = createHash("sha256")
      .update(readFileSync(resolve(root, path)))
      .digest("hex");
    expect(actual, `Reviewed source changed: ${path}`).toBe(expected);
  }
});

// Literal BIP86 first receiving vector, m/86'/0'/0'/0/0. The same published address/script are
// retained in packages/coin-protocols/tests/bitcoin.test.ts; this probe performs no HD derivation.
// That fixture file's reviewed SHA-256 is
// 0d1a4985d44b095d2e4074b3a23387dacd329ff26f2d958e6daa9f51dec7aefd.
const P2TR_ADDRESS = "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";
const P2TR_SCRIPT = "5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c";
const P2TR_WITNESS_VERSION = 1;
const WITNESS_SCRIPT_HEADER_BYTES = 2; // OP_1 followed by the 32-byte push length.
const P2PKH_CONTROL_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"; // Public genesis address.

function addressDescriptor(address: string): string {
  const payload = `addr(${address})`;
  // A correct outer BIP380 checksum lets negative probes reach address validation itself.
  return `${payload}#${descriptorChecksum(payload)}`;
}

function compiledAddressRows(address: string): Record<string, string> {
  const result = decodeDescriptor(addressDescriptor(address), {
    chain: "bitcoin",
    network: "mainnet",
  });
  expect(result.compiledOutput, "addr() must produce concrete output data").not.toBeNull();
  return Object.fromEntries(result.compiledOutput!.rows.map(({ label, value }) => [label, value]));
}

describe("AUD-028 descriptor addr(Bech32m) contract", () => {
  it("renders the literal BIP86 P2TR script as the independently expected address", () => {
    expect(describeScript(hexToBytes(P2TR_SCRIPT), "bitcoin", "mainnet")).toEqual({
      type: "P2TR",
      address: P2TR_ADDRESS,
    });
  });

  it("compiles a public Base58 addr() control through the real descriptor entry point", () => {
    expect(compiledAddressRows(P2PKH_CONTROL_ADDRESS)).toMatchObject({
      Address: P2PKH_CONTROL_ADDRESS,
      "Output type": "P2PKH",
    });
  });

  it("round-trips the literal P2TR addr() to its exact published script and address", () => {
    expect(compiledAddressRows(P2TR_ADDRESS)).toMatchObject({
      scriptPubKey: P2TR_SCRIPT,
      Address: P2TR_ADDRESS,
      "Output type": "P2TR",
      "Witness version": String(P2TR_WITNESS_VERSION),
    });
  });

  it("refuses a valid public Base58 address on the wrong selected network", () => {
    expect(() =>
      decodeDescriptor(addressDescriptor(P2PKH_CONTROL_ADDRESS), {
        chain: "bitcoin",
        network: "testnet",
      }),
    ).toThrow(/Address does not belong to testnet/u);
  });

  it("refuses witness version 1 encoded with Bech32 instead of Bech32m", () => {
    const program = hexToBytes(P2TR_SCRIPT).slice(WITNESS_SCRIPT_HEADER_BYTES);
    const wrongFamily = bech32.encode("bc", [P2TR_WITNESS_VERSION, ...bech32.toWords(program)]);
    expect(wrongFamily).not.toBe(P2TR_ADDRESS);
    expect(() => compiledAddressRows(wrongFamily)).toThrow(/checksum/iu);
  });

  it("refuses a changed inner address checksum even with a valid descriptor checksum", () => {
    const corrupted = `${P2TR_ADDRESS.slice(0, -1)}q`; // Changes the published final r to q.
    expect(() => compiledAddressRows(corrupted)).toThrow(/checksum/iu);
  });
});

type SearchEntry = "addresses" | "seeds-and-addresses";
const SEARCH_ENTRIES: readonly SearchEntry[] = ["addresses", "seeds-and-addresses"];
const SEARCH_TARGET: AddressSearchTarget = {
  input: P2TR_ADDRESS,
  normalized: P2TR_ADDRESS,
  adapterId: "bitcoin-taproot",
  network: "mainnet",
};
const SYNTHETIC_SEED_BYTES = 64; // BIP39 seed-sized fake callback input; no mnemonic or KDF.

interface SearchObservation {
  outcome: "resolved" | "rejected";
  lookupCalls: number;
  resultLength: number | null;
  populatedSlots: number | null;
  error: string | null;
}

async function observeSearch(entry: SearchEntry, concurrency: number): Promise<SearchObservation> {
  let lookupCalls = 0;
  const seed = new Uint8Array(SYNTHETIC_SEED_BYTES).fill(1);
  const options = {
    targets: [SEARCH_TARGET],
    start: 0,
    count: 1,
    concurrency,
    search: async (): Promise<null> => {
      lookupCalls += 1;
      return null;
    },
  };
  try {
    const result =
      entry === "addresses"
        ? await searchAcrossAddresses(options)
        : await searchAcrossSeedsAndAddresses({
            ...options,
            seeds: [{ id: "synthetic", label: "Synthetic", seed }],
          });
    return {
      outcome: "resolved",
      lookupCalls,
      resultLength: result.length,
      // filter visits only populated slots, exposing a resolved sparse array in failure output.
      populatedSlots: result.filter(() => true).length,
      error: null,
    };
  } catch (cause) {
    return {
      outcome: "rejected",
      lookupCalls,
      resultLength: null,
      populatedSlots: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    seed.fill(0);
  }
}

describe("AUD-028 real local-search entry points", () => {
  it.each(SEARCH_ENTRIES)("%s executes its one supplied job with concurrency 1", async (entry) => {
    expect(await observeSearch(entry, 1)).toEqual({
      outcome: "resolved",
      lookupCalls: 1,
      resultLength: 1,
      populatedSlots: 1,
      error: null,
    });
  });

  it.each(SEARCH_ENTRIES)("%s rejects NaN concurrency before invoking a lookup", async (entry) => {
    // Refusal must name concurrency; an unrelated exception is not accepted as a negative pass.
    expect(await observeSearch(entry, Number.NaN)).toEqual({
      outcome: "rejected",
      lookupCalls: 0,
      resultLength: null,
      populatedSlots: null,
      error: expect.stringMatching(/concurrency/iu),
    });
  });
});

const GATE_PATH = "tooling/module-boundaries.test.mjs";
const IMPORTING_FILE = "apps/key-derivation/src/ui/controller.ts";
const OTHER_APP_SPECIFIER = "../../../activity-viewer/src/app.js";
const EXPECTED_OTHER_APP = "apps/activity-viewer/src/app.js";
const STATIC_EDGE_SOURCE = `import * as activity from "${OTHER_APP_SPECIFIER}";`;
const DYNAMIC_EDGE_SOURCE = `const activity = import("${OTHER_APP_SPECIFIER}");`;

function existingImportExtractor(): (text: string) => string[] {
  const source = readFileSync(resolve(root, GATE_PATH), "utf8");
  const opening = "function imports(text) {";
  const start = source.indexOf(opening);
  const end = start < 0 ? -1 : source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error("The reviewed imports() extractor was not found.");
  // Run only the exact function read from the hash-bound gate, never the test module or the
  // retained import expressions. No production extractor/regular expression is copied here.
  const extractor: unknown = runInNewContext(
    `(${source.slice(start, end + 2)})`,
    {},
    { timeout: 100 },
  );
  if (typeof extractor !== "function") throw new Error("The gate extractor is not a function.");
  return extractor as (text: string) => string[];
}

function resolvedGateEdges(source: string): string[] {
  return [...existingImportExtractor()(source)].map((specifier) =>
    relative(root, resolve(dirname(resolve(root, IMPORTING_FILE)), specifier)).replaceAll(
      "\\",
      "/",
    ),
  );
}

describe("AUD-028 actual module-boundary extractor", () => {
  it("recognizes a retained static import crossing to another application", () => {
    expect(resolvedGateEdges(STATIC_EDGE_SOURCE)).toEqual([EXPECTED_OTHER_APP]);
  });

  it("recognizes the same cross-application edge expressed as a dynamic import", () => {
    // Native parsing verifies that this is valid JavaScript; the script is never run, so the
    // foreign application is neither imported nor initialized and no source file is changed.
    expect(() => new Script(DYNAMIC_EDGE_SOURCE)).not.toThrow();
    expect(resolvedGateEdges(DYNAMIC_EDGE_SOURCE)).toEqual([EXPECTED_OTHER_APP]);
  });
});

// Documentation reconciliation for the coordinator, not a new finding or a runtime assertion:
// retain AUD-026-DOC001. Its authorized remediation at 2026-10-09T02:11:01.255640+00:00 verified
// the local MHFE 0.5.1 description at source fingerprint 94f9e471be2fd5f5d181f46f1372fcd4e2c9abdee62fbec35497a76a9ff02f91.
// That phase's ARCHITECTURE.md hash was 7a31b04ed1b7639248a43d3d8eebd70bb630ebb957efe29586a1f5b2f71e9455;
// the package README hash was 8c1d55b997e19a893232db2979f2683b74867356772ce572d524f5fe7aef5079.
// Current ARCHITECTURE.md:45 still describes a local package refused by CI, while the current
// package README:8-17 and provenance pin identify the signed MHFE v0.6.0 package. The stale
// wording after package replacement is the tracked documentation root recurring, not evidence
// that the old phase failed and not an independent new-ID defect. Current document SHA-256:
// ARCHITECTURE.md: 0fc2474e0fc84a3baaa4978778ead58492a079d73420990afc7457aae98a9d11
// packages/recovery-mhfe-wasm/README.md: 89a11f0fea7cc8e685b4ae28ce2874362dc35bad97e3440f71b813f6ed752fb8
// tooling/vendored-mhfe-package.mjs: 28fbab501ffc03d8c6916d532480a2452f0cfb7169ddbd08d9697ba9c6e05157
