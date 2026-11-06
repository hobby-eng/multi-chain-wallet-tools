import { afterEach, describe, expect, it, vi } from "vitest";
import { BIP38_PUBLIC_ANSWER, Bip38TestPage } from "./bip38-page.js";
import { decryptBip38Key } from "../src/bip38-decryptor.js";

let page: Bip38TestPage | undefined;
afterEach(() => {
  page?.dispose();
  vi.unstubAllGlobals();
});

// Actual cryptography and page owner: only the native DOM is supplied by the fixture.
describe("the Inspector's BIP38 results belong to the run that is still current", () => {
  it("decrypts Bitcoin regtest with its exact test-network address and WIF", async () => {
    // Independent Python secp256k1/scrypt + OpenSSL AES first reproduce the published
    // Satoshi vector; the same public scalar then supplies this test-network answer.
    await expect(
      decryptBip38Key(
        "6PYR63Hbut6L25z7t9mufV6wiiqcjfkV3AEKkyKCCNUZXoE6f8yoAc4JPq",
        BIP38_PUBLIC_ANSWER.password,
        "bitcoin",
        "regtest",
      ),
    ).resolves.toEqual({
      address: "mxHLtzxu57GYpRnHgZqwFUj2Tkcf5LPQg5",
      privateKeyHex: BIP38_PUBLIC_ANSWER.privateKeyHex,
      wif: "cMufy3gUPnhZfjzxmriBdAT4Hw7VD7ok6on1sn2a2wy7d41whF9n",
      compressed: true,
    });
  });

  it("shows a key decrypted in the current run", async () => {
    page = new Bip38TestPage();
    page.start();
    await page.feature.whenIdle();
    const fields = page.require("bip38-result-list").querySelectorAll("[data-bip38-secret]");
    expect(fields.map((field) => field.value)).toEqual([
      BIP38_PUBLIC_ANSWER.wif,
      BIP38_PUBLIC_ANSWER.privateKeyHex,
    ]);
    expect(page.secrets()).toBe(2);
    expect(page.require("toggle-bip38-result").disabled).toBe(false);
    expect(page.require("bip38-password").value).toBe("");
    expect(fields.every((field) => field.type === "password")).toBe(true);
    page.require("toggle-bip38-result").click();
    expect(fields.every((field) => field.type === "text")).toBe(true);
    page.window.dispatchEvent(new Event("blur"));
    expect(fields.every((field) => field.type === "password")).toBe(true);
    page.require("clear-bip38").click();
    expect(fields.every((field) => field.value === "")).toBe(true);
  });

  it("shows nothing of a key that arrives after Clear", async () => {
    page = new Bip38TestPage();
    page.start();
    page.require("clear-bip38").click();
    await page.feature.whenIdle();
    expect(page.secrets()).toBe(0);
    expect(page.require("toggle-bip38-result").disabled).toBe(true);
    expect(page.require("bip38-results").hidden).toBe(true);
  });

  it("shows no refusal of a key that arrives after Clear either", async () => {
    page = new Bip38TestPage();
    page.start("synthetic", "6Psynthetic");
    page.require("clear-bip38").click();
    await page.feature.whenIdle();
    expect(page.require("bip38-result-list").children).toHaveLength(0);
  });

  it("leaves a newer run's password and results alone when an older key arrives", async () => {
    page = new Bip38TestPage();
    page.start("synthetic old password");
    page.require("clear-bip38").click();
    page.start();
    expect(page.require("decrypt-bip38").textContent).toContain("preceding");
    expect(page.secrets()).toBe(0);
    expect(page.require("bip38-password").value).toBe(BIP38_PUBLIC_ANSWER.password);
    await page.feature.whenIdle();
    expect(page.secrets()).toBe(2);
    expect(page.require("bip38-password").value).toBe("");
  });

  it("does not capture changed literal fields when an earlier queued request reaches the KDF slot", async () => {
    page = new Bip38TestPage();
    page.start("synthetic old password");
    page.require("clear-bip38").click();
    page.start();
    page.require("bip38-password").value = "synthetic password typed after queueing";
    await page.feature.whenIdle();
    expect(page.require("bip38-password").value).toBe("synthetic password typed after queueing");
    expect(page.secrets()).toBe(0);
    expect(page.require("bip38-results").hidden).toBe(true);
  });
});
