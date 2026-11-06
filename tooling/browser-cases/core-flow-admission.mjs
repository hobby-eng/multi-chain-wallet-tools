import assert from "node:assert/strict";
import { DashScanCoreFixture } from "../../test/support/dashscan-core-fixture.ts";

/** Runs the real Core query against synthetic HTTP; no live provider is contacted. */
export class CoreFlowAdmissionCase {
  #fixture = new DashScanCoreFixture();
  #page;

  constructor(page) {
    this.#page = page;
  }

  /** Exact zero stays an amount, while malformed confirmed/pending history fails before export. */
  async run() {
    const page = this.#page;
    const fixture = this.#fixture;
    const intercepted = [];
    const handle = async (route) => {
      const request = route.request();
      assert.equal(request.method(), "GET");
      assert.equal(new URL(request.url()).origin, "https://dashscan.pshenmic.dev");
      assert.equal(request.postData(), null);
      intercepted.push(request.url());
      const response = await fixture.fetch(request.url());
      await route.fulfill({
        status: response.status,
        body: await response.text(),
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
      });
    };
    await page.route(/^https?:\/\//u, handle);
    try {
      if (await page.locator('#viewer-coin option[value="dash"]').count())
        await page.locator("#viewer-coin").selectOption("dash");
      await page.locator('[data-detection-mode="advanced"]').click();
      await page.locator('[data-viewer-mode="core"]').click();
      await page.locator("#viewer-network").selectOption("mainnet");
      await page.locator("#full-viewing-key").fill(DashScanCoreFixture.address);
      await page.locator("#scan-button").click();
      await page.locator("#viewer-results").waitFor({ state: "visible" });
      assert.match(await page.locator("#viewer-activity").innerText(), /Received/u);
      assert.match(await page.locator("#viewer-activity").innerText(), /\+0\.000008 DASH/u);
      assert.equal(await page.locator("#viewer-export-json").isEnabled(), true);

      fixture.outputs[0].value = 0;
      await page.locator("#scan-button").click();
      await page.waitForFunction(() =>
        document.getElementById("viewer-activity").textContent.includes("Sent / spent"),
      );
      assert.match(await page.locator("#viewer-activity").innerText(), /-0\.000002 DASH/u);
      for (const pending of [false, true]) {
        if (pending) fixture.pending();
        fixture.outputs[0].value = "bad";
        await page.locator("#scan-button").click();
        await page.locator("#viewer-error").waitFor({ state: "visible" });
        assert.match(
          await page.locator("#viewer-error").innerText(),
          /invalid or missing transaction amount/u,
        );
        assert.equal(await page.locator("#viewer-results").isVisible(), false);
        assert.equal(await page.locator("#viewer-activity").innerText(), "");
        for (const format of ["csv", "json", "xlsx"])
          assert.equal(await page.locator(`#viewer-export-${format}`).isDisabled(), true);
      }
      assert.equal(intercepted.length, 16);
      assert.equal(
        intercepted.some((url) => url.includes("Xother")),
        false,
      );
      return {
        exactFlow: true,
        exactZero: true,
        malformedConfirmedRefused: true,
        malformedPendingRefused: true,
        exportDisabledOnFailure: true,
        syntheticGetRequests: intercepted.length,
      };
    } finally {
      await page.unroute(/^https?:\/\//u, handle);
    }
  }
}
