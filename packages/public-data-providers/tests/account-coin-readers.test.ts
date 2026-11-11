// The account coins' readers on public responses recorded on 2026-11-10 (Origin: null, as the
// Network Worker sends it) for addresses of the public "abandon … about" phrase, kept verbatim in
// test/fixtures/account-coins/. A malformed or partial answer is one of them changed, as each test
// says.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tonAccountId, tonFriendlyAddress } from "@ckd/coins/ton/address.js";
import { accountCoin, accountStatesReader } from "../src/account-coins.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const recorded = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../test/fixtures/account-coins/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

// Addresses of the public phrase, from the Deriver (its startup vectors and rows).
const SOLANA = {
  first: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk", // m/44'/501'/0'/0'
  sixth: "2EUrWmf5xMmWER9BtDbXbGbZjoL7R3eTDMXYR6H6cKPj", // m/44'/501'/5'/0'
};
const XRP = {
  first: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3", // m/44'/144'/0'/0/0
  sixth: "rN4pudpqZyszwSSeMAFJNeC3LJ7nxmVfkV", // m/44'/144'/0'/0/5
};
const STELLAR = {
  first: "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX", // m/44'/148'/0'
  eleventh: "GC4FH7MFR6ICHN5F3Z4TBM5HQJCTHRI4ETRDQEE66CYASOR5RWGERA77", // m/44'/148'/10'
};
const NEAR = {
  first: "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412", // m/44'/397'/0'
  sixth: "3df55dd7f325b3017c6a613bdc172d28c72521b1bb6a13bb41d194acef68ce4f", // m/44'/397'/5'
};
const TRON = {
  first: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH", // m/44'/195'/0'/0/0
  sixth: "TBdYXtwq18cAhi1BA574TrP6tw2G86anu1", // m/44'/195'/0'/0/5
  thousandth: "TLt6As19wN13Kgvb4uKwbJMSo4C5SNHqiH", // m/44'/195'/0'/0/999
};

const COSMOS = {
  first: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4", // m/44'/118'/0'/0/0
  sixth: "cosmos1neyy3lf7kjfs8pm5880g6hjgltngu69qlypk32", // m/44'/118'/0'/0/5
};
const INJECTIVE = {
  first: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz", // m/44'/60'/0'/0/0
  firstEvm: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  sixth: "inj15sx0hly9xnlusn3q5lvthsmjnvn2xhm0pmaec9", // m/44'/60'/0'/0/5
};
const HEDERA = {
  // The Ed25519 keys at m/44'/3030'/0'/0'/0' and /5', and the alias the Deriver shows of each.
  firstKey: "10fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
  first:
    "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
  sixthKey: "c920a07a04ca8ca2807525ea016f1f39413dd49690a7163edfcf54f0a3be8684",
  sixth:
    "0.0.302a300506032b6570032100c920a07a04ca8ca2807525ea016f1f39413dd49690a7163edfcf54f0a3be8684",
  // The account the network gives the first key (probed 2026-11-10), its long-zero EVM address,
  // and the first ECDSA key's EVM address alias (m/44'/3030'/0'/0/0).
  account: "0.0.163372",
  longZero: "0x0000000000000000000000000000000000027E2c",
  evm: "0xC283f34aDafdB758a557304C5F5e4c1E0A554713",
  // That ECDSA key (compressed) and its alias, the row's public key in DER.
  ecdsaKey: "021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499",
  ecdsa:
    "0.0.302d300706052b8104000a032200021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499",
};
const TON = {
  trust: "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY", // m/44'/607'/0', v4R2
  trustSixth: "UQDXMfQkzNDVkxAfR5EZ0TMEEwujq6jKInAtoBfxj55OyF_p", // m/44'/607'/5'
  ledger: "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj", // m/44'/607'/0'/0'/0'/0'
  trustRaw: "0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9",
};

interface Sent {
  readonly url: string;
  readonly body: unknown;
}

/** A provider that answers each request with `answer` (a body, or a body and an HTTP status). */
function provider(answer: (sent: Sent) => unknown | { status: number; body: unknown }) {
  const sent: Sent[] = [];
  let pending = 0;
  let mostPending = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      pending += 1;
      mostPending = Math.max(mostPending, pending);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const request = {
        url: String(input),
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      };
      sent.push(request);
      pending -= 1;
      const reply = answer(request);
      const withStatus =
        typeof reply === "object" && reply !== null && "status" in reply && "body" in reply
          ? (reply as { status: number; body: unknown })
          : { status: 200, body: reply };
      return new Response(JSON.stringify(withStatus.body), { status: withStatus.status });
    }),
  );
  return { sent, mostPending: () => mostPending };
}

