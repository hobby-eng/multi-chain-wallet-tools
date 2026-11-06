import { afterEach, expect, it, vi } from "vitest";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";

function fixture() {
  const native = new DeriverViewFixture();
  let reads = 0;
  const result: DerivationResult = {
    id: "bitcoin-legacy",
    title: "Synthetic public fixture",
    networkLabel: "mainnet",
    pathTemplate: "m/i",
    summary: [],
    basicSummary: [],
    notices: [],
    rows: [
      {
        index: 0,
        path: "m/0",
        title: "Synthetic row",
        advanced: [],
        basic: [
          {
            key: "address",
            label: "Address",
            secret: false,
            get value() {
              reads += 1;
              return "synthetic public address";
            },
          },
          {
            key: "privateKey",
            label: "Private key",
            secret: true,
            get value() {
              reads += 1;
              return "synthetic private fixture";
            },
          },
        ],
      },
    ],
  };
  const addresses = native.page.add("fixture-address-copy", "button");
  addresses.dataset.bulk = "addresses";
  const privateKeys = native.page.add("fixture-private-copy", "button");
  privateKeys.dataset.bulk = "privateKeys";
  const unknown = native.page.add("fixture-unknown-copy", "button");
  unknown.dataset.bulk = "synthetic unknown action";
  const update = (revealed: boolean, selected: ReadonlySet<number> = new Set([0])) =>
    native.view.updateBulkActions(
      result,
      selected,
      getCoinAdapter("bitcoin-legacy"),
      "basic",
      revealed,
    );
  return {
    view: native.view,
    page: native.page,
    addresses,
    privateKeys,
    unknown,
    update,
    reads: () => reads,
  };
}

afterEach(() => vi.unstubAllGlobals());

it("uses public/private field roles without reading values while updating native export controls", () => {
  const setup = fixture();
  setup.update(false);
  expect(setup.addresses.disabled).toBe(false);
  expect(setup.privateKeys.disabled).toBe(true);
  expect(setup.unknown.disabled).toBe(true);
  expect(setup.view.errorRoot.textContent).toBe("Choose a supported result export action.");
  setup.update(true);
  expect(setup.privateKeys.disabled).toBe(false);
  setup.update(true, new Set());
  expect(setup.addresses.disabled).toBe(true);
  expect(setup.privateKeys.disabled).toBe(true);
  expect(setup.reads()).toBe(0);
});

it("keeps a native action untrusted until the export owner admits it", () => {
  const setup = fixture();
  const action = setup.view.documentActionFrom(setup.unknown);
  expect(action?.kind).toBe("bulk");
  expect(action).toHaveProperty("action", "synthetic unknown action");
  expect(setup.reads()).toBe(0);
});

it("keeps rendering methods bound when a host borrows a callback", () => {
  const { view } = fixture();
  const showStatus = view.showStatus;
  showStatus("Synthetic native status");
  expect(view.statusRoot.hidden).toBe(false);
  expect(view.statusRoot.textContent).toBe("Synthetic native status");
  const showError = view.showError;
  showError("Synthetic native refusal");
  expect(view.statusRoot.hidden).toBe(true);
  expect(view.errorRoot.textContent).toBe("Synthetic native refusal");
});
