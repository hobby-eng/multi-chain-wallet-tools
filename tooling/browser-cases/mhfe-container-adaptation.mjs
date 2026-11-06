import assert from "node:assert/strict";

// MHFE's public zero-12 container; no Argon2 operation is used by these reading controls.
const CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const INVALID = "SYNTHETIC_INVALID_PREVIEW_INPUT";
const TABS = {
  decrypt: {
    panel: "mhfe-restore-panel",
    field: "mhfe-container",
    length: "mhfe-decrypt-source-words",
  },
  check: { panel: "mhfe-check-panel", field: "mhfe-check-container", length: "mhfe-check-words" },
  rekey: { panel: "mhfe-rekey-panel", field: "mhfe-rekey-container", length: "mhfe-rekey-words" },
};

/** Observes actual SDK/WASM worker replies and managed host byte retirement during previews. */
export class MhfeContainerAdaptationCase {
  #page;
  constructor(page) {
    this.#page = page;
  }

  async #observe(holding) {
    await this.#page.evaluate(
      ({ holding, container }) => {
        const NativeWorker = window.Worker;
        const encoder = Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encode");
        const probe = {
          holding,
          buffers: [],
          deliveries: [],
          completed: 0,
          live() {
            return this.buffers.filter((bytes) => bytes.some((byte) => byte !== 0)).length;
          },
          release() {
            this.holding = false;
            for (const deliver of this.deliveries.splice(0)) deliver();
          },
          restore() {
            this.release();
            window.Worker = NativeWorker;
            Object.defineProperty(TextEncoder.prototype, "encode", encoder);
          },
        };
        Object.defineProperty(TextEncoder.prototype, "encode", {
          ...encoder,
          value(text) {
            const bytes = encoder.value.call(this, text);
            if (text === container) probe.buffers.push(bytes);
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
                if (
                  this.#operation === "describeContainer" &&
                  ["result", "error"].includes(event.data?.type)
                )
                  probe.completed += 1;
              };
              if (
                probe.holding &&
                this.#operation === "describeContainer" &&
                ["result", "error"].includes(event.data?.type)
              )
                probe.deliveries.push(deliver);
              else deliver();
            };
          }
        };
        window.__mhfeContainerPreview = probe;
      },
      { holding, container: CONTAINER },
    );
  }

  async #enter(prefix, value) {
    const tab = TABS[prefix];
    assert.ok(tab);
    await this.#page.locator(`#mhfe-panel [aria-controls="${tab.panel}"]`).click();
    await this.#page.evaluate(
      ({ field, value }) => {
        const input = document.getElementById(field);
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { field: tab.field, value },
    );
  }

  async #restore() {
    await this.#page.evaluate(() => {
      window.__mhfeContainerPreview.restore();
      delete window.__mhfeContainerPreview;
    });
  }

  /** Every failed preview is handled visibly, without echoing the concealed input. */
  async refusal(prefix) {
    await this.#observe(false);
    try {
      await this.#enter(prefix, INVALID);
      await this.#page.waitForFunction(() => window.__mhfeContainerPreview.completed > 0);
      await this.#page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      const text = await this.#page.locator(`#mhfe-${prefix}-status`).textContent();
      assert.notEqual(text, "", "The actual worker refusal must not be swallowed");
      assert.equal(text.includes(INVALID), false, "A preview error must not echo concealed input");
    } finally {
      await this.#restore();
    }
  }

  /** Managed input bytes retire before an actual held reply on edit, Clear, or pagehide. */
  async retirement(action) {
    await this.#observe(true);
    try {
      await this.#enter("decrypt", CONTAINER);
      await this.#page.waitForFunction(() => window.__mhfeContainerPreview.deliveries.length === 1);
      assert.ok(
        await this.#page.evaluate(() => window.__mhfeContainerPreview.live() > 0),
        "The pending preview needs an owned host input",
      );
      if (action === "operation")
        await this.#page.evaluate(() => {
          // Starting and immediately cancelling in one turn must never enter the Argon2 work.
          document.getElementById("mhfe-decrypt").click();
          document.getElementById("mhfe-decrypt-stop").click();
        });
      else if (action === "edit") await this.#page.locator("#mhfe-container").fill(CONTAINER + " ");
      else if (action === "clear")
        await this.#page.evaluate(() => document.getElementById("clear-all").click());
      else await this.#page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      assert.equal(await this.#page.evaluate(() => window.__mhfeContainerPreview.live()), 0);
      assert.equal(
        await this.#page.evaluate(() => window.__mhfeContainerPreview.deliveries.length),
        1,
      );
      await this.#page.evaluate(async () => {
        window.__mhfeContainerPreview.release();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(
        await this.#page.locator(`#${TABS.decrypt.length}`).getAttribute("data-read"),
        null,
      );
    } finally {
      await this.#restore();
    }
  }

  /** Real reads succeed in all three bindings; no KDF or recovered phrase is involved. */
  async healthy(prefix) {
    await this.#observe(false);
    try {
      await this.#enter(prefix, CONTAINER);
      await this.#page.waitForFunction(() => window.__mhfeContainerPreview.completed > 0);
      await this.#page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
      assert.notEqual(
        await this.#page.locator(`#${TABS[prefix].length}`).getAttribute("data-read"),
        null,
      );
      assert.equal(await this.#page.evaluate(() => window.__mhfeContainerPreview.live()), 0);
    } finally {
      await this.#restore();
    }
  }
}
