// One published BIP38 vector through the real installer and KDF, with a passive DOM boundary.
import { afterEach, expect, it, vi } from "vitest";
import { installBip38Feature } from "../../../apps/psbt-inspector/src/bip38-feature.ts";
import { RecoveryTestPage } from "../../../apps/key-derivation/tests/fake-recovery-page.ts";

afterEach(() => vi.unstubAllGlobals());
it("keeps a newly typed password when an older decrypt finishes", async () => {
  const page = new RecoveryTestPage();
  page.getElementById = (id) => page.querySelector(`#${id}`);
  for (const id of ["bip38-chain", "bip38-network", "bip38-encrypted-key", "bip38-password", "toggle-bip38-password", "decrypt-bip38", "clear-bip38", "bip38-error", "bip38-progress", "bip38-results", "bip38-result-list", "toggle-bip38-result"]) page.add(id, "input");
  page.require("bip38-chain").value = "bitcoin";
  page.require("bip38-network").value = "mainnet";
  page.require("bip38-encrypted-key").value = "6PYNKZ1EAgYgmQfmNVamxyXVWHzK5s6DGhwP4J5o44cvXdoY7sRzhtpUeo";
  page.require("bip38-password").value = "TestingOneTwoThree";
  installBip38Feature();
  try {
    page.require("decrypt-bip38").dispatchEvent(new Event("click"));
    expect(page.require("decrypt-bip38").disabled).toBe(true);
    expect(page.require("bip38-password").disabled).toBe(false);
    page.require("bip38-password").value = "new synthetic password";
    page.require("bip38-password").dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(page.require("decrypt-bip38").disabled).toBe(false), { timeout: 5000, interval: 20 });
    expect(page.require("bip38-password").value).toBe("new synthetic password");
  } finally {
    page.require("clear-bip38").dispatchEvent(new Event("click"));
  }
}, 7000);
