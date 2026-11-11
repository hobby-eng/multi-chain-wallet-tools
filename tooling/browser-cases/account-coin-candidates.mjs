import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// BIP39's published zero-entropy phrase and each account coin's first address of it (the Deriver's
// startup vectors); this exercises the account coins' scans and boundaries, not a derivation oracle.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const FIRST = {
  solana: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
  xrp: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
  stellar: "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
  near: "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
  tron: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
  cosmos: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
  injective: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
  hedera:
    "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
  ton: "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY",
};
// Hedera's first Ed25519 key (the alias's last 64 hex digits), the two accounts the network gave it
// (probed 2026-11-10) and the key's DER private key as the Deriver shows it; TON's first address in
// its raw form.
const HEDERA_KEY = FIRST.hedera.slice(-64);
const HEDERA_ACCOUNTS = ["0.0.163372", "0.0.629081"];
const HEDERA_PRIVATE_DER =
  "302e020100300506032b657004220420523f9ff611ac02e8e188617750e7e50feabd2ef9ee9b218a5c8ce2693275361d";
const TON_RAW = "0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9";
// NEAR's first public key and secret key of the phrase, as the Deriver shows them.
const NEAR_PUBLIC_KEY = "ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25";
const NEAR_SECRET_KEY =
  "ed25519:F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH";
// TronGrid's hex form of the first Tron address (0x41 and its 20-byte hash).
const FIRST_TRON_HEX = "41c8599111f29c1e1e061265b4af93ea1f274ad78a";
const HTTP = /^https?:\/\//u;
const json = (body, status = 200) => ({
  status,
  json: body,
  headers: { "access-control-allow-origin": "*" },
});

/** A Cosmos SDK gateway's answers: the first address an account of `wrap`, others NotFound. */
function cosmosGateway(first, denom, amount, wrap) {
  return (request) => {
    const { pathname } = new URL(request.url());
    const address = pathname.split("/").at(pathname.includes("/by_denom") ? -2 : -1);
    if (pathname.includes("/bank/")) return json({ balance: { denom, amount } });
    return address === first
      ? json({ account: wrap({ address, pub_key: null, account_number: "1", sequence: "7" }) })
      : json({ code: 5, message: `account ${address} not found`, details: [] }, 404);
  };
}

/** A mirror node account of Hedera's first key, with `tinybars`. */
const hederaAccount = (id, tinybars) => ({
  account: id,
  deleted: false,
  balance: { balance: tinybars, timestamp: "1794340134.496117212", tokens: [] },
  evm_address: `0x${"0".repeat(24)}${BigInt(id.slice(4)).toString(16).padStart(16, "0")}`,
  key: { _type: "ED25519", key: HEDERA_KEY },
});

