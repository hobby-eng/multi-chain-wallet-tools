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
};
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
    requests.push({ url: request.url(), body: request.postData() });
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
      await frame.locator("#automatic-candidates").check();
      const group = frame.locator('input[data-candidate-group="Other networks"]');
      assert.equal(await group.isChecked(), false, "All other networks starts unchecked");
      await frame.locator('#candidate-coins input[value="bitcoin"]').uncheck();
      await group.check();
      await frame.locator("#core-receive-count").fill("1");
      await frame.locator("#single-mnemonic").fill(PHRASE);
      await frame.locator("#start-recovery-scan").click();
      await frame.locator(".recovery-result-tab").nth(4).waitFor();
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      const tabs = await frame.locator(".recovery-result-tab").allTextContents();
      assert.deepEqual(tabs.toSorted(), ["NEAR", "Solana", "Stellar", "Tron · warning", "XRP"]);
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
      return "Solana, XRP, Stellar, NEAR and Tron candidates: own endpoints and units, Mainnet and seed scans only, another account's answer refused";
    } finally {
      await context.unroute(HTTP, route);
    }
  }

  /**
   * Tron and NEAR in the actual Viewer: Mainnet only, balances without a history; NEAR read from
   * the account's public key, its secret key refused before any request.
   */
  static async viewer(context, page, requests) {
    const hosts = ["api.trongrid.io", "free.rpc.fastnear.com"];
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
      assert.deepEqual(
        [...new Set(requests.map(({ url }) => new URL(url).hostname))].toSorted(),
        hosts.toSorted(),
      );
      return "Tron and NEAR: Testnet disabled, balances from their own endpoints, history unsupported; NEAR read from its public key, its secret key refused before any request";
    } finally {
      await context.unroute(HTTP, route);
    }
  }
}
