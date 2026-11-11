import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_COIN_READERS,
  accountCoin,
  accountStatesReader,
} from "@ckd/public-data-providers/account-coins.js";
import { createAccountActivityAdapter } from "../src/activity-account.js";

// The first XRP address and NEAR implicit account of the public "abandon … about" phrase.
const XRP = "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3";
const NEAR = "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412";
// Its public key, as the Deriver's NEAR row shows it.
const NEAR_PUBLIC_KEY = "ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25";

// Hedera's first Ed25519 key of the phrase as the Deriver shows it (DER and its alias), and the
// accounts the network gave it (probed 2026-11-10); TON's first Trust Wallet address and its raw form.
const HEDERA_DER =
  "302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf";
const HEDERA_ACCOUNTS = [
  { id: "0.0.163372", balance: "1" },
  { id: "0.0.629081", balance: "1" },
];
const TON = "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY";
const TON_RAW = "0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9";

/**
 * An account states reader that holds every address with 2 units of atomic balance, and on Hedera
 * gives each address the accounts above.
 */
function states(height: string | null, sequence: string | null) {
  return {
    states: vi.fn(async (coin: string, _network: string, addresses: string[]) => ({
      coin,
      height,
      entries: addresses.map((address) => ({
        address,
        exists: true,
        used: true,
        balance: "2",
        sequence,
        ...(coin === "hedera" ? { accounts: HEDERA_ACCOUNTS } : {}),
      })),
    })),
  };
}

const adapterOf = (id: string, reader = states("9", "4")) =>
  createAccountActivityAdapter(accountStatesReader(accountCoin(id)), reader);

describe("account coin activity", () => {
  it("reads XRP's balance, sequence and ledger from its own provider and reports no history", async () => {
    const reader = states("108238352", "210");
    const adapter = adapterOf("xrp", reader);
    expect(adapter).toMatchObject({
      id: "xrp",
      label: "XRP",
      asset: "XRP",
      decimals: 6,
      networks: ["mainnet"],
      readsHistory: false,
    });
    const result = await adapter.query(XRP, "mainnet", new AbortController().signal);
    expect(reader.states).toHaveBeenCalledWith("xrp", "mainnet", [XRP], expect.anything());
    expect(result).toMatchObject({
      coin: "xrp",
      address: XRP,
      balanceAtomic: 2n,
      nonce: 210n,
      blockHeight: 108238352n,
    });
    expect(result.history).toMatchObject({
      status: "unsupported",
      asset: "XRP",
      atomicUnit: "drop",
      decimals: 6,
      source: "https://xrplcluster.com",
      totalReceivedAtomic: null,
      transactionCount: null,
    });
  });

  it("leaves the nonce and height out where the coin and provider have none", async () => {
    const result = await adapterOf("tron", states(null, null)).query(
      "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
      "mainnet",
      new AbortController().signal,
    );
    expect(result).toMatchObject({ nonce: null, blockHeight: null });
  });

  it("reads a NEAR public key as its implicit account and refuses anything else without repeating it", () => {
    const near = adapterOf("near");
    expect(near).toMatchObject({
      inputName: "account public key",
      privateMaterialHint:
        "NEAR lookups take the account's public key (ed25519:…), since 64 hex digits cannot be told from a private key.",
    });
    expect(near.normalize(NEAR_PUBLIC_KEY, "mainnet")).toBe(NEAR);
    for (const value of [NEAR, XRP, NEAR_PUBLIC_KEY.replace("ed25519:", "")])
      expect(() => near.normalize(value, "mainnet")).toThrow(
        "Enter NEAR account public keys only (ed25519:…, with a valid form).",
      );
  });

  it("reads what a Hedera user has as the account it names, and returns the accounts found", async () => {
    const hedera = adapterOf("hedera", states(null, null));
    expect(hedera).toMatchObject({
      inputName: "account",
      singlePlaceholder: "Paste one Hedera account (0.0.N, 0x… or DER public key)",
    });
    expect(hedera.privateMaterialHint).toMatch(/public key in DER form \(302a… or 302d…\)/u);
    expect(hedera.normalize("0.0.163372-giukq", "mainnet")).toBe("0.0.163372");
    expect(hedera.normalize(HEDERA_DER, "mainnet")).toBe(`0.0.${HEDERA_DER}`);
    expect(hedera.normalize("0xc283f34adafdb758a557304c5f5e4c1e0a554713", "mainnet")).toBe(
      "0xC283f34aDafdB758a557304C5F5e4c1E0A554713",
    );
    for (const value of ["0.0.163372-pwfrz", HEDERA_DER.slice(24), "0.0.01"])
      expect(() => hedera.normalize(value, "mainnet")).toThrow(
        "Enter Hedera accounts only (0.0.N, 0x… or DER public key, with a valid form).",
      );
    const result = await hedera.query(`0.0.${HEDERA_DER}`, "mainnet", new AbortController().signal);
    expect(result).toMatchObject({
      balanceAtomic: 2n,
      nonce: null,
      accounts: [
        { id: "0.0.163372", balance: 1n },
        { id: "0.0.629081", balance: 1n },
      ],
    });
    // A coin that does not number its accounts reports none.
    const xrp = await adapterOf("xrp").query(XRP, "mainnet", new AbortController().signal);
    expect("accounts" in xrp).toBe(false);
  });

  it("reads TON's raw and bounceable forms and Injective's EVM address as the canonical account", () => {
    expect(adapterOf("ton").normalize(TON_RAW, "mainnet")).toBe(TON);
    expect(
      adapterOf("injective").normalize("0x9858EfFD232B4033E47d90003D41EC34EcaEda94", "mainnet"),
    ).toBe("inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz");
    expect(adapterOf("cosmos").singlePlaceholder).toBe("Paste one Cosmos address (cosmos1…)");
  });

  it("labels the sequence line only for the coins whose accounts have a sequence", () => {
    for (const id of ["xrp", "stellar", "cosmos", "injective", "ton"])
      expect(adapterOf(id).nonceLabel).toBe("Account sequence");
    for (const id of ["solana", "near", "tron", "hedera"])
      expect(adapterOf(id).nonceLabel).toBeUndefined();
  });

  it("passes each account coin's address form known answers at startup", () => {
    expect(
      ACCOUNT_COIN_READERS.flatMap((reader) =>
        createAccountActivityAdapter(reader, states(null, null)).selfTest(),
      ),
    ).toEqual([
      "Solana base58 address form",
      "XRP classic address checksum",
      "Stellar StrKey account ID checksum",
      "NEAR public key form",
      "Tron base58check address checksum",
      "Cosmos bech32 address checksum",
      "Injective bech32 and EVM address forms",
      "Hedera account ID checksum (HIP-15)",
      "TON address forms and checksum",
    ]);
  });
});