/** Synthetic answers of each provider, in its own shape: the first address funded, others unused. */
const PROVIDERS = {
  "solana-rpc.publicnode.com": (request) =>
    json(
      request.postDataJSON().map(({ id, method, params }) => ({
        jsonrpc: "2.0",
        id,
        result:
          method === "getMultipleAccounts"
            ? {
                context: { slot: 467705485 },
                value: params[0].map((address) =>
                  address === FIRST.solana ? { lamports: 1000000000, space: 0 } : null,
                ),
              }
            : [],
      })),
    ),
  "xrplcluster.com": (request) => {
    const { account } = request.postDataJSON().params[0];
    return json({
      result:
        account === FIRST.xrp
          ? {
              account_data: { Account: account, Balance: "25000000", Sequence: 7 },
              ledger_index: 108238352,
              validated: true,
              status: "success",
            }
          : {
              account,
              error: "actNotFound",
              ledger_index: 108238353,
              validated: true,
              status: "error",
            },
    });
  },
  "horizon.stellar.org": (request) => {
    const account = new URL(request.url()).pathname.split("/").at(-1);
    return account === FIRST.stellar
      ? json({
          account_id: account,
          sequence: "264874520089722880",
          balances: [{ balance: "12.5000000", asset_type: "native" }],
        })
      : json({ type: "https://stellar.org/horizon-errors/not_found", status: 404 }, 404);
  },
  "free.rpc.fastnear.com": (request) => {
    const { id, params } = request.postDataJSON();
    return json(
      params.account_id === FIRST.near
        ? { jsonrpc: "2.0", id, result: { amount: "3000000000000000000000000", block_height: 9 } }
        : {
            jsonrpc: "2.0",
            id,
            error: {
              cause: {
                name: "UNKNOWN_ACCOUNT",
                info: { block_height: 9, requested_account_id: params.account_id },
              },
            },
          },
    );
  },
  "cosmos-rest.publicnode.com": cosmosGateway(FIRST.cosmos, "uatom", "2500000", (base) => ({
    "@type": "/cosmos.auth.v1beta1.BaseAccount",
    ...base,
  })),
  "injective-rest.publicnode.com": cosmosGateway(
    FIRST.injective,
    "inj",
    "1500000000000000000",
    (base) => ({
      "@type": "/injective.types.v1beta1.EthAccount",
      base_account: base,
      code_hash: "xdJGAYb3IzySfn2y3McDwOUAtlPKgic7e/rYBF2FpHA=",
    }),
  ),
  // The first key controls two accounts; an account read by its number is the first of them.
  "mainnet.mirrornode.hedera.com": (request) => {
    const url = new URL(request.url());
    const key = url.searchParams.get("account.publickey");
    if (key !== null)
      return json({
        accounts:
          key === HEDERA_KEY
            ? [hederaAccount(HEDERA_ACCOUNTS[0], 300000000), hederaAccount(HEDERA_ACCOUNTS[1], 1)]
            : [],
        links: { next: null },
      });
    return url.pathname.endsWith(`/${HEDERA_ACCOUNTS[0]}`)
      ? json(hederaAccount(HEDERA_ACCOUNTS[0], 300000000))
      : json({ _status: { messages: [{ message: "Not found" }] } }, 404);
  },
  // Every Scanner address is one TON Center reports uninitialized without a transaction; the Viewer's is
  // an active wallet.
  "toncenter.com": (_request, viewer) =>
    json(
      viewer
        ? {
            balance: "2000000000",
            wallet_type: "wallet v4 r2",
            seqno: 84,
            wallet_id: 698983191,
            last_transaction_lt: "115332559000043",
            last_transaction_hash: "afS1MxJRuiCMs/VD9oJEXvJ5lYk5eDA2255j/DO0lqE=",
            status: "active",
          }
        : {
            balance: "0",
            last_transaction_lt: "0",
            last_transaction_hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            status: "uninitialized",
          },
    ),
  // The Scanner's Tron answer names another account: the scan must refuse it.
  "api.trongrid.io": (request, viewer) =>
    json({
      success: true,
      data: [
        {
          address: viewer ? FIRST_TRON_HEX : `41${"00".repeat(20)}`,
          balance: 5000000,
        },
      ],
    }),
};

/** Serves only `hosts`; any other request fails the case. */
function accountRoute(requests, hosts, viewer = false) {
  return async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), body: request.postData(), at: Date.now() });
    assert.equal(request.url().includes(PHRASE), false);
    assert.equal(request.postData()?.includes(PHRASE) ?? false, false);
    const { hostname } = new URL(request.url());
    assert.ok(hosts.includes(hostname), `Request to an unselected endpoint: ${request.url()}`);
    await route.fulfill(PROVIDERS[hostname](request, viewer));
  };
}

