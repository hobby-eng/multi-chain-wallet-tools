import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// BIP39's published zero-entropy phrase, its first MetaMask account (m/44'/60'/0'/0/0) and its first
// Ethereum Classic account at coin type 61 (m/44'/61'/0'/0/0, the Deriver's startup vector); this
// exercises the EVM networks' scans and boundaries, not a derivation oracle.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const FIRST_ACCOUNT = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
const ETC_FIRST_ACCOUNT = "0xFA22515E43658ce56A7682B801e9B5456f511420";
const HTTP = /^https?:\/\//u;
// EIP-155 chain ids (chainlist.org, 2026-11-10) of the networks each case selects, by endpoint.
const SCANNED = new Map([
  ["ethereum-rpc.publicnode.com", "0x1"],
  ["base-rpc.publicnode.com", "0x2105"],
  // BNB Chain's fixture answers with Ethereum's chain id: the scan must refuse it.
  ["bsc-rpc.publicnode.com", "0x1"],
  ["etc.etcdesktop.com", "0x3d"],
]);
const VIEWED = new Map([
  ["gnosis-rpc.publicnode.com", "0x64"],
  ["etc.etcdesktop.com", "0x3d"],
]);
// Ethereum Classic's Blockscout root, which answers its history.
const ETC_HISTORY = "etc.blockscout.com";
const ONE_UNIT = "0xde0b6b3a7640000"; // 10^18 wei
const ONE_UNIT_DECIMAL = "1000000000000000000";
const SENDER = `0x${"22".repeat(20)}`;

/** A Blockscout API v2 page: one confirmed transfer of one unit from SENDER to `address`. */
function historyReply(url, address) {
  const items = url.pathname.endsWith("/internal-transactions")
    ? []
    : [
        {
          block_number: 16,
          hash: `0x${"ab".repeat(32)}`,
          timestamp: "2026-11-01T00:00:00.000000Z",
          from: { hash: SENDER },
          to: { hash: address },
          created_contract: null,
          status: "ok",
          value: ONE_UNIT_DECIMAL,
          fee: { type: "actual", value: "21000" },
        },
      ];
  return { items, next_page_params: null };
}

/** A JSON-RPC batch answer: the endpoint's chain id, block 0x10, and `funded` holding one unit. */
function rpcReply(calls, chainId, funded) {
  return calls.map(({ id, method, params }) => ({
    jsonrpc: "2.0",
    id,
    result:
      method === "eth_chainId"
        ? chainId
        : method === "eth_blockNumber"
          ? "0x10"
          : method === "eth_getBalance" && funded(params[0])
            ? ONE_UNIT
            : method === "eth_getTransactionCount" && funded(params[0])
              ? "0x2"
              : "0x0",
  }));
}

/**
 * Serves only the selected EVM networks' endpoints, and Ethereum Classic's history for its funded
 * account; any other request fails the case.
 */
function evmRoute(requests, chains, funded) {
  return async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), body: request.postData() });
    assert.equal(request.url().includes(PHRASE), false);
    assert.equal(request.postData()?.includes(PHRASE) ?? false, false);
    const url = new URL(request.url());
    const { hostname } = url;
    if (hostname === ETC_HISTORY) {
      assert.match(
        url.pathname,
        new RegExp(`^/api/v2/addresses/${ETC_FIRST_ACCOUNT.toLowerCase()}/`, "u"),
      );
      await route.fulfill({
        json: historyReply(url, ETC_FIRST_ACCOUNT),
        headers: { "access-control-allow-origin": "*" },
      });
      return;
    }
    const chainId = chains.get(hostname);
    assert.ok(chainId, `Request to an unselected endpoint: ${request.url()}`);
    await route.fulfill({
      json: rpcReply(request.postDataJSON(), chainId, (address) => funded(hostname, address)),
      headers: { "access-control-allow-origin": "*" },
    });
  };
}

