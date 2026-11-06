import { afterEach, describe, expect, it, vi } from "vitest";
import { installBip38Feature } from "../src/bip38-feature.js";
import { CompleteIdPage } from "../../../test/support/complete-id-page.js";

const setup = (): CompleteIdPage => {
  const page = new CompleteIdPage();
  page.require("bip38-chain").value = "bitcoin";
  page.require("bip38-network").value = "mainnet";
  // Intentionally malformed public input fails before scrypt but settles through the real async API.
  page.require("bip38-encrypted-key").value = "6Psynthetic";
  page.require("bip38-password").value = "synthetic original password";
  installBip38Feature();
  return page;
};
const settle = async (): Promise<void> => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};
afterEach(() => vi.unstubAllGlobals());

describe("Inspector BIP38 input revision ownership", () => {
  it("preserves a newly typed password when an earlier actual decryptor refusal settles", async () => {
    const page = setup();
    page.require("decrypt-bip38").click();
    page.require("bip38-password").value = "synthetic replacement password";
    page.require("bip38-password").dispatchEvent(new Event("input"));
    await settle();
    expect(page.require("bip38-password").value).toBe("synthetic replacement password");
    expect(page.require("bip38-result-list").children).toHaveLength(0);
    expect(page.require("bip38-results").hidden).toBe(true);
  });

  it.each([
    { id: "bip38-encrypted-key", value: "replacement", event: "input" },
    { id: "bip38-network", value: "testnet", event: "change" },
    { id: "bip38-chain", value: "dash", event: "change" },
  ])("retires pending output after $id changes", async ({ id, value, event }) => {
    const page = setup();
    page.require("decrypt-bip38").click();
    page.require(id).value = value;
    page.require(id).dispatchEvent(new Event(event));
    await settle();
    expect(page.require("bip38-result-list").children).toHaveLength(0);
    expect(page.require("bip38-results").hidden).toBe(true);
    expect(page.require("bip38-password").value).toBe("synthetic original password");
  });

  it("checks the literal current fields even when a host changes them without an event", async () => {
    const page = setup();
    page.require("decrypt-bip38").click();
    page.require("bip38-password").value = "synthetic replacement password";
    await settle();
    expect(page.require("bip38-password").value).toBe("synthetic replacement password");
    expect(page.require("bip38-result-list").children).toHaveLength(0);
  });

  it("retires pending work and clears secret fields when the page leaves", async () => {
    const page = setup();
    page.require("decrypt-bip38").click();
    page.window.dispatchEvent(new Event("pagehide"));
    await settle();
    expect(page.require("bip38-result-list").children).toHaveLength(0);
    expect(page.require("bip38-password").value).toBe("");
    expect(page.require("bip38-encrypted-key").value).toBe("");
  });

  it("still shows a current refusal without repeating arbitrary private input", async () => {
    const page = setup();
    page.require("decrypt-bip38").click();
    await settle();
    expect(page.require("bip38-result-list").children).toHaveLength(1);
    expect(page.require("bip38-password").value).toBe("");
    expect(page.require("bip38-result-list").textContent).not.toContain(
      "synthetic original password",
    );
  });
});
