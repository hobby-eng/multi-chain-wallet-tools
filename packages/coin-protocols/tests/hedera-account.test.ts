// Hedera's account forms: HIP-15's mainnet checksum against the HIP's own examples, and what a
// person types or the Deriver shows, each read as the one canonical lookup it names.
import { describe, expect, it } from "vitest";
import {
  hederaAliasKey,
  hederaEcdsaAlias,
  hederaEcdsaAliasKey,
  hederaEd25519Alias,
  hederaLongZeroAddress,
  hederaLookupOf,
  hederaMainnetChecksum,
  hederaTypedLookup,
} from "@ckd/coins/hedera/account.js";
import { hexToBytes } from "@ckd/core/crypto.js";

/** The first Ed25519 key of the public phrase (m/44'/3030'/0'/0'/0'), as the Deriver shows it. */
const KEY = "10fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf";
const DER = `302a300506032b6570032100${KEY}`;
const ALIAS = `0.0.${DER}`;
/** The first ECDSA key of the phrase (m/44'/3030'/0'/0/0), its DER, alias and EVM address. */
const ECDSA_KEY = "021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499";
const ECDSA_DER = `302d300706052b8104000a032200${ECDSA_KEY}`;
const ECDSA_ALIAS = `0.0.${ECDSA_DER}`;
const EVM = "0xC283f34aDafdB758a557304C5F5e4c1E0A554713";

describe("HIP-15's mainnet checksum", () => {
  // HIP-15's examples for the ledger ID 0x00, mainnet's (HIP-198), read 2026-11-10 at
  // github.com/hiero-ledger/hiero-improvement-proposals/blob/main/HIP/hip-15.md.
  it.each([
    ["0.0.1", "dfkxr"],
    ["0.0.4", "cjcuq"],
    ["0.0.5", "ktach"],
    ["0.0.6", "tcxjy"],
    ["0.0.12", "uuuup"],
    ["0.0.123", "vfmkw"],
    ["0.0.1234567890", "zbhlt"],
    ["12.345.6789", "aoyyt"],
    ["1.23.456", "adpbr"],
  ])("gives %s the HIP's checksum %s", (address, checksum) => {
    expect(hederaMainnetChecksum(address)).toBe(checksum);
  });
});

describe("Hedera's typed lookups", () => {
  it("read an account number with or without its mainnet checksum", () => {
    expect(hederaTypedLookup("0.0.163372")).toBe("0.0.163372");
    expect(hederaTypedLookup("0.0.163372-giukq")).toBe("0.0.163372");
    expect(hederaTypedLookup("0.0.0")).toBe("0.0.0");
    // The largest number the mirror node reads, 2^38 - 1.
    expect(hederaTypedLookup("0.0.274877906943")).toBe("0.0.274877906943");
  });

  it.each([
    ["a testnet checksum", "0.0.163372-pwfrz"],
    ["a checksum in upper case", "0.0.123-VFMKW"],
    ["a wrong checksum", "0.0.123-abcde"],
    ["a short checksum", "0.0.123-vf"],
    ["a leading zero", "0.0.0123"],
    ["another shard", "1.0.123"],
    ["another realm", "0.1.123"],
    ["a number past the mirror node's range", "0.0.274877906944"],
    ["spaces around the dash", "0.0.123 - vfmkw"],
    ["a raw key's 64 hex digits", KEY],
    ["a mistyped EIP-55 checksum", "0xc283f34aDafdB758a557304C5F5e4c1E0A554713"],
    ["a raw compressed ECDSA key", ECDSA_KEY],
    ["an ECDSA key off the curve", `302d300706052b8104000a03220002${"f".repeat(64)}`],
    ["a DER private key", `302e020100300506032b657004220420${KEY}`],
  ])("refuse %s", (_case, value) => {
    expect(hederaTypedLookup(value)).toBeNull();
  });

  it("read an EVM address in one case or with its checksum as its EIP-55 form", () => {
    expect(hederaTypedLookup(EVM)).toBe(EVM);
    expect(hederaTypedLookup(EVM.toLowerCase())).toBe(EVM);
    expect(hederaTypedLookup(`0x${EVM.slice(2).toUpperCase()}`)).toBe(EVM);
  });

  it("read an ECDSA key in DER, bare or as its alias, as the alias in lower case", () => {
    expect(hederaTypedLookup(ECDSA_DER)).toBe(ECDSA_ALIAS);
    expect(hederaTypedLookup(ECDSA_ALIAS.toUpperCase())).toBe(ECDSA_ALIAS);
  });

  it("read an Ed25519 key in DER, bare or as its alias, as the alias in lower case", () => {
    expect(hederaTypedLookup(DER)).toBe(ALIAS);
    expect(hederaTypedLookup(ALIAS)).toBe(ALIAS);
    expect(hederaTypedLookup(ALIAS.toUpperCase())).toBe(ALIAS);
    expect(hederaTypedLookup(`0.0.${DER.slice(0, -2)}`)).toBeNull();
  });
});

describe("Hedera's canonical lookups", () => {
  it("name an account, an EVM address or a key, and nothing in another form", () => {
    expect(hederaLookupOf("0.0.163372")).toEqual({ kind: "account", id: "0.0.163372" });
    expect(hederaLookupOf(EVM)).toEqual({ kind: "evm", address: EVM.toLowerCase() });
    expect(hederaLookupOf(ALIAS)).toEqual({ kind: "key", publicKey: KEY });
    // An ECDSA key also names the account of its EVM address alias.
    expect(hederaLookupOf(ECDSA_ALIAS)).toEqual({
      kind: "ecdsa-key",
      publicKey: ECDSA_KEY,
      evmAddress: EVM.toLowerCase(),
    });
    for (const value of [
      "0.0.163372-giukq",
      EVM.toLowerCase(),
      DER,
      ALIAS.toUpperCase(),
      "0.0.274877906944",
    ])
      expect(hederaLookupOf(value)).toBeNull();
  });

  it("build the aliases of both kinds of key and read the keys back", () => {
    expect(hederaEd25519Alias(hexToBytes(KEY))).toBe(ALIAS);
    expect(hederaAliasKey(ALIAS)).toBe(KEY);
    expect(hederaAliasKey(DER)).toBeNull();
    expect(hederaEcdsaAlias(hexToBytes(ECDSA_KEY))).toBe(ECDSA_ALIAS);
    expect(hederaEcdsaAliasKey(ECDSA_ALIAS)?.publicKey).toBe(ECDSA_KEY);
    expect(hederaEcdsaAliasKey(ALIAS)).toBeNull();
    expect(hederaAliasKey(ECDSA_ALIAS)).toBeNull();
  });

  it("write an account number's long-zero EVM address", () => {
    // The mirror node resolves this address to 0.0.163372 (probed 2026-11-10).
    expect(hederaLongZeroAddress("0.0.163372")).toBe("0x0000000000000000000000000000000000027e2c");
    expect(hederaLongZeroAddress("0.0.274877906943")).toBe(
      "0x0000000000000000000000000000003fffffffff",
    );
    expect(hederaLongZeroAddress(EVM)).toBeNull();
  });
});
