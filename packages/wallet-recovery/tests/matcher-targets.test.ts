import { describe, expect, it } from "vitest";
import { detectDashMatcherTargets } from "../src/matcher-targets-dash.js";
import { detectMultiChainMatcherTargets } from "../src/matcher-targets-multichain.js";

const DASH_CORE = "XdTw4G5AWW4cogGd7ayybyBNDbuB45UpgH";
const DASH_PLATFORM = "dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs";
const DASH_ORCHARD_TESTNET =
  "tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq";
const DASH_IDENTITY_MASTER_HASH = "00112233445566778899aabbccddeeff00112233";

describe("wallet matcher target detection", () => {
  it("routes Dash encodings only to compatible profiles", () => {
    expect(detectDashMatcherTargets(DASH_CORE, "mainnet", false)[0]?.adapterIds).toEqual([
      "dash-core",
      "dash-legacy-mobile",
      "dash-core-coinjoin",
    ]);
    expect(
      detectDashMatcherTargets(DASH_PLATFORM.toUpperCase(), "mainnet", false)[0],
    ).toMatchObject({
      normalized: DASH_PLATFORM,
      adapterIds: ["dash-platform"],
    });
    expect(detectDashMatcherTargets(DASH_ORCHARD_TESTNET, "testnet", false)[0]?.adapterIds).toEqual(
      ["dash-shielded"],
    );
  });

  it("reads a Dash Core address of its own network only, with a valid checksum", () => {
    // The first Dash Core addresses of "abandon … about" (packages/verification/src/derivation-self-test-dash.ts).
    const mainnet = "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5";
    const testnet = "yRd4FhXfVGHXpsuZXPNkMrfD9GVj46pnjt";
    expect(detectDashMatcherTargets(testnet, "testnet", false)[0]?.adapterIds).toEqual([
      "dash-core",
      "dash-legacy-mobile",
      "dash-core-coinjoin",
    ]);
    expect(() => detectDashMatcherTargets(mainnet, "testnet", false)).toThrow(/not recognized/u);
    expect(() => detectDashMatcherTargets(testnet, "mainnet", false)).toThrow(/not recognized/u);
    expect(() =>
      detectDashMatcherTargets("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf6", "mainnet", false),
    ).toThrow(/not recognized/u);
  });

  it("routes a Dash Identity MASTER public-key HASH160 to the DIP13 profile", () => {
    expect(
      detectDashMatcherTargets(DASH_IDENTITY_MASTER_HASH.toUpperCase(), "mainnet", true)[0],
    ).toMatchObject({
      normalized: DASH_IDENTITY_MASTER_HASH,
      adapterIds: ["dash-identity"],
      fieldKeys: ["key0PublicKeyHash"],
    });
  });

  it("rejects cross-network and duplicate addresses without case-folding Base58", () => {
    expect(() => detectDashMatcherTargets(DASH_PLATFORM, "testnet", false)).toThrow(
      /selected network/u,
    );
    expect(() => detectDashMatcherTargets(`${DASH_CORE}\n${DASH_CORE}`, "mainnet", false)).toThrow(
      /duplicates/u,
    );
  });

  it("routes Bitcoin and EVM addresses only in the multi-chain profile", () => {
    expect(
      detectMultiChainMatcherTargets(
        "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
        "mainnet",
        false,
      )[0]?.adapterIds,
    ).toEqual(["bitcoin-native-segwit"]);
    expect(
      detectMultiChainMatcherTargets(
        "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
        "mainnet",
        false,
      )[0]?.adapterIds,
    ).toEqual(["ethereum", "ethereum-classic", "hedera-ecdsa"]);
    expect(() =>
      detectDashMatcherTargets("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", "mainnet", false),
    ).toThrow();
  });

  it("expands to all edition-compatible address profiles only when forced", () => {
    const adapters = detectDashMatcherTargets(DASH_PLATFORM, "mainnet", true)[0]?.adapterIds ?? [];
    expect(adapters).toContain("dash-core");
    expect(adapters).toContain("dash-shielded");
    expect(adapters).toContain("dash-identity-funding");
    expect(adapters).not.toContain("dash-dashpay");
    expect(adapters).not.toContain("bitcoin-legacy");
  });
});