/** The EVM networks of the actual Scanner and Viewer, served only synthetic JSON-RPC answers. */
export class EvmNetworkCandidatesCase {
  /**
   * A candidate scan of Ethereum, Base, BNB Chain and Ethereum Classic: own endpoints and units, a
   * refused chain id, and Ethereum Classic's coin type 61 account with its history.
   */
  static async scanner(context, page, requests) {
    const frame = page.frames().find((candidate) => candidate.parentFrame() === page.mainFrame());
    assert.ok(frame, "The actual opaque vault frame must exist");
    const route = evmRoute(
      requests,
      SCANNED,
      (host, address) =>
        (host === "base-rpc.publicnode.com" && address === FIRST_ACCOUNT) ||
        (host === "etc.etcdesktop.com" && address === ETC_FIRST_ACCOUNT),
    );
    await context.route(HTTP, route);
    try {
      // A network without a testnet offers Mainnet only.
      await frame.locator("#recovery-coin").selectOption("bnb-chain");
      assert.equal(
        await frame.locator('#recovery-network option[value="testnet"]').isDisabled(),
        true,
      );
      assert.equal(
        await frame.locator("#start-recovery-scan-label").textContent(),
        "Scan BNB Chain holdings",
      );
      await frame.locator("#recovery-coin").selectOption("ethereum");
      assert.equal(
        await frame.locator('#recovery-network option[value="testnet"]').isDisabled(),
        false,
      );
      await frame.locator("#automatic-candidates").check();
      const group = frame.locator('input[data-candidate-group="EVM networks"]');
      assert.equal(await group.isChecked(), false, "All EVM networks starts unchecked");
      await frame.locator('#candidate-coins input[value="bitcoin"]').uncheck();
      for (const id of ["ethereum", "base", "bnb-chain", "ethereum-classic"])
        await frame.locator(`#candidate-coins input[value="${id}"]`).check();
      assert.equal(await group.evaluate((box) => box.indeterminate), true);
      await frame.locator("#core-receive-count").fill("1");
      await frame.locator("#single-mnemonic").fill(PHRASE);
      await frame.locator("#start-recovery-scan").click();
      await frame.locator(".recovery-result-tab").nth(3).waitFor();
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      const tabs = await frame.locator(".recovery-result-tab").allTextContents();
      assert.deepEqual(tabs.toSorted(), [
        "BNB Chain · warning",
        "Base",
        "Ethereum",
        "Ethereum Classic",
      ]);
      const hosts = new Set(requests.map(({ url }) => new URL(url).hostname));
      assert.deepEqual([...hosts].toSorted(), [...SCANNED.keys(), ETC_HISTORY].toSorted());
      const download = page.waitForEvent("download");
      await frame.locator("#export-recovery-json").click();
      const report = JSON.parse(readFileSync(await (await download).path(), "utf8"));
      const base = report.results.find(({ coinId }) => coinId === "base");
      const [finding] = base.sections[0].findings;
      assert.equal(finding.title, FIRST_ACCOUNT);
      assert.equal(finding.balanceAtomic, "1000000000000000000");
      assert.deepEqual(finding.balanceUnit, { asset: "ETH", atomicUnit: "wei", decimals: 18 });
      assert.equal(finding.history.status, "unsupported");
      assert.equal(base.sections[0].source, "https://base-rpc.publicnode.com");
      const bnb = report.results.find(({ coinId }) => coinId === "bnb-chain");
      assert.equal(bnb.sections[0].state, "failed");
      const etc = report.results.find(({ coinId }) => coinId === "ethereum-classic");
      assert.equal(etc.sections[0].source, "https://etc.etcdesktop.com");
      const [etcFinding] = etc.sections[0].findings;
      assert.equal(etcFinding.title, ETC_FIRST_ACCOUNT);
      assert.equal(
        etcFinding.fields.find(({ label }) => label === "Derivation path").value,
        "m/44'/61'/0'/0/0",
      );
      assert.deepEqual(etcFinding.balanceUnit, { asset: "ETC", atomicUnit: "wei", decimals: 18 });
      assert.equal(etcFinding.history.status, "complete");
      assert.equal(etcFinding.history.asset, "ETC");
      assert.equal(etcFinding.history.totalReceivedAtomic, ONE_UNIT_DECIMAL);
      return "Ethereum, Base, BNB Chain and Ethereum Classic candidates: own endpoints and units, a wrong chain id refused, Testnet offered only where it exists, Ethereum Classic's coin type 61 account with its Blockscout history";
    } finally {
      await context.unroute(HTTP, route);
    }
  }

  /**
   * Gnosis and Ethereum Classic in the actual Viewer: Mainnet only, each in its own asset; Gnosis
   * without a history, Ethereum Classic with its Blockscout history.
   */
  static async viewer(context, page, requests) {
    const route = evmRoute(requests, VIEWED, (_host, address) =>
      [FIRST_ACCOUNT, ETC_FIRST_ACCOUNT].includes(address),
    );
    await context.route(HTTP, route);
    try {
      await page.locator("#viewer-network").selectOption("testnet");
      await page.locator("#viewer-coin").selectOption("gnosis");
      await page.waitForFunction(
        () => document.querySelector('#viewer-network option[value="testnet"]').disabled,
      );
      assert.equal(await page.locator("#viewer-network").inputValue(), "mainnet");
      await page.locator("#full-viewing-key").fill(FIRST_ACCOUNT);
      await page.locator("#scan-button").click();
      await page.locator("#viewer-results").waitFor({ state: "visible" });
      assert.match(await page.locator("#viewer-summary").textContent(), /1 xDAI/u);
      assert.match(await page.locator("#viewer-completeness").textContent(), /not read/u);
      assert.match(
        await page.locator("#viewer-activity").textContent(),
        /https:\/\/gnosis-rpc\.publicnode\.com/u,
      );
      assert.deepEqual(
        [...new Set(requests.map(({ url }) => new URL(url).hostname))],
        ["gnosis-rpc.publicnode.com"],
      );
      await page.locator("#viewer-coin").selectOption("ethereum-classic");
      await page.waitForFunction(
        () => document.querySelector('#viewer-network option[value="testnet"]').disabled,
      );
      await page.locator("#full-viewing-key").fill(ETC_FIRST_ACCOUNT);
      await page.locator("#scan-button").click();
      await page.waitForFunction(() =>
        /ETC/u.test(document.getElementById("viewer-summary")?.textContent ?? ""),
      );
      assert.match(await page.locator("#viewer-summary").textContent(), /1 ETC/u);
      assert.match(
        await page.locator("#viewer-completeness").textContent(),
        /Complete provider history/u,
      );
      assert.deepEqual([...new Set(requests.map(({ url }) => new URL(url).hostname))].toSorted(), [
        "etc.blockscout.com",
        "etc.etcdesktop.com",
        "gnosis-rpc.publicnode.com",
      ]);
      return "Gnosis: Testnet disabled, xDAI balance and nonce from its own endpoint, history unsupported; Ethereum Classic: Mainnet only, ETC balance from its own endpoint and its Blockscout history";
    } finally {
      await context.unroute(HTTP, route);
    }
  }
}
