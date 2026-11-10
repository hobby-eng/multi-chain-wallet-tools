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

/** An account states reader that holds every address with 2 units of atomic balance. */
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

  it("labels the sequence line only for the coins whose accounts have a sequence", () => {
    expect(adapterOf("xrp").nonceLabel).toBe("Account sequence");
    expect(adapterOf("stellar").nonceLabel).toBe("Account sequence");
    for (const id of ["solana", "near", "tron"]) expect(adapterOf(id).nonceLabel).toBeUndefined();
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
    ]);
  });
});