const read = (coin: string, addresses: string[], signal?: AbortSignal) =>
  accountStatesReader(accountCoin(coin)).read(addresses, signal);

describe("Solana's reader", () => {
  it("reads balances and signatures of a lookup batch in one JSON-RPC batch", async () => {
    const { sent } = provider(() => recorded("solana-batch"));
    const view = await read("solana", [SOLANA.first, SOLANA.sixth]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://solana-rpc.publicnode.com");
    expect(sent[0]?.body).toEqual([
      {
        jsonrpc: "2.0",
        id: "accounts",
        method: "getMultipleAccounts",
        params: [
          [SOLANA.first, SOLANA.sixth],
          { encoding: "base64", dataSlice: { offset: 0, length: 0 }, commitment: "finalized" },
        ],
      },
      ...[SOLANA.first, SOLANA.sixth].map((address, index) => ({
        jsonrpc: "2.0",
        id: `signatures:${index}`,
        method: "getSignaturesForAddress",
        params: [address, { limit: 1, commitment: "finalized" }],
      })),
    ]);
    expect(view).toEqual({
      coin: "solana",
      height: "467705485",
      entries: [
        { address: SOLANA.first, exists: true, used: true, balance: "2563239079", sequence: null },
        { address: SOLANA.sixth, exists: true, used: true, balance: "1056640", sequence: null },
      ],
    });
  });

  it("reads an address the chain holds no account of as used only through a signature", async () => {
    // The recorded batch without its two accounts; only the first address has a signature.
    provider(() =>
      (recorded("solana-batch") as { id: string; result: unknown }[]).map((reply) =>
        reply.id === "accounts"
          ? { ...reply, result: { ...(reply.result as object), value: [null, null] } }
          : reply,
      ),
    );
    const view = await read("solana", [SOLANA.first, SOLANA.sixth]);
    expect(view.entries).toEqual([
      { address: SOLANA.first, exists: false, used: true, balance: "0", sequence: null },
      { address: SOLANA.sixth, exists: false, used: false, balance: "0", sequence: null },
    ]);
  });

  it.each([
    ["a short batch", (replies: unknown[]) => replies.slice(1), /incomplete batch/u],
    [
      "an error object",
      (replies: unknown[]) =>
        replies.map((reply, index) =>
          index === 0 ? { jsonrpc: "2.0", id: "accounts", error: { code: -32602 } } : reply,
        ),
      /malformed or failed response/u,
    ],
    [
      "too few accounts",
      (replies: unknown[]) =>
        replies.map((reply) => {
          const { id, result } = reply as { id: string; result: { value: unknown[] } };
          return id === "accounts"
            ? { ...(reply as object), result: { ...result, value: result.value.slice(1) } }
            : reply;
        }),
      /incomplete account batch/u,
    ],
    [
      "a balance past 2^53",
      (replies: unknown[]) =>
        replies.map((reply) => {
          const { id, result } = reply as { id: string; result: { value: object[] } };
          return id === "accounts"
            ? {
                ...(reply as object),
                result: {
                  ...result,
                  value: result.value.map((account) => ({ ...account, lamports: 2 ** 53 })),
                },
              }
            : reply;
        }),
      /a balance/u,
    ],
  ])("refuses %s", async (_name, change, message) => {
    provider(() => change(recorded("solana-batch") as unknown[]));
    await expect(read("solana", [SOLANA.first, SOLANA.sixth])).rejects.toMatchObject({
      code: "account.response",
      message: expect.stringMatching(message),
    });
  });
});

describe("the XRP Ledger's reader", () => {
  it("reads an account and one the validated ledger does not hold, one request at a time", async () => {
    const { sent, mostPending } = provider(({ body }) =>
      recorded(
        (body as { params: [{ account: string }] }).params[0].account === XRP.first
          ? "xrp-found"
          : "xrp-missing",
      ),
    );
    const view = await read("xrp", [XRP.first, XRP.sixth]);
    expect(mostPending()).toBe(1);
    expect(sent.map(({ url }) => url)).toEqual([
      "https://xrplcluster.com",
      "https://xrplcluster.com",
    ]);
    expect(sent[0]?.body).toEqual({
      method: "account_info",
      params: [{ account: XRP.first, ledger_index: "validated" }],
    });
    expect(view).toEqual({
      coin: "xrp",
      height: "108238353",
      entries: [
        { address: XRP.first, exists: true, used: true, balance: "2275160859", sequence: "210" },
        { address: XRP.sixth, exists: false, used: false, balance: "0", sequence: null },
      ],
    });
  });

  it.each([
    ["the state of another account", XRP.sixth, (body: Record<string, unknown>) => body],
    [
      "an unvalidated ledger",
      XRP.first,
      (body: Record<string, unknown>) => ({
        result: { ...(body.result as object), validated: false },
      }),
    ],
    [
      "another error",
      XRP.first,
      (body: Record<string, unknown>) => ({
        result: { ...(body.result as object), status: "error", error: "tooBusy" },
      }),
    ],
  ])("refuses %s", async (_name, address, change) => {
    provider(() => change(recorded("xrp-found") as Record<string, unknown>));
    await expect(read("xrp", [address])).rejects.toMatchObject({ code: "account.response" });
  });

  it("stops at an abort between two addresses", async () => {
    const controller = new AbortController();
    const { sent } = provider(() => {
      controller.abort();
      return recorded("xrp-found");
    });
    await expect(read("xrp", [XRP.first, XRP.sixth], controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(sent).toHaveLength(1);
  });
});

describe("Stellar's reader", () => {
  it("reads an account in stroops and Horizon's not_found as no account", async () => {
    const { sent } = provider(({ url }) =>
      url.endsWith(STELLAR.eleventh)
        ? recorded("stellar-found")
        : { status: 404, body: recorded("stellar-missing") },
    );
    const view = await read("stellar", [STELLAR.eleventh, STELLAR.first]);
    expect(sent.map(({ url }) => url)).toEqual([
      `https://horizon.stellar.org/accounts/${STELLAR.eleventh}`,
      `https://horizon.stellar.org/accounts/${STELLAR.first}`,
    ]);
    expect(view).toEqual({
      coin: "stellar",
      height: null,
      entries: [
        {
          address: STELLAR.eleventh,
          exists: true,
          used: true,
          balance: "0",
          sequence: "264874520089722880",
        },
        { address: STELLAR.first, exists: false, used: false, balance: "0", sequence: null },
      ],
    });
  });

  it("reads the native balance exactly into stroops", async () => {
    // The recorded account with its native balance changed to 12.3456789 XLM.
    provider(() => {
      const body = recorded("stellar-found") as { balances: Record<string, unknown>[] };
      return { ...body, balances: [{ ...body.balances[0], balance: "12.3456789" }] };
    });
    expect((await read("stellar", [STELLAR.eleventh])).entries[0]?.balance).toBe("123456789");
  });

  it.each([
    [
      "another 404 problem",
      { status: 404, body: { ...(recorded("stellar-missing") as object), type: "about:blank" } },
    ],
    ["a server error", { status: 500, body: recorded("stellar-missing") }],
    [
      "a balance without seven decimals",
      {
        status: 200,
        body: {
          ...(recorded("stellar-found") as object),
          balances: [{ balance: "12.5", asset_type: "native" }],
        },
      },
    ],
  ])("refuses %s", async (_name, answer) => {
    provider(() => answer);
    await expect(read("stellar", [STELLAR.eleventh])).rejects.toThrow();
  });
});

describe("NEAR's reader", () => {
  it("reads an implicit account and UNKNOWN_ACCOUNT as no account", async () => {
    const { sent } = provider(({ body }) =>
      recorded(
        (body as { params: { account_id: string } }).params.account_id === NEAR.first
          ? "near-found"
          : "near-missing",
      ),
    );
    const view = await read("near", [NEAR.first, NEAR.sixth]);
    expect(sent[0]?.body).toEqual({
      jsonrpc: "2.0",
      id: "0",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: NEAR.first },
    });
    expect(view).toEqual({
      coin: "near",
      height: "223910431",
      entries: [
        {
          address: NEAR.first,
          exists: true,
          used: true,
          balance: "312195729412602827003523946",
          sequence: null,
        },
        { address: NEAR.sixth, exists: false, used: false, balance: "0", sequence: null },
      ],
    });
  });

  it.each([
    ["the state of another account", NEAR.first, "near-missing"],
    ["an unrequested id", NEAR.first, "near-found:id"],
    ["another error", NEAR.sixth, "near-missing:name"],
  ])("refuses %s", async (_name, address, fixture) => {
    const [name, change] = fixture.split(":");
    provider(() => {
      const body = recorded(name ?? "") as Record<string, unknown>;
      if (change === "id") return { ...body, id: "1" };
      if (change === "name") {
        const error = body.error as { cause: object };
        return { ...body, error: { ...error, cause: { ...error.cause, name: "TIMEOUT_ERROR" } } };
      }
      return body;
    });
    await expect(read("near", [address])).rejects.toMatchObject({ code: "account.response" });
  });
});

describe("Tron's reader", () => {
  it("reads activated accounts, a missing balance as zero, and an empty list as no account", async () => {
    const { sent } = provider(({ url }) =>
      recorded(
        url.endsWith(TRON.first)
          ? "tron-found"
          : url.endsWith(TRON.sixth)
            ? "tron-activated-empty"
            : "tron-not-activated",
      ),
    );
    const view = await read("tron", [TRON.first, TRON.sixth, TRON.thousandth]);
    expect(sent.map(({ url }) => url)).toEqual(
      [TRON.first, TRON.sixth, TRON.thousandth].map(
        (address) => `https://api.trongrid.io/v1/accounts/${address}`,
      ),
    );
    expect(view.entries).toEqual([
      { address: TRON.first, exists: true, used: true, balance: "0", sequence: null },
      { address: TRON.sixth, exists: true, used: true, balance: "0", sequence: null },
      { address: TRON.thousandth, exists: false, used: false, balance: "0", sequence: null },
    ]);
  });

  it.each([
    ["the state of another account", "tron-activated-empty"],
    ["an unsuccessful answer", "tron-found:failed"],
  ])("refuses %s", async (_name, fixture) => {
    const [name, change] = fixture.split(":");
    provider(() => {
      const body = recorded(name ?? "") as Record<string, unknown>;
      return change === "failed" ? { ...body, success: false } : body;
    });
    await expect(read("tron", [TRON.first])).rejects.toMatchObject({ code: "account.response" });
  });
});

describe("the Cosmos SDK readers", () => {
  it("read an account's sequence and uatom, and an address the auth module does not hold", async () => {
    const { sent, mostPending } = provider(({ url }) =>
      url.includes("/auth/")
        ? url.endsWith(COSMOS.first)
          ? recorded("cosmos-auth-found")
          : { status: 404, body: recorded("cosmos-auth-missing") }
        : recorded("cosmos-balance"),
    );
    const view = await read("cosmos", [COSMOS.first, COSMOS.sixth]);
    expect(mostPending()).toBe(1);
    // The balance is read only for an account the auth module holds.
    expect(sent.map(({ url }) => url)).toEqual([
      `https://cosmos-rest.publicnode.com/cosmos/auth/v1beta1/accounts/${COSMOS.first}`,
      `https://cosmos-rest.publicnode.com/cosmos/bank/v1beta1/balances/${COSMOS.first}/by_denom?denom=uatom`,
      `https://cosmos-rest.publicnode.com/cosmos/auth/v1beta1/accounts/${COSMOS.sixth}`,
    ]);
    expect(view).toEqual({
      coin: "cosmos",
      height: null,
      entries: [
        { address: COSMOS.first, exists: true, used: true, balance: "3", sequence: "7" },
        { address: COSMOS.sixth, exists: false, used: false, balance: "0", sequence: null },
      ],
    });
  });

  it("read Injective's EthAccount and its inj balance", async () => {
    const { sent } = provider(({ url }) =>
      url.includes("/auth/")
        ? url.endsWith(INJECTIVE.first)
          ? recorded("injective-auth-found")
          : { status: 404, body: recorded("injective-auth-missing") }
        : recorded("injective-balance"),
    );
    const view = await read("injective", [INJECTIVE.first, INJECTIVE.sixth]);
    expect(sent[1]?.url).toBe(
      `https://injective-rest.publicnode.com/cosmos/bank/v1beta1/balances/${INJECTIVE.first}/by_denom?denom=inj`,
    );
    expect(view.entries).toEqual([
      { address: INJECTIVE.first, exists: true, used: true, balance: "1", sequence: "2" },
      { address: INJECTIVE.sixth, exists: false, used: false, balance: "0", sequence: null },
    ]);
  });

  it("read a vesting account's base account", async () => {
    // The recorded account wrapped as a continuous vesting account.
    const { account } = recorded("cosmos-auth-found") as { account: Record<string, unknown> };
    provider(({ url }) =>
      url.includes("/auth/")
        ? {
            account: {
              "@type": "/cosmos.vesting.v1beta1.ContinuousVestingAccount",
              base_vesting_account: { base_account: account, original_vesting: [] },
              start_time: "1",
            },
          }
        : recorded("cosmos-balance"),
    );
    expect((await read("cosmos", [COSMOS.first])).entries[0]).toMatchObject({
      exists: true,
      sequence: "7",
    });
  });

  it.each([
    [
      "the state of another account",
      () => ({
        account: {
          ...(recorded("cosmos-auth-found") as { account: object }).account,
          address: COSMOS.sixth,
        },
      }),
    ],
    [
      "another gRPC error",
      () => ({ status: 404, body: { code: 2, message: `account ${COSMOS.first} not found` } }),
    ],
    [
      "a not-found of another address",
      () => ({ status: 404, body: recorded("cosmos-auth-missing") }),
    ],
    ["a server error", () => ({ status: 500, body: {} })],
    ["an unknown account type", () => ({ account: { "@type": "/x.Unknown", value: {} } })],
    ["a balance of another denomination", "denom"],
    ["a balance past 2^256", "amount"],
  ])("refuse %s", async (_name, change) => {
    provider(({ url }) => {
      if (url.includes("/auth/"))
        return typeof change === "function" ? change() : recorded("cosmos-auth-found");
      const body = recorded("cosmos-balance") as { balance: Record<string, unknown> };
      if (change === "denom") return { balance: { ...body.balance, denom: "ibc/27394FB" } };
      if (change === "amount")
        return { balance: { ...body.balance, amount: `1${"0".repeat(78)}` } };
      return body;
    });
    await expect(read("cosmos", [COSMOS.first])).rejects.toThrow();
  });

  it("take bech32 in either case, and Injective an EVM address of the same account", () => {
    const cosmos = accountStatesReader(accountCoin("cosmos"));
    expect(cosmos.account(COSMOS.first.toUpperCase())).toBe(COSMOS.first);
    expect(cosmos.canonical(COSMOS.first.toUpperCase())).toBeNull();
    expect(cosmos.account(INJECTIVE.first)).toBeNull();
    const injective = accountStatesReader(accountCoin("injective"));
    expect(injective.account(INJECTIVE.firstEvm)).toBe(INJECTIVE.first);
    expect(injective.account(INJECTIVE.firstEvm.toLowerCase())).toBe(INJECTIVE.first);
    expect(injective.canonical(INJECTIVE.firstEvm)).toBeNull();
    // A mixed-case EVM address with a wrong EIP-55 checksum names nothing.
    expect(injective.account(`0x9858effD232B4033E47d90003D41EC34EcaEda94`)).toBeNull();
    expect(injective.account(COSMOS.first)).toBeNull();
  });
});

describe("Hedera's reader", () => {
  const mirror = "https://mainnet.mirrornode.hedera.com/api/v1";
  const byKey = (key: string) =>
    `${mirror}/accounts?account.publickey=${key}&balance=true&limit=100&order=asc`;
  /** The recorded account of the first key, changed into `id` with `balance` and `changes`. */
  const accountOf = (id: string, balance: number, changes: Record<string, unknown> = {}) => {
    const found = recorded("hedera-account-found") as Record<string, unknown>;
    return {
      ...found,
      account: id,
      balance: { ...(found.balance as object), balance },
      ...changes,
    };
  };

  it("reads the accounts of an Ed25519 key, two in the recording, and a key with none", async () => {
    const { sent } = provider(({ url }) =>
      recorded(url.includes(HEDERA.firstKey) ? "hedera-key-found" : "hedera-key-none"),
    );
    const view = await read("hedera", [HEDERA.first, HEDERA.sixth]);
    expect(sent.map(({ url }) => url)).toEqual([byKey(HEDERA.firstKey), byKey(HEDERA.sixthKey)]);
    expect(view).toEqual({
      coin: "hedera",
      height: null,
      entries: [
        {
          address: HEDERA.first,
          exists: true,
          used: true,
          balance: "14285",
          sequence: null,
          accounts: [
            { id: HEDERA.account, balance: "14284" },
            { id: "0.0.629081", balance: "1" },
          ],
        },
        {
          address: HEDERA.sixth,
          exists: false,
          used: false,
          balance: "0",
          sequence: null,
          accounts: [],
        },
      ],
    });
  });

  it("reads an account by its number and by its long-zero address, and a 404 as none", async () => {
    const { sent } = provider(({ url }) =>
      url.includes(HEDERA.evm.toLowerCase())
        ? { status: 404, body: recorded("hedera-not-found") }
        : recorded("hedera-account-found"),
    );
    const view = await read("hedera", [HEDERA.account, HEDERA.longZero, HEDERA.evm]);
    expect(sent.map(({ url }) => url)).toEqual([
      `${mirror}/accounts/${HEDERA.account}?transactions=false`,
      `${mirror}/accounts/${HEDERA.longZero.toLowerCase()}?transactions=false`,
      `${mirror}/accounts/${HEDERA.evm.toLowerCase()}?transactions=false`,
    ]);
    const found = {
      exists: true,
      used: true,
      balance: "14285",
      accounts: [{ id: HEDERA.account, balance: "14285" }],
    };
    expect(view.entries).toEqual([
      { address: HEDERA.account, sequence: null, ...found },
      { address: HEDERA.longZero, sequence: null, ...found },
      {
        address: HEDERA.evm,
        exists: false,
        used: false,
        balance: "0",
        sequence: null,
        accounts: [],
      },
    ]);
  });

  it("sums a key's live accounts in ascending order and counts a deleted one as used", async () => {
    const body = recorded("hedera-key-found") as { accounts: Record<string, unknown>[] };
    const [account] = body.accounts;
    const copy = (id: string, balance: number, deleted: boolean, key = HEDERA.firstKey) => ({
      ...account,
      account: id,
      deleted,
      key: { _type: "ED25519", key },
      balance: { ...(account?.balance as object), balance },
    });
    provider(({ url }) =>
      url.includes(HEDERA.firstKey)
        ? { ...body, accounts: [account, copy("0.0.200", 6, false), copy("0.0.150", 0, true)] }
        : { ...body, accounts: [copy("0.0.150", 0, true, HEDERA.sixthKey)] },
    );
    expect((await read("hedera", [HEDERA.first, HEDERA.sixth])).entries).toEqual([
      {
        address: HEDERA.first,
        exists: true,
        used: true,
        balance: "14290",
        sequence: null,
        accounts: [
          { id: "0.0.200", balance: "6" },
          { id: HEDERA.account, balance: "14284" },
        ],
      },
      {
        address: HEDERA.sixth,
        exists: false,
        used: true,
        balance: "0",
        sequence: null,
        accounts: [],
      },
    ]);
  });

  it("reads an ECDSA key by the key and by its EVM alias, the recorded key having neither", async () => {
    const { sent } = provider(({ url }) =>
      url.includes("publickey")
        ? recorded("hedera-ecdsa-key-none")
        : { status: 404, body: recorded("hedera-not-found") },
    );
    const view = await read("hedera", [HEDERA.ecdsa]);
    // The filter takes the compressed key without its DER prefix; the alias is the key's EVM address.
    expect(sent.map(({ url }) => url)).toEqual([
      byKey(HEDERA.ecdsaKey),
      `${mirror}/accounts/${HEDERA.evm.toLowerCase()}?transactions=false`,
    ]);
    expect(view.entries).toEqual([
      {
        address: HEDERA.ecdsa,
        exists: false,
        used: false,
        balance: "0",
        sequence: null,
        accounts: [],
      },
    ]);
  });

  it("lists an account the key and its alias both find once, and a keyless alias account too", async () => {
    const ecdsaKey = { _type: "ECDSA_SECP256K1", key: HEDERA.ecdsaKey };
    const evm = HEDERA.evm.toLowerCase();
    provider(({ url }) =>
      url.includes("publickey")
        ? {
            accounts: [
              accountOf("0.0.700", 5, { key: ecdsaKey, evm_address: evm }),
              accountOf("0.0.800", 3, { key: ecdsaKey }),
            ],
            links: { next: null },
          }
        : accountOf("0.0.700", 6, { key: ecdsaKey, evm_address: evm }),
    );
    expect((await read("hedera", [HEDERA.ecdsa])).entries[0]).toEqual({
      address: HEDERA.ecdsa,
      exists: true,
      used: true,
      balance: "9",
      sequence: null,
      // 0.0.700's later read, by its alias, is the one kept.
      accounts: [
        { id: "0.0.700", balance: "6" },
        { id: "0.0.800", balance: "3" },
      ],
    });
    // An account a transfer to the alias created holds no key until it signs.
    provider(({ url }) =>
      url.includes("publickey")
        ? recorded("hedera-ecdsa-key-none")
        : accountOf("0.0.900", 7, { key: null, evm_address: evm }),
    );
    expect((await read("hedera", [HEDERA.ecdsa])).entries[0]?.accounts).toEqual([
      { id: "0.0.900", balance: "7" },
    ]);
  });

  it.each([
    [
      "more accounts than one page",
      HEDERA.first,
      /more than 100 accounts/u,
      (body: Record<string, unknown>) => ({
        ...body,
        links: { next: "/api/v1/accounts?limit=100&account.id=gt:0.0.163372" },
      }),
    ],
    [
      "an account of another key",
      HEDERA.first,
      /another account/u,
      (body: Record<string, unknown>) => ({
        ...body,
        accounts: (body.accounts as Record<string, unknown>[]).map((account) => ({
          ...account,
          key: { _type: "ED25519", key: HEDERA.sixthKey },
        })),
      }),
    ],
    [
      "an account of another key type",
      HEDERA.first,
      /another account/u,
      (body: Record<string, unknown>) => ({
        ...body,
        accounts: (body.accounts as Record<string, unknown>[]).map((account) => ({
          ...account,
          key: { _type: "ECDSA_SECP256K1", key: HEDERA.ecdsaKey },
        })),
      }),
    ],
    [
      "an account whose key is a key list",
      HEDERA.first,
      /not a single key the tools read/u,
      (body: Record<string, unknown>) => ({
        ...body,
        accounts: (body.accounts as Record<string, unknown>[]).map((account) => ({
          ...account,
          key: { _type: "ProtobufEncoded", key: "0a051896cb9c05" },
        })),
      }),
    ],
    [
      "a deleted account with a balance",
      HEDERA.first,
      /deleted account with a balance/u,
      (body: Record<string, unknown>) => ({
        ...body,
        accounts: (body.accounts as Record<string, unknown>[]).map((account) => ({
          ...account,
          deleted: true,
        })),
      }),
    ],
    [
      "an account of a non-canonical number",
      HEDERA.first,
      /malformed account data/u,
      (body: Record<string, unknown>) => ({
        ...body,
        accounts: (body.accounts as Record<string, unknown>[]).map((account) => ({
          ...account,
          account: "0.0.0163372",
        })),
      }),
    ],
    [
      "the state of another number",
      "0.0.163373",
      /another account/u,
      (body: Record<string, unknown>) => body,
    ],
    [
      "another EVM address",
      HEDERA.evm,
      /another account/u,
      (body: Record<string, unknown>) => body,
    ],
  ])("refuses %s", async (_name, address, message, change) => {
    provider(({ url }) =>
      change(
        recorded(url.includes("publickey") ? "hedera-key-found" : "hedera-account-found") as Record<
          string,
          unknown
        >,
      ),
    );
    await expect(read("hedera", [address])).rejects.toMatchObject({
      code: "account.response",
      message: expect.stringMatching(message),
    });
  });

  it.each([
    [
      "another 404 message",
      { status: 404, body: { _status: { messages: [{ message: "Gone" }] } } },
    ],
    [
      "a refused parameter",
      { status: 400, body: { _status: { messages: [{ message: "Invalid parameter" }] } } },
    ],
  ])("refuses %s", async (_name, answer) => {
    provider(() => answer);
    await expect(read("hedera", [HEDERA.account])).rejects.toThrow();
  });

  it("takes account IDs, EVM addresses and DER public keys as people have them", () => {
    const hedera = accountStatesReader(accountCoin("hedera"));
    expect(hedera.account("0.0.163372-giukq")).toBe(HEDERA.account);
    expect(hedera.account("0.0.163372-pwfrz")).toBeNull();
    expect(hedera.account(HEDERA.evm.toLowerCase())).toBe(HEDERA.evm);
    expect(hedera.account(HEDERA.first.slice(4))).toBe(HEDERA.first);
    expect(hedera.account(HEDERA.ecdsa.slice(4).toUpperCase())).toBe(HEDERA.ecdsa);
    expect(hedera.account(HEDERA.firstKey)).toBeNull();
    expect(hedera.account(HEDERA.ecdsaKey)).toBeNull();
    expect(hedera.canonical(HEDERA.evm.toLowerCase())).toBeNull();
    expect(hedera.canonical(HEDERA.first)).toBe(HEDERA.first);
    expect(hedera.canonical(HEDERA.ecdsa)).toBe(HEDERA.ecdsa);
  });
});

describe("TON's reader", () => {
  const center = "https://toncenter.com/api/v3/walletInformation";
  const fakeClock = () =>
    vi.useFakeTimers({ now: 0, toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });

  it("reads an active wallet's seqno from a liteserver, and an uninitialized address with nothing as unused", async () => {
    const { sent, mostPending } = provider(({ url }) =>
      recorded(url.includes(encodeURIComponent(TON.trust)) ? "ton-active" : "ton-uninit"),
    );
    const view = await read("ton", [TON.trust, TON.ledger]);
    expect(mostPending()).toBe(1);
    expect(sent.map(({ url }) => url)).toEqual(
      [TON.trust, TON.ledger].map(
        (address) => `${center}?address=${encodeURIComponent(address)}&use_v2=true`,
      ),
    );
    expect(view).toEqual({
      coin: "ton",
      height: null,
      entries: [
        { address: TON.trust, exists: true, used: true, balance: "0", sequence: "84" },
        { address: TON.ledger, exists: false, used: false, balance: "0", sequence: null },
      ],
    });
  });

  it.each([
    [
      "an uninitialized account that received TON",
      { last_transaction_lt: "47000001", balance: "5" },
      { exists: true, used: true, balance: "5", sequence: null },
    ],
    [
      "an uninitialized account with a transaction and nothing left",
      { last_transaction_lt: "47000001" },
      { exists: true, used: true, balance: "0", sequence: null },
    ],
    [
      "a frozen account",
      { status: "frozen", last_transaction_lt: "47000001" },
      { exists: true, used: true, balance: "0", sequence: null },
    ],
  ])("reads %s", async (_name, change, expected) => {
    provider(() => ({ ...(recorded("ton-uninit") as object), ...change }));
    expect((await read("ton", [TON.ledger])).entries[0]).toEqual({
      address: TON.ledger,
      ...expected,
    });
  });

  it.each([
    ["an unknown status", { status: "deleted" }],
    // The indexer's statuses, which a liteserver's answer does not use.
    ["the indexer's uninit", { status: "uninit" }],
    ["the indexer's nonexist", { status: "nonexist" }],
    ["a malformed seqno", { seqno: -1 }],
    ["no transaction mark", { last_transaction_lt: undefined }],
  ])("refuses %s", async (_name, change) => {
    provider(() => ({ ...(recorded("ton-active") as object), ...change }));
    await expect(read("ton", [TON.trust])).rejects.toMatchObject({ code: "account.response" });
  });

  it("asks again once, a pace later, after TON Center's rate limit, and fails on a second", async () => {
    fakeClock();
    const times: number[] = [];
    const answers = [429, 200, 429, 429];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(performance.now());
        const status = answers.shift() ?? 200;
        const body = status === 429 ? recorded("ton-rate-limited") : recorded("ton-active");
        return new Response(JSON.stringify(body), { status });
      }),
    );
    const reader = accountStatesReader(accountCoin("ton"));
    const first = reader.read([TON.trust]);
    await vi.advanceTimersByTimeAsync(1100);
    expect((await first).entries[0]?.sequence).toBe("84");
    expect(times).toEqual([0, 1100]);
    const second = reader.read([TON.trust]);
    const failed = expect(second).rejects.toThrow(/HTTP 429/u);
    await vi.advanceTimersByTimeAsync(5000);
    await failed;
    // The next lookup waited a pace after the last answer, and then a pace before its retry.
    expect(times).toEqual([0, 1100, 2200, 3300]);
  });

  it("paces its requests from the end of the last one, across lookups", async () => {
    fakeClock();
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(performance.now());
        // Each request takes half a second, as over a slow connection.
        await new Promise((resolve) => setTimeout(resolve, 500));
        return new Response(JSON.stringify(recorded("ton-uninit")));
      }),
    );
    const reader = accountStatesReader(accountCoin("ton"));
    const first = reader.read([TON.trust, TON.trustSixth]);
    // A lookup that starts meanwhile waits its turn behind the first.
    const second = reader.read([TON.ledger]);
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all([first, second]);
    expect(times).toEqual([0, 1600, 3200]);
  });

  it("lets a lookup cancelled while it waits leave its place without delaying the next", async () => {
    fakeClock();
    const times: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        times.push(performance.now());
        return new Response(JSON.stringify(recorded("ton-uninit")));
      }),
    );
    const reader = accountStatesReader(accountCoin("ton"));
    await reader.read([TON.trust]);
    const cancelled = Array.from({ length: 8 }, () => new AbortController());
    const outcomes = cancelled.map((controller) =>
      reader.read([TON.ledger], controller.signal).then(
        () => null,
        (cause: unknown) => cause,
      ),
    );
    for (const controller of cancelled) controller.abort();
    for (const cause of await Promise.all(outcomes))
      expect(cause).toMatchObject({ name: "AbortError" });
    const next = reader.read([TON.trustSixth]);
    await vi.advanceTimersByTimeAsync(1100);
    await next;
    expect(times).toEqual([0, 1100]);
  });

  it("takes the user-friendly forms in either alphabet and the raw form", () => {
    const ton = accountStatesReader(accountCoin("ton"));
    const accountId = tonAccountId(TON.trust);
    if (accountId === null) throw new Error("No account id.");
    const bounceable = tonFriendlyAddress(accountId, true);
    expect(bounceable.startsWith("EQ")).toBe(true);
    expect(ton.account(bounceable)).toBe(TON.trust);
    expect(ton.account(TON.trustRaw)).toBe(TON.trust);
    expect(ton.account(TON.trust.replaceAll("-", "+").replaceAll("_", "/"))).toBe(TON.trust);
    expect(ton.canonical(bounceable)).toBeNull();
    expect(ton.canonical(TON.trust)).toBe(TON.trust);
    // Another workchain (the masterchain) is not a wallet the tools read.
    expect(ton.account(TON.trustRaw.replace(/^0:/u, "-1:"))).toBeNull();
  });
});
