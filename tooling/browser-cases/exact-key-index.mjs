import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SEC2 generator, with independent Python Base58Check addresses retained in exact-public-key.test.ts.
const KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ADDRESSES = ["XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE", "XoyDQM3xGhFW5JqYBwTLckjqZ67Q3jZfAL"];
const HTTP = /^https?:\/\//u;

/** Actual opaque input boundary and network worker, served only synthetic HTTP responses. */
export class ExactKeyIndexCase {
  #context;
  #page;
  #requests;
  #scenario = "healthy";
  #coreRequests = [];
  #statusStarted;
  #releaseStatus;
  #statusGate;

  constructor(context, page, requests) {
    this.#context = context;
    this.#page = page;
    this.#requests = requests;
  }

  #route = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    this.#requests.push({ url: request.url(), body: request.postData() });
    assert.equal(request.postData()?.includes(KEY) ?? false, false);
    assert.equal(url.href.includes(KEY), false);
    if (url.origin !== "https://dashscan.pshenmic.dev") {
      if (this.#scenario === "funded-cancel") {
        this.#statusStarted();
        await this.#statusGate;
      }
      await route.abort();
      return;
    }
    assert.equal(request.method(), "GET");
    this.#coreRequests.push(url.pathname);
    let body;
    if (url.pathname === "/status") {
      if (this.#scenario === "cancel") this.#statusStarted?.();
      if (this.#scenario === "cancel") await this.#statusGate;
      body =
        this.#scenario === "missing"
          ? {}
          : { status: this.#scenario === "syncing" ? "syncing" : "ok" };
    } else if (url.pathname === "/blocks") {
      body = { resultSet: this.#scenario === "empty-tip" ? [] : [{ height: 7 }] };
    } else {
      assert.equal(url.pathname, "/addresses/info");
      assert.deepEqual(url.searchParams.get("addresses")?.split(","), ADDRESSES);
      body = ADDRESSES.map((address) => ({
        address,
        balance: this.#scenario === "funded-cancel" ? "1" : "0",
        txCount: 0,
      }));
    }
    try {
      await route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } });
    } catch (cause) {
      // Cancellation may close the actual fetch before the delayed synthetic reply is released.
      if (this.#scenario !== "cancel") throw cause;
    }
  };

  async #scan(frame, scenario) {
    this.#scenario = scenario;
    this.#coreRequests = [];
    await frame.locator("#watch-only-keys").fill(KEY);
    await frame.locator("#start-recovery-scan").click();
    await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
    const core = frame.locator(".scan-section").filter({
      has: frame.getByRole("heading", { name: "Dash Core · exact public key", exact: true }),
    });
    await core.waitFor({ state: "visible" });
    return core;
  }

  async #frame() {
    const frame = this.#page
      .frames()
      .find((candidate) => candidate.parentFrame() === this.#page.mainFrame());
    assert.ok(frame, "The actual opaque input frame must exist");
    const source = frame.locator("#public-source-tab");
    if (await source.count()) await source.click();
    return frame;
  }

