import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// BIP39's published zero-entropy phrase and its first MetaMask account (m/44'/60'/0'/0/0); this
// exercises the EVM networks' scans and boundaries, not a derivation oracle.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const FIRST_ACCOUNT = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
const HTTP = /^https?:\/\//u;
// EIP-155 chain ids (chainlist.org, 2026-11-10) of the networks each case selects, by endpoint.
const SCANNED = new Map([
  ["ethereum-rpc.publicnode.com", "0x1"],
  ["base-rpc.publicnode.com", "0x2105"],
  // BNB Chain's fixture answers with Ethereum's chain id: the scan must refuse it.
  ["bsc-rpc.publicnode.com", "0x1"],
]);
const VIEWED = new Map([["gnosis-rpc.publicnode.com", "0x64"]]);
const ONE_UNIT = "0xde0b6b3a7640000"; // 10^18 wei

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

/** Serves only the selected EVM networks' endpoints; any other request fails the case. */
function evmRoute(requests, chains, funded) {
  return async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), body: request.postData() });
    assert.equal(request.url().includes(PHRASE), false);
    assert.equal(request.postData()?.includes(PHRASE) ?? false, false);
    const { hostname } = new URL(request.url());
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
  /** A candidate scan of Ethereum, Base and BNB Chain: own endpoints and units, a refused chain id. */
  static async scanner(context, page, requests) {
    const frame = page.frames().find((candidate) => candidate.parentFrame() === page.mainFrame());
    assert.ok(frame, "The actual opaque vault frame must exist");
    const route = evmRoute(
      requests,
      SCANNED,
      (host, address) => host === "base-rpc.publicnode.com" && address === FIRST_ACCOUNT,
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
      for (const id of ["ethereum", "base", "bnb-chain"])
        await frame.locator(`#candidate-coins input[value="${id}"]`).check();
      assert.equal(await group.evaluate((box) => box.indeterminate), true);
      await frame.locator("#core-receive-count").fill("1");
      await frame.locator("#single-mnemonic").fill(PHRASE);
      await frame.locator("#start-recovery-scan").click();
      await frame.locator(".recovery-result-tab").nth(2).waitFor();
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      const tabs = await frame.locator(".recovery-result-tab").allTextContents();
      assert.deepEqual(tabs.toSorted(), ["BNB Chain · warning", "Base", "Ethereum"]);
      const hosts = new Set(requests.map(({ url }) => new URL(url).hostname));
      assert.deepEqual([...hosts].toSorted(), [...SCANNED.keys()].toSorted());
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
      return "Ethereum, Base and BNB Chain candidates: own endpoints and units, a wrong chain id refused, Testnet offered only where it exists";
    } finally {
      await context.unroute(HTTP, route);
    }
  }

  /** Gnosis in the actual Viewer: Mainnet only, xDAI, balance and nonce without a history. */
  static async viewer(context, page, requests) {
    const route = evmRoute(requests, VIEWED, (_host, address) => address === FIRST_ACCOUNT);
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
      return "Gnosis: Testnet disabled, xDAI balance and nonce from its own endpoint, history unsupported";
    } finally {
      await context.unroute(HTTP, route);
    }
  }
}
