import assert from "node:assert/strict";

const CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const CARD = "shaft pupil patient jewel";
const DAMAGED = CONTAINER.replace("tower", "?");
const INVALID = CONTAINER.replace("tower", "synthetic");

/** Delays only delivery of actual worker replies and observes call-through native encoding buffers. */
export class MhfePendingInputCase {
  #page;
  constructor(page) {
    this.#page = page;
  }

  /** Installs native-edge instrumentation after the real package's startup checks have passed. */
  async #observe(operation, inputs) {
    await this.#page.evaluate(
      ({ operation, inputs }) => {
        const NativeWorker = window.Worker;
        const descriptor = Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encode");
        const probe = {
          operation,
          inputs,
          buffers: [],
          deliveries: [],
          holding: true,
          live() {
            return this.buffers.filter(
              (bytes) => bytes.byteLength > 0 && bytes.some((byte) => byte !== 0),
            ).length;
          },
          release() {
            this.holding = false;
            for (const deliver of this.deliveries.splice(0)) deliver();
          },
          restore() {
            this.release();
            window.Worker = NativeWorker;
            Object.defineProperty(TextEncoder.prototype, "encode", descriptor);
          },
        };
        Object.defineProperty(TextEncoder.prototype, "encode", {
          ...descriptor,
          value(text) {
            const bytes = descriptor.value.call(this, text);
            if (probe.inputs.includes(text)) probe.buffers.push(bytes);
            return bytes;
          },
        });
        window.Worker = class extends NativeWorker {
          #operation;
          postMessage(message, transfer) {
            if (typeof message?.operation === "string") this.#operation = message.operation;
            return super.postMessage(message, transfer);
          }
          set onmessage(handler) {
            super.onmessage = (event) => {
              const deliver = () => {
                if (typeof handler === "function") handler.call(this, event);
              };
              if (
                probe.holding &&
                this.#operation === probe.operation &&
                (event.data?.type === "result" || event.data?.type === "error")
              )
                probe.deliveries.push(deliver);
              else deliver();
            };
          }
        };
        window.__mhfeInputProbe = probe;
      },
      { operation, inputs },
    );
  }

  async #held() {
    await this.#page.waitForFunction(() => window.__mhfeInputProbe.deliveries.length > 0);
    assert.ok(await this.#page.evaluate(() => window.__mhfeInputProbe.buffers.length >= 2));
    assert.ok(await this.#page.evaluate(() => window.__mhfeInputProbe.live() > 0));
  }

  /** The response stays withheld when retirement must already have wiped the managed host bytes. */
  async repairRetirement(action) {
    const page = this.#page;
    await page.locator('#mhfe-panel [aria-controls="mhfe-repair-panel"]').click();
    await page.locator("#mhfe-repair-container").fill(DAMAGED);
    await page.locator("#mhfe-repair-card").fill(CARD);
    await this.#observe("repairContainer", [DAMAGED, CARD]);
    try {
      await page.locator("#mhfe-repair-container-run").click();
      await this.#held();
      if (action === "edit") await page.locator("#mhfe-repair-card").fill(`${CARD} `);
      else if (action === "clear")
        // Clear belongs to the source panel; dispatch its native handler while the backup panel is open.
        await page.evaluate(() => document.getElementById("clear-all").click());
      else await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      assert.equal(await page.evaluate(() => window.__mhfeInputProbe.deliveries.length), 1);
      assert.equal(
        await page.evaluate(() => window.__mhfeInputProbe.live()),
        0,
        "Managed host input bytes must be wiped before the held worker response resolves",
      );
    } finally {
      await page.evaluate(() => {
        window.__mhfeInputProbe.restore();
        delete window.__mhfeInputProbe;
      });
    }
  }

  /** Cancellation of a prompt opening must roll its staged source back before the reply arrives. */
  async openingRollback() {
    const page = this.#page;
    await page.locator('#mhfe-panel [aria-controls="mhfe-restore-panel"]').click();
    await this.#observe("describeContainer", [INVALID]);
    try {
      // One native turn avoids a separate blur/change adapter request before the explicit operation.
      await page.evaluate((value) => {
        document.getElementById("mhfe-container").value = value;
        document.getElementById("mhfe-decrypt").click();
      }, INVALID);
      await this.#held();
      await page.locator("#mhfe-decrypt-stop").click();
      await page.waitForFunction(() => document.getElementById("mhfe-decrypt-stop").hidden);
      assert.equal(await page.evaluate(() => window.__mhfeInputProbe.deliveries.length), 1);
      assert.equal(
        await page.evaluate(() => window.__mhfeInputProbe.live()),
        0,
        "A cancelled opening must wipe its staged copy before the held worker response resolves",
      );
    } finally {
      await page.evaluate(() => {
        window.__mhfeInputProbe.restore();
        delete window.__mhfeInputProbe;
      });
    }
  }

  /** Reopening the prompt revokes an older quick repair without wiping the replacement source. */
  async markedReplacement() {
    const page = this.#page;
    await page.locator('#mhfe-panel [aria-controls="mhfe-restore-panel"]').click();
    await page.locator("#mhfe-container").fill(DAMAGED);
    await page.locator("#mhfe-decrypt").click();
    await page.locator("#mhfe-decrypt-marked").waitFor({ state: "visible" });
    await page.locator("#mhfe-decrypt-marked-card").fill(CARD);
    await this.#observe("repairContainer", [DAMAGED, CARD]);
    try {
      await page.locator("#mhfe-decrypt-marked-repair").click();
      await this.#held();
      const oldCount = await page.evaluate(() => window.__mhfeInputProbe.buffers.length);
      await page.locator("#mhfe-decrypt").click();
      await page.waitForFunction(
        (oldCount) =>
          window.__mhfeInputProbe.buffers.length >= oldCount + 2 &&
          document.getElementById("mhfe-decrypt-stop").hidden,
        oldCount,
      );
      const state = await page.evaluate((oldCount) => {
        const probe = window.__mhfeInputProbe;
        const live = (bytes) => bytes.byteLength > 0 && bytes.some((byte) => byte !== 0);
        return {
          held: probe.deliveries.length,
          oldLive: probe.buffers.slice(0, oldCount).filter(live).length,
          replacementLive: probe.buffers.slice(oldCount).filter(live).length,
        };
      }, oldCount);
      assert.equal(state.held, 1);
      assert.equal(
        state.oldLive,
        0,
        "Replacing the prompt must immediately retire the old repair inputs",
      );
      assert.equal(
        state.replacementLive,
        1,
        "The new prompt keeps its own separately owned source",
      );
      await page.evaluate(async () => {
        window.__mhfeInputProbe.release();
        // Let the actual native reply's promise callbacks publish or decline their result.
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(await page.locator("#mhfe-decrypt-marked-result").textContent(), "");
      assert.equal(await page.evaluate(() => window.__mhfeInputProbe.live()), 1);
    } finally {
      await page.evaluate(() => {
        window.__mhfeInputProbe.restore();
        delete window.__mhfeInputProbe;
      });
    }
  }
}