  /** Completed Core balances remain visible/exportable if cancellation stops the next component. */
  async fundedCancellation(batch = true) {
    this.#scenario = "funded-cancel";
    this.#coreRequests = [];
    const started = new Promise((resolve) => {
      this.#statusStarted = resolve;
    });
    this.#statusGate = new Promise((resolve) => {
      this.#releaseStatus = resolve;
    });
    await this.#context.route(HTTP, this.#route);
    try {
      const frame = await this.#frame();
      if (batch) await frame.locator("#request-concurrency").selectOption("1");
      await frame.locator("#watch-only-keys").fill(batch ? `${KEY}\n${KEY}` : KEY);
      await frame.locator("#start-recovery-scan").click();
      await started;
      assert.deepEqual(this.#coreRequests, ["/status", "/blocks", "/addresses/info"]);
      await frame.locator("#cancel-recovery-scan").click();
      this.#releaseStatus();
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      assert.equal(
        await frame.locator(".wallet-result").count(),
        1,
        "Cancellation must retain the returned partial report",
      );
      if (batch) {
        assert.equal(await frame.locator(".wallet-progress-row").count(), 2);
        assert.match(
          await frame.locator(".wallet-progress-row").nth(1).textContent(),
          /Cancelled/u,
        );
        assert.doesNotMatch(
          await frame.locator(".wallet-progress-row").nth(1).textContent(),
          /Queued|Waiting for a scan slot/u,
        );
      }
      await frame.locator('[data-component-group="core"]').click();
      assert.deepEqual(await frame.locator(".finding-head strong").allTextContents(), ADDRESSES);
      const download = this.#page.waitForEvent("download");
      await frame.locator("#export-recovery-json").click();
      const file = await download;
      const report = JSON.parse(readFileSync(await file.path(), "utf8"));
      const result = report.results.find(({ coinId }) => coinId === "dash");
      assert.ok(result);
      assert.deepEqual(
        result.sections.map(({ state }) => state),
        ["complete", "partial", "partial"],
      );
      const core = result.sections.find(({ id }) => id === "core");
      assert.deepEqual(
        core.findings.map(({ title }) => title),
        ADDRESSES,
      );
      for (const finding of core.findings) {
        assert.equal(finding.balanceAtomic, "1");
        assert.equal(finding.history.status, "unavailable");
        assert.equal(finding.history.totalReceivedAtomic, null);
        assert.match(finding.history.note, /cancelled/u);
      }
      assert.deepEqual(this.#coreRequests, ["/status", "/blocks", "/addresses/info"]);
      return {
        completedCoreRetainedAfterCancellation: true,
        unknownHistoryExported: true,
        queuedTargetsCancelled: batch,
      };
    } finally {
      this.#releaseStatus?.();
      await this.#context.unroute(HTTP, this.#route);
    }
  }

  /** No live provider, balance proof simulation or full seed scan is part of this control. */
  async run() {
    await this.#context.route(HTTP, this.#route);
    try {
      const frame = await this.#frame();
      // A compressed public key fits several coins: an edition with a coin choice is told Dash.
      if ((await frame.locator("#recovery-coin").count()) > 0)
        await frame.locator("#recovery-coin").selectOption("dash");
      await frame.locator("#recovery-network").selectOption("mainnet");
      for (const scenario of ["healthy", "missing", "syncing", "empty-tip"]) {
        const core = await this.#scan(frame, scenario);
        assert.equal(
          await core.locator(".section-state").textContent(),
          scenario === "healthy" ? "complete" : "failed",
        );
        assert.deepEqual(
          this.#coreRequests,
          scenario === "healthy"
            ? ["/status", "/blocks", "/addresses/info"]
            : scenario === "empty-tip"
              ? ["/status", "/blocks"]
              : ["/status"],
        );
        assert.match(
          await core.locator(".section-proof").textContent(),
          scenario === "healthy" ? /indexed Core height 7/u : /Not completed/u,
        );
        assert.match(
          await core.locator(".finding-empty").textContent(),
          scenario === "healthy" ? /No funded/u : /No authoritative findings/u,
        );
      }
      this.#scenario = "cancel";
      this.#coreRequests = [];
      const started = new Promise((resolve) => {
        this.#statusStarted = resolve;
      });
      this.#statusGate = new Promise((resolve) => {
        this.#releaseStatus = resolve;
      });
      await frame.locator("#watch-only-keys").fill(KEY);
      await frame.locator("#start-recovery-scan").click();
      await started;
      await frame.locator("#cancel-recovery-scan").click();
      this.#releaseStatus();
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      const states = [];
      for (const group of ["core", "platform", "identity"]) {
        await frame.locator(`[data-component-group="${group}"]`).click();
        states.push(await frame.locator(".section-state").textContent());
        assert.equal(await frame.locator(".finding-card").count(), 0);
        assert.match(
          await frame.locator(".finding-empty").textContent(),
          /No authoritative findings/u,
        );
      }
      assert.deepEqual(states, ["partial", "partial", "partial"]);
      assert.match(await frame.locator("#recovery-status").textContent(), /cancelled/u);
      assert.equal(await frame.locator(".finding-card").count(), 0);
      assert.deepEqual(this.#coreRequests, ["/status"]);
      return { healthyZero: true, refusedIndexes: 3, cancelledSections: states };
    } finally {
      this.#releaseStatus?.();
      await this.#context.unroute(HTTP, this.#route);
    }
  }
}
