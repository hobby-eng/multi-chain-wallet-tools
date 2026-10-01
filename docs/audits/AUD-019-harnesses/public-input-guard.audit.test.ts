// AUD-019 probes of the Activity Viewer's public-input boundary (CHECK-SEC-003): synthetic secret
// material in raw, separator, case, percent and Base64 variants goes through the production
// entry points detectViewerInput (single lookups) and assertAutoViewerBatchInput (batch), and
// every outcome is recorded: refused as private material, refused as not public input, or
// accepted as a lookup of some kind. Nothing here makes a network request; an accepted value is
// one that the page would have handed to a provider.
//
// The outcomes are written to public-input-guard-probe-<AUDIT_LABEL>.json in the evidence folder.
//
// Public test data only: the BIP39 vectors "abandon ... about" (entropy 00..00) and
// "zoo ... wrong" (entropy ff..ff), private key 1, and the BIP32 test vector 1 master key.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { base58 } from "@scure/base";
import { describe, expect, it } from "vitest";
import {
  assertAutoViewerBatchInput,
  detectViewerInput,
} from "../../../apps/activity-viewer/src/detection.ts";

const EVIDENCE_DIR = process.env.AUDIT_EVIDENCE_DIR ?? "docs/audits/AUD-019-evidence";

const ABANDON = `${"abandon ".repeat(11)}about`;
const ZOO = `${"zoo ".repeat(11)}wrong`;
/** BIP32 test vector 1, master extended private key. */
const BIP32_TV1_XPRV =
  "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi";
/** Private key 1 (the smallest valid secp256k1 key), as 32 bytes. */
const KEY_ONE = new Uint8Array(32);
KEY_ONE[31] = 1;

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(bytes).digest();
}

/** Base58Check, written here rather than taken from the production encoder. */
function base58check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58.encode(Uint8Array.from([...payload, ...checksum]));
}

function wif(version: number, compressed: boolean): string {
  return base58check(Uint8Array.from([version, ...KEY_ONE, ...(compressed ? [1] : [])]));
}

/** Synthetic secret material in the forms a person might paste. */
const VARIANTS: Record<string, string> = {
  "mnemonic, spaces": ABANDON,
  "mnemonic, upper case": ABANDON.toUpperCase(),
  "mnemonic, line breaks": ABANDON.replaceAll(" ", "\n"),
  "mnemonic, double spaces": ABANDON.replaceAll(" ", "  "),
  "mnemonic, commas and spaces": ABANDON.replaceAll(" ", ", "),
  "mnemonic, commas": ABANDON.replaceAll(" ", ","),
  "mnemonic, hyphens": ABANDON.replaceAll(" ", "-"),
  "short-word mnemonic, hyphens": ZOO.replaceAll(" ", "-"),
  "short-word mnemonic, dots": ZOO.replaceAll(" ", "."),
  "short-word mnemonic, underscores": ZOO.replaceAll(" ", "_"),
  "short-word mnemonic, no separator": ZOO.replaceAll(" ", ""),
  "mnemonic, percent-encoded": encodeURIComponent(ABANDON),
  "mnemonic, Base64": Buffer.from(ABANDON).toString("base64"),
  "short-word mnemonic, Base64": Buffer.from(ZOO).toString("base64"),
  "private key, hex": Buffer.from(KEY_ONE).toString("hex"),
  "private key, 0x hex": `0x${Buffer.from(KEY_ONE).toString("hex")}`,
  "WIF, Bitcoin mainnet compressed": wif(0x80, true),
  "WIF, Bitcoin mainnet uncompressed": wif(0x80, false),
  "WIF, testnet compressed": wif(0xef, true),
  "WIF, Dash mainnet compressed": wif(0xcc, true),
  "xprv, BIP32 test vector 1": BIP32_TV1_XPRV,
  "xprv, lower case": BIP32_TV1_XPRV.toLowerCase(),
  "BIP39 seed, 128 hex": createHash("sha512").update(ABANDON).digest("hex"),
  "labelled mnemonic": `mnemonic: ${ABANDON}`,
  "short-word mnemonic, one word per line": ZOO.replaceAll(" ", "\n"),
  // The last word replaced by another valid word: the checksum fails, as after a typo.
  "short-word mnemonic with a wrong last word, one word per line": ZOO.replace(
    "wrong",
    "zoo",
  ).replaceAll(" ", "\n"),
};

type Outcome = "private material refused" | "not public input" | `accepted as ${string}`;

function singleOutcome(value: string): Outcome {
  try {
    const detected = detectViewerInput(value, "mainnet");
    return `accepted as ${detected.mode}`;
  } catch (error) {
    return error instanceof Error && error.name === "PrivateMaterialError"
      ? "private material refused"
      : "not public input";
  }
}

function batchOutcome(value: string): Outcome {
  try {
    assertAutoViewerBatchInput(value);
    // The batch guard passed; each line is then detected like a single lookup.
    const lines = value.split("\n").filter((line) => line.trim() !== "");
    const modes = lines.map((line) => singleOutcome(line));
    return modes.every((mode) => mode === "not public input")
      ? "not public input"
      : (modes.find((mode) => mode !== "not public input") as Outcome);
  } catch (error) {
    return error instanceof Error && error.name === "PrivateMaterialError"
      ? "private material refused"
      : "not public input";
  }
}

describe("AUD-019 Activity Viewer public-input boundary", () => {
  const results = Object.entries(VARIANTS).map(([name, value]) => ({
    name,
    length: value.length,
    single: singleOutcome(value),
    batch: batchOutcome(value),
  }));
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    `${EVIDENCE_DIR}/public-input-guard-probe-${process.env.AUDIT_LABEL ?? "run"}.json`,
    `${JSON.stringify(results, null, 2)}\n`,
  );

  // A 64-byte BIP39 seed in hex has the length of an Orchard Incoming Viewing Key; the page cannot
  // tell them apart and treats it as a local viewing key (recorded, not asserted).
  const LOCAL_ONLY = new Set(["BIP39 seed, 128 hex"]);

  for (const { name, single, batch } of results) {
    if (LOCAL_ONLY.has(name)) continue;
    it(`never hands "${name}" to a provider`, () => {
      expect(single.startsWith("accepted"), `single lookup: ${single}`).toBe(false);
      expect(batch.startsWith("accepted"), `batch lookup: ${batch}`).toBe(false);
    });
  }
});