/** The account coins of the actual Scanner and Viewer, served only synthetic provider answers. */
export class AccountCoinCandidatesCase {
  /** A candidate scan of every account coin: own endpoints and units, a foreign account refused. */
  static async scanner(context, page, requests) {
    const frame = page.frames().find((candidate) => candidate.parentFrame() === page.mainFrame());
    assert.ok(frame, "The actual opaque vault frame must exist");
    const hosts = Object.keys(PROVIDERS);
    const route = accountRoute(requests, hosts);
    await context.route(HTTP, route);
    try {
      // An account coin offers Mainnet only, and no public-key scan.
      await frame.locator("#recovery-coin").selectOption("xrp");
      assert.equal(
        await frame.locator('#recovery-network option[value="testnet"]').isDisabled(),
        true,
      );
      assert.equal(
        await frame.locator("#start-recovery-scan-label").textContent(),
        "Scan XRP holdings",
      );
      await frame.locator('[data-source-mode="public"]').click();
      assert.equal(await frame.locator('#recovery-coin option[value="xrp"]').isDisabled(), true);
      assert.notEqual(await frame.locator("#recovery-coin").inputValue(), "xrp");
      await frame.locator('[data-source-mode="seed"]').click();
      // TON's note says on the page that the Telegram wallet's TON phrase is not scanned.
      await frame.locator("#recovery-coin").selectOption("ton");
      assert.match(
        await frame.locator("#generic-coin-scan-note").textContent(),
        /The Telegram wallet \(W5\) is not scanned/u,
      );
      await frame.locator("#automatic-candidates").check();
      const group = frame.locator('input[data-candidate-group="Other networks"]');
      assert.equal(await group.isChecked(), false, "All other networks starts unchecked");
      await frame.locator('#candidate-coins input[value="bitcoin"]').uncheck();
      await group.check();
      await frame.locator("#core-receive-count").fill("1");
      await frame.locator("#single-mnemonic").fill(PHRASE);
      await frame.locator("#start-recovery-scan").click();
      await frame.locator(".recovery-result-tab").nth(8).waitFor();
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      const tabs = await frame.locator(".recovery-result-tab").allTextContents();
      assert.deepEqual(tabs.toSorted(), [
        "Cosmos",
        "Hedera",
        "Injective",
        "NEAR",
        "Solana",
        "Stellar",
        "TON",
        "Tron · warning",
        "XRP",
      ]);
      const seen = new Set(requests.map(({ url }) => new URL(url).hostname));
      assert.deepEqual([...seen].toSorted(), hosts.toSorted());
      const download = page.waitForEvent("download");
      await frame.locator("#export-recovery-json").click();
      const report = JSON.parse(readFileSync(await (await download).path(), "utf8"));
      const first = (coin) => report.results.find(({ coinId }) => coinId === coin).sections[0];
      const solana = first("solana");
      assert.equal(solana.findings[0].title, FIRST.solana);
      assert.equal(solana.findings[0].balanceAtomic, "1000000000");
      assert.deepEqual(solana.findings[0].balanceUnit, {
        asset: "SOL",
        atomicUnit: "lamport",
        decimals: 9,
      });
      assert.equal(solana.findings[0].history.status, "unsupported");
      assert.equal(solana.source, "https://solana-rpc.publicnode.com");
      const xrp = first("xrp").findings[0];
      assert.equal(xrp.balanceAtomic, "25000000");
      assert.ok(
        xrp.fields.some(({ label, value }) => label === "Account sequence" && value === "7"),
      );
      assert.equal(first("stellar").findings[0].balanceAtomic, "125000000");
      assert.equal(first("near").findings[0].balanceAtomic, "3000000000000000000000000");
      assert.equal(first("tron").state, "failed");
      const cosmos = first("cosmos").findings[0];
      assert.equal(cosmos.title, FIRST.cosmos);
      assert.equal(cosmos.balanceAtomic, "2500000");
      assert.ok(
        cosmos.fields.some(({ label, value }) => label === "Account sequence" && value === "7"),
      );
      assert.equal(first("injective").findings[0].balanceAtomic, "1500000000000000000");
      // Hedera's first key: one finding of both accounts, their balances summed.
      const hedera = first("hedera").findings[0];
      assert.equal(hedera.title, FIRST.hedera);
      assert.equal(hedera.balanceAtomic, "300000001");
      assert.ok(
        hedera.fields.some(
          ({ label, value }) => label === "Account IDs" && value === HEDERA_ACCOUNTS.join(", "),
        ),
      );
      assert.ok(
        requests.some(({ url }) => url.includes(`account.publickey=${HEDERA_KEY}&`)),
        "Hedera's key is looked up by its raw public key",
      );
      // TON: both layouts' first addresses unused, read one at a time at TON Center's pace.
      const ton = report.results.find(({ coinId }) => coinId === "ton").sections[0];
      assert.equal(ton.findings.length, 0);
      assert.equal(ton.state, "complete");
      const tonTimes = requests
        .filter(({ url }) => new URL(url).hostname === "toncenter.com")
        .map(({ at }) => at);
      assert.equal(tonTimes.length, 2);
      assert.ok(tonTimes[1] - tonTimes[0] >= 1000, "TON Center's requests are paced");
      return "Solana, XRP, Stellar, NEAR, Tron, Cosmos, Injective, Hedera and TON candidates: own endpoints and units, Mainnet and seed scans only, Hedera's accounts named, TON paced, another account's answer refused";
    } finally {
      await context.unroute(HTTP, route);
    }
  }

