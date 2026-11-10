// The account coins' readers on public responses recorded on 2026-11-10 (Origin: null, as the
// Network Worker sends it) for addresses of the public "abandon … about" phrase, kept verbatim in
// test/fixtures/account-coins/. A malformed or partial answer is one of them changed, as each test
// says.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountCoin, accountStatesReader } from "../src/account-coins.js";

afterEach(() => vi.unstubAllGlobals());

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
