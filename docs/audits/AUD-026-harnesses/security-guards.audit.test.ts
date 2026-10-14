// AUD-026 security reviewer (CHECK-SEC-003): the public-input guard and the secret-egress tripwire
// with synthetic private material in raw, case, separator, hex, Base64 and percent-encoded forms,
// through the production modules: the Activity Viewer / Scanner public-input guard, the Scanner's
// watch-only resolver, the Dash identity lookup normalizer, ScanSecrets and the export staging of
// ValidatedRecoveryExports. Public test data only: BIP39 "abandon … about", BIP32 test vector 1,
// the private key 1.
//
// Three groups: controls the guards must refuse (they pass today), limitations that a pattern
// tripwire cannot see (asserted as observed, so that a change is noticed), and the documented claim
// of apps/discovery-scanner/SECURITY.md about the export tripwire (asserted as documented; a failure
// there is the reproduction of a candidate finding).
import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { createBase58check } from "@scure/base";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist as french } from "@scure/bip39/wordlists/french.js";
import { bytesToHex, hexToBytes, sha256 } from "@ckd/core/crypto.js";
import {
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
} from "@ckd/secret-boundary/public-input-guard.js";
import { isPrivateMaterialError } from "@ckd/secret-boundary/private-material-error.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { resolveWatchOnlyTargets } from "@ckd/recovery/watch-only.js";
import { normalizeIdentityLookupInput } from "@ckd/dash-network/platform-identity-source.js";
import { ScanSecrets } from "../../../apps/discovery-scanner/src/scan-secrets.js";
import { ValidatedRecoveryExports } from "../../../apps/discovery-scanner/src/validated-exports.js";
import type { RecoveryWalletResult } from "../../../apps/discovery-scanner/src/types.js";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const BIP32_TV1_SEED = hexToBytes("000102030405060708090a0b0c0d0e0f");
const XPRV = HDKey.fromMasterSeed(BIP32_TV1_SEED).privateExtendedKey;
const TPRV = HDKey.fromMasterSeed(BIP32_TV1_SEED, {
  private: 0x04358394,
  public: 0x043587cf,
}).privateExtendedKey;
const KEY_ONE = `${"00".repeat(31)}01`;
const base58check = createBase58check(sha256);
const wif = (version: number, compressed: boolean): string =>
  base58check.encode(
    Uint8Array.from([version, ...hexToBytes(KEY_ONE), ...(compressed ? [1] : [])]),
  );

/** The refusal the guards raise, by its name, or the other error / nothing. */
function outcome(run: () => unknown): string {
  try {
    run();
    return "accepted";
  } catch (cause) {
    if (isPrivateMaterialError(cause)) return "refused";
    return `other error: ${cause instanceof Error ? cause.message.slice(0, 80) : String(cause)}`;
  }
}

describe("controls: private material the public-input guards must refuse", () => {
  const single: Array<[string, string]> = [
    ["BIP39 phrase", MNEMONIC],
    ["phrase, upper case", MNEMONIC.toUpperCase()],
    ["phrase joined with hyphens", MNEMONIC.replaceAll(" ", "-")],
    ["phrase joined with dots", MNEMONIC.replaceAll(" ", ".")],
    ["phrase without separators", MNEMONIC.replaceAll(" ", "")],
    ["French phrase", entropyToMnemonic(new Uint8Array(16), french)],
    ["xprv (BIP32 TV1 m)", XPRV],
    ["tprv (BIP32 TV1 m)", TPRV],
    ["WIF mainnet compressed", wif(0x80, true)],
    ["WIF mainnet uncompressed", wif(0x80, false)],
    ["WIF testnet compressed", wif(0xef, true)],
    ["WIF Dash mainnet compressed", wif(0xcc, true)],
    ["raw 32-byte hex key", KEY_ONE],
    ["0x-prefixed upper-case hex key", `0x${KEY_ONE.toUpperCase()}`],
    ["labelled mnemonic", `mnemonic: ${MNEMONIC}`],
    ["JSON private key", `{"privateKey": "${KEY_ONE}"}`],
    ["PEM", "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE\n-----END EC PRIVATE KEY-----"],
  ];
  for (const [label, value] of single)
    it(`single lookup refuses ${label}`, () => {
      expect(outcome(() => assertPublicLookupInput(value))).toBe("refused");
    });

  it("batch lookup refuses a phrase one word per line and split over lines", () => {
    expect(outcome(() => assertPublicBatchLookupInput(MNEMONIC.replaceAll(" ", "\n")))).toBe(
      "refused",
    );
    const words = MNEMONIC.split(" ");
    const halves = `${words.slice(0, 6).join(" ")}\n${words.slice(6).join(" ")}`;
    expect(outcome(() => assertPublicBatchLookupInput(halves))).toBe("refused");
  });

  it("the watch-only resolver refuses private keys behind a public prefix", () => {
    for (const value of [
      `dash-core-xpub:${XPRV}`,
      `public-key:${KEY_ONE}`,
      `identity:${KEY_ONE}`,
      `public-key:${wif(0x80, true)}`,
      XPRV,
      MNEMONIC,
    ])
      expect(
        outcome(() => resolveWatchOnlyTargets(value, [])),
        value.slice(0, 16),
      ).toBe("refused");
  });

  it("the identity lookup refuses a bare 32-byte hex value before any request", () => {
    expect(outcome(() => normalizeIdentityLookupInput(KEY_ONE))).toBe("refused");
  });
});