  /**
   * Tron, NEAR, Hedera and TON in the actual Viewer: Mainnet only, balances without a history; NEAR
   * read from the account's public key and Hedera from an account ID with its checksum, each coin's
   * secret key refused before any request; TON read from its raw address.
   */
  static async viewer(context, page, requests) {
    const hosts = [
      "api.trongrid.io",
      "free.rpc.fastnear.com",
      "mainnet.mirrornode.hedera.com",
      "toncenter.com",
    ];
    const route = accountRoute(requests, hosts, true);
    await context.route(HTTP, route);
    try {
      await page.locator("#viewer-network").selectOption("testnet");
      await page.locator("#viewer-coin").selectOption("tron");
      await page.waitForFunction(
        () => document.querySelector('#viewer-network option[value="testnet"]').disabled,
      );
      assert.equal(await page.locator("#viewer-network").inputValue(), "mainnet");
      await page.locator("#full-viewing-key").fill(FIRST.tron);
      await page.locator("#scan-button").click();
      await page.locator("#viewer-results").waitFor({ state: "visible" });
      assert.match(await page.locator("#viewer-summary").textContent(), /5 TRX/u);
      assert.match(await page.locator("#viewer-completeness").textContent(), /not read/u);
      assert.match(
        await page.locator("#viewer-activity").textContent(),
        /https:\/\/api\.trongrid\.io/u,
      );
      await page.locator("#clear-viewer").click();
      await page.locator("#viewer-coin").selectOption("near");
      await page.locator("#full-viewing-key").fill(NEAR_PUBLIC_KEY);
      await page.locator("#scan-button").click();
      await page.locator("#viewer-results-description").filter({ hasText: FIRST.near }).waitFor();
      assert.match(await page.locator("#viewer-summary").textContent(), /3 NEAR/u);
      const asked = requests.filter(({ url }) => new URL(url).hostname === hosts[1]);
      assert.deepEqual(
        asked.map(({ body }) => JSON.parse(body).params.account_id),
        [FIRST.near],
      );
      await page.locator("#clear-viewer").click();
      await page.locator("#full-viewing-key").fill(NEAR_SECRET_KEY);
      await page.locator("#scan-button").click();
      await page
        .locator("#viewer-error")
        .filter({ hasText: "Private key-like material" })
        .waitFor();
      assert.match(await page.locator("#viewer-error").textContent(), /public key \(ed25519:…\)/u);
      assert.equal(await page.locator("#full-viewing-key").inputValue(), "");
      assert.equal(requests.filter(({ url }) => new URL(url).hostname === hosts[1]).length, 1);
      // Hedera: a DER private key refused before any request, then an account ID with its
      // mainnet checksum read as its number, its account named on the card.
      await page.locator("#clear-viewer").click();
      await page.locator("#viewer-coin").selectOption("hedera");
      await page.locator("#full-viewing-key").fill(HEDERA_PRIVATE_DER);
      await page.locator("#scan-button").click();
      await page
        .locator("#viewer-error")
        .filter({ hasText: "Private key-like material" })
        .waitFor();
      assert.match(
        await page.locator("#viewer-error").textContent(),
        /DER form \(302a… or 302d…\)/u,
      );
      assert.equal(await page.locator("#full-viewing-key").inputValue(), "");
      assert.equal(requests.filter(({ url }) => new URL(url).hostname === hosts[2]).length, 0);
      await page.locator("#full-viewing-key").fill("0.0.163372-giukq");
      await page.locator("#scan-button").click();
      await page.locator("#viewer-results-description").filter({ hasText: "0.0.163372" }).waitFor();
      assert.match(await page.locator("#viewer-summary").textContent(), /3 HBAR/u);
      assert.match(
        await page.locator("#viewer-activity").textContent(),
        /Account IDs0\.0\.163372/u,
      );
      assert.deepEqual(
        requests
          .filter(({ url }) => new URL(url).hostname === hosts[2])
          .map(({ url }) => new URL(url).pathname),
        ["/api/v1/accounts/0.0.163372"],
      );
      // TON: the raw form read as the canonical non-bounceable address, its seqno shown.
      await page.locator("#clear-viewer").click();
      await page.locator("#viewer-coin").selectOption("ton");
      await page.locator("#full-viewing-key").fill(TON_RAW);
      await page.locator("#scan-button").click();
      await page.locator("#viewer-results-description").filter({ hasText: FIRST.ton }).waitFor();
      assert.match(await page.locator("#viewer-summary").textContent(), /2 TON/u);
      assert.match(await page.locator("#viewer-activity").textContent(), /Account sequence84/u);
      assert.deepEqual(
        requests
          .filter(({ url }) => new URL(url).hostname === hosts[3])
          .map(({ url }) => new URL(url).searchParams.get("address")),
        [FIRST.ton],
      );
      assert.deepEqual(
        [...new Set(requests.map(({ url }) => new URL(url).hostname))].toSorted(),
        hosts.toSorted(),
      );
      return "Tron, NEAR, Hedera and TON: Testnet disabled, balances from their own endpoints, history unsupported; NEAR read from its public key, Hedera from a checksummed account ID with its account named, TON from its raw form; secret keys refused before any request";
    } finally {
      await context.unroute(HTTP, route);
    }
  }
}
