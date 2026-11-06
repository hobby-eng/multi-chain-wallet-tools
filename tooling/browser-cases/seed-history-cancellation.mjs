import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// BIP39's published zero-entropy phrase; this exercises orchestration, not a derivation oracle.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const HTTP = /^https?:\/\//u;

/** Runs the real seed scanner, provider boundary and export while history is cancelled. */
export class SeedHistoryCancellationCase {
  #context;
  #page;
  #requests;
  #funded;

  constructor(context, page, requests) {
    this.#context = context;
    this.#page = page;
    this.#requests = requests;
  }

  #route = async (route) => {
    const request = route.request();
    this.#requests.push({ url: request.url(), body: request.postData() });
    assert.equal(request.url().includes(PHRASE), false);
    assert.equal(request.postData()?.includes(PHRASE) ?? false, false);
    const url = new URL(request.url());
    assert.equal(url.origin, "https://dashscan.pshenmic.dev");
    let body;
    if (url.pathname === "/status") body = { status: "ok" };
    else if (url.pathname === "/blocks") body = { resultSet: [{ height: 7 }] };
    else if (url.pathname === "/addresses/info") {
      const addresses = url.searchParams.get("addresses").split(",");
      this.#funded ??= addresses[0];
      body = addresses.map((address) => ({
        address,
        balance: address === this.#funded ? "1" : "0",
        txCount: address === this.#funded ? 1 : 0,
      }));
    } else {
      assert.equal(url.pathname, `/address/${this.#funded}`);
      body = {
        address: this.#funded,
        balance: "1",
        txCount: 1,
        received: "11",
        sent: "0",
        firstSeenBlockTimestamp: null,
        lastSeenBlockTimestamp: null,
      };
    }
    await route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } });
  };

  /** A batch may not derive its next seed after cancellation; completed balances stay exportable. */
  async run(batch) {
    const frame = this.#page
      .frames()
      .find((candidate) => candidate.parentFrame() === this.#page.mainFrame());
    assert.ok(frame);
    await this.#context.route(HTTP, this.#route);
    try {
      // Platform and Orchard are Dash's: an edition with a coin choice is told Dash.
      if ((await frame.locator("#recovery-coin").count()) > 0)
        await frame.locator("#recovery-coin").selectOption("dash");
      for (const selector of [
        "#scan-platform-addresses",
        "#scan-platform-identities",
        "#scan-shielded",
      ])
        await frame.locator(selector).uncheck();
      await frame.locator("#core-receive-count").fill("1");
      await frame.locator("#core-change-count").fill("0");
      if (batch) {
        await frame.locator('[data-input-mode="batch"]').click();
        await frame.locator("#batch-concurrency").selectOption("1");
        await frame.locator("#batch-mnemonics").fill(`${PHRASE}\n${PHRASE}`);
      } else await frame.locator("#single-mnemonic").fill(PHRASE);
      await frame.evaluate((phrase) => {
        const descriptor = Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encode");
        const probe = {
          copies: 0,
          afterCancel: 0,
          cancelled: false,
          observer: undefined,
          restore() {
            this.observer?.disconnect();
            Object.defineProperty(TextEncoder.prototype, "encode", descriptor);
          },
        };
        Object.defineProperty(TextEncoder.prototype, "encode", {
          ...descriptor,
          value(text) {
            if (text === phrase) {
              probe.copies += 1;
              if (probe.cancelled) probe.afterCancel += 1;
            }
            return descriptor.value.call(this, text);
          },
        });
        probe.observer = new MutationObserver(() => {
          if (
            !probe.cancelled &&
            document.getElementById("recovery-status").textContent.includes("Loading history")
          ) {
            probe.cancelled = true;
            document.getElementById("cancel-recovery-scan").click();
          }
        });
        probe.observer.observe(document.getElementById("recovery-status"), {
          childList: true,
          subtree: true,
          characterData: true,
        });
        window.__seedHistoryCancellation = probe;
      }, PHRASE);
      await frame.locator("#start-recovery-scan").click();
      await frame.waitForFunction(() => window.__seedHistoryCancellation.cancelled);
      assert.ok(await frame.evaluate(() => window.__seedHistoryCancellation.copies > 0));
      await frame.waitForFunction(() => !document.getElementById("start-recovery-scan").disabled);
      assert.equal(
        await frame.evaluate(() => window.__seedHistoryCancellation.afterCancel),
        0,
        "A cancelled batch must not copy or derive another seed",
      );
      assert.match(await frame.locator("#recovery-status").textContent(), /[Ss]can cancelled/u);
      assert.equal(await frame.locator(".wallet-result").count(), 1);
      const download = this.#page.waitForEvent("download");
      await frame.locator("#export-recovery-json").click();
      const file = await download;
      const report = JSON.parse(readFileSync(await file.path(), "utf8"));
      assert.equal(report.results.length, 1);
      const finding = report.results[0].sections.find(({ id }) => id === "core").findings[0];
      assert.equal(finding.title, this.#funded);
      assert.equal(finding.balanceAtomic, "1");
      assert.equal(finding.history.status, "complete");
      assert.equal(finding.history.totalReceivedAtomic, "11");
      return {
        mode: batch ? "batch" : "single",
        cancelled: true,
        completedBalanceExported: true,
        nextSeedCopies: 0,
      };
    } finally {
      await frame.evaluate(() => {
        window.__seedHistoryCancellation?.restore();
        delete window.__seedHistoryCancellation;
      });
      await this.#context.unroute(HTTP, this.#route);
    }
  }
}