describe("limitations: what a pattern tripwire does not see (asserted as observed)", () => {
  const words = MNEMONIC.split(" ");
  const brokenWif = (() => {
    const value = wif(0x80, true);
    const last = value.at(-1) === "n" ? "o" : "n";
    return `${value.slice(0, -1)}${last}`;
  })();
  const observed: Array<[string, string, string]> = [
    ["WIF with its last character changed", brokenWif, "accepted"],
    ["11 words of the phrase", words.slice(0, 11).join(" "), "accepted"],
    ["phrase percent-encoded", encodeURIComponent(MNEMONIC), "accepted"],
    ["phrase Base64-encoded", btoa(MNEMONIC), "accepted"],
    ["xprv Base64-encoded", btoa(XPRV), "accepted"],
    ["hex key split by a space", `${KEY_ONE.slice(0, 32)} ${KEY_ONE.slice(32)}`, "accepted"],
  ];
  for (const [label, value, expected] of observed)
    it(`single lookup: ${label} is ${expected}`, () => {
      expect(outcome(() => assertPublicLookupInput(value))).toBe(expected);
    });

  it("what the identity lookup then does with them: only the mistyped WIF becomes a DPNS name", () => {
    // A DPNS name is the only free-text public lookup that reaches a provider. Lower-casing a
    // mistyped WIF makes it one; the case of its letters is lost, which an attacker must search.
    const kinds = Object.fromEntries(
      observed.map(([label, value]) => {
        try {
          return [label, normalizeIdentityLookupInput(value).kind];
        } catch (cause) {
          return [label, isPrivateMaterialError(cause) ? "refused" : "rejected"];
        }
      }),
    );
    expect(kinds).toEqual({
      "WIF with its last character changed": "dpns-name",
      "11 words of the phrase": "rejected",
      "phrase percent-encoded": "rejected",
      "phrase Base64-encoded": "rejected",
      "xprv Base64-encoded": "rejected",
      "hex key split by a space": "refused",
    });
  });

  it("the egress guard compares case-sensitively and does not decode Base64 to bytes", () => {
    const guard = new SecretEgressGuard();
    const seed = mnemonicToSeedSync(MNEMONIC, "TREZOR");
    guard.registerBytes("BIP39 seed", seed);
    // Control: the registered lower-case hex of the seed is blocked.
    expect(() => guard.assertPublic({ addresses: [bytesToHex(seed)] }, "probe")).toThrow(/seed/u);
    // Observed: upper-case hex and Base64 of the same bytes pass.
    expect(() =>
      guard.assertPublic({ addresses: [bytesToHex(seed).toUpperCase()] }, "probe"),
    ).not.toThrow();
    expect(() =>
      guard.assertPublic({ addresses: [btoa(String.fromCharCode(...seed))] }, "probe"),
    ).not.toThrow();
    seed.fill(0);
  });
});

/** The export staging of a finished scan with the session guard that ScanSecrets fills. */
function stagedExport(csvText: string): () => void {
  const session = new SecretEgressGuard();
  const secrets = new ScanSecrets({ sessionSecretGuard: session });
  secrets.seed({ mnemonic: MNEMONIC, passphrase: "TREZOR" });
  secrets.close();
  const exports = new ValidatedRecoveryExports(
    (_results, format) => ({
      filename: `probe.${format}`,
      mimeType: format === "json" ? "application/json" : "text/csv",
      text: format === "json" ? "{}" : csvText,
    }),
    session,
  );
  return () => exports.stage([{} as RecoveryWalletResult]);
}

const CSV_HEADER = '"source","coin","address","warning"\r\n';
const csvWith = (cell: string, warning = "none"): string =>
  `${CSV_HEADER}"Candidate · source line 1","Dash","XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5","${cell}"\r\n"x","Dash","y","${warning}"\r\n`;

describe("claim: SECURITY.md says the export tripwire rejects encoded registered secrets", () => {
  // apps/discovery-scanner/SECURITY.md: "rejects either if its final text contains a registered
  // raw, hexadecimal, Base64, percent-encoded or separator-obfuscated representation within one
  // inspected value".
  it("control: a raw phrase in one CSV cell is rejected", () => {
    expect(stagedExport(csvWith(MNEMONIC))).toThrow(/BIP39 mnemonic/u);
  });

  it("control: a hyphen-joined phrase in one CSV cell is rejected", () => {
    expect(stagedExport(csvWith(MNEMONIC.replaceAll(" ", "-")))).toThrow(/BIP39 mnemonic/u);
  });

  it("claim: a Base64 phrase in one CSV cell is rejected", () => {
    expect(stagedExport(csvWith(btoa(MNEMONIC)))).toThrow(/BIP39 mnemonic/u);
  });

  it("claim: a percent-encoded phrase is rejected when another cell holds a percent sign", () => {
    expect(stagedExport(csvWith(encodeURIComponent(MNEMONIC), "100% of the range"))).toThrow(
      /BIP39 mnemonic/u,
    );
  });

  it("claim: the Base64 of the registered seed in one CSV cell is rejected", () => {
    const seed = mnemonicToSeedSync(MNEMONIC, "TREZOR");
    const encoded = btoa(String.fromCharCode(...seed));
    seed.fill(0);
    expect(stagedExport(csvWith(encoded))).toThrow(/BIP39 seed/u);
  });
});
