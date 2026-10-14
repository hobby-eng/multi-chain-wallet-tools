// Actual main controller and Silent Payments feature, with deferred transports and a fake view.
// Published BIP39 phrases identify arguments only. Seed markers and address labels are synthetic.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DerivationCancelledError } from "../src/workers/derive-client.js";
import type { SilentPaymentResult } from "../src/workers/silent-payment.js";
import { RecoveryTestPage, edit, settlePromises } from "./fake-recovery-page.js";
import { installControllerFixture, type Deferred } from "./fake-deriver-controller.js";

const fixture = vi.hoisted(() => ({
  phrase:
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  otherPhrase: "legal winner thank year wave sausage worth useful legal winner thank yellow",
  passphrase: "TREZOR",
  entropyBytes: 16,
  seedBytes: 64,
  seedMarker: 7,
  otherSeedMarker: 8,
}));
const forbiddenCrypto = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("Lifecycle tests forbid cryptographic execution.");
  }),
);
vi.mock("@ckd/core/bip39.js", () => ({
  assertValidMnemonic: (text: string) => text,
  englishMnemonicToEntropy: () => new Uint8Array(fixture.entropyBytes),
  diagnoseMnemonic: (text: string) => ({
    normalized: text,
    wordCount: 0,
    wordCountValid: false,
    allWordsKnown: false,
    checksumValid: false,
    entropyBits: null,
    checksumBits: null,
    unknownWords: [],
    words: [],
    construction: null,
  }),
  mnemonicToSeed: forbiddenCrypto,
  generateMnemonic: forbiddenCrypto,
  masterFingerprintFromSeed: forbiddenCrypto,
}));
vi.mock("@ckd/core/secure-random.js", () => ({
  checkSecureRandom: () => undefined,
  secureRandomBytes: forbiddenCrypto,
  fillSecureRandom: forbiddenCrypto,
}));

const pendingDerivations: Deferred<SilentPaymentResult>[] = [];
const silentOutcome: SilentPaymentResult = {
  account: 0,
  address: "synthetic-original-address",
  changeAddress: "synthetic-original-change",
  scanPath: "synthetic-scan-path",
  spendPath: "synthetic-spend-path",
  scanPublicKey: "synthetic-scan-public-key",
  spendPublicKey: "synthetic-spend-public-key",
  labeledAddresses: [],
};

function mainHarness(page = new RecoveryTestPage(), withSilentPayments = true) {
  return installControllerFixture(page, fixture, pendingDerivations, withSilentPayments);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pendingDerivations.length = 0;
});

afterEach(async () => {
  for (const pending of pendingDerivations) pending.reject(new DerivationCancelledError());
  await settlePromises();
  expect(forbiddenCrypto).not.toHaveBeenCalled();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function start() {
  const harness = mainHarness();
  await settlePromises();
  expect(harness.view.showCryptoSelfTestPassed).toHaveBeenCalledOnce();
  harness.viewElements.mnemonic!.value = fixture.phrase;
  harness.page.require("silent-payment-tab").click();
  expect(harness.deriveSilentPayment).toHaveBeenCalledOnce();
  expect(harness.dependencies.mnemonicToSeed).toHaveBeenLastCalledWith(fixture.phrase, "");
  return harness;
}

async function expectFresh(
  harness: Awaited<ReturnType<typeof start>>,
  passphrase = fixture.passphrase,
) {
  edit(harness.viewElements.mnemonic!, fixture.otherPhrase);
  edit(harness.viewElements.passphrase!, passphrase);
  harness.page.require("derive-silent-payment").click();
  expect(harness.dependencies.mnemonicToSeed).toHaveBeenLastCalledWith(
    fixture.otherPhrase,
    passphrase,
  );
  const seed = harness.deriveSilentPayment.mock.lastCall![0];
  expect([...seed]).toEqual(Array<number>(fixture.seedBytes).fill(fixture.otherSeedMarker));
  pendingDerivations.at(-1)!.resolve({ ...silentOutcome, address: "synthetic-current-address" });
  await settlePromises();
  expect(harness.page.require("silent-payment-result").hidden).toBe(false);
  expect(harness.page.require("silent-payment-address").textContent).toBe(
    "synthetic-current-address",
  );
  expect([...seed]).toEqual(Array<number>(fixture.seedBytes).fill(0));
}

describe("AUD-028-API008 parent wallet invalidation", () => {
  for (const field of ["mnemonic", "passphrase"] as const) {
    it(`hides completed output immediately on a parent ${field} edit, including empty input`, async () => {
      const harness = await start();
      pendingDerivations[0]!.resolve(silentOutcome);
      await settlePromises();
      expect(harness.page.require("silent-payment-result").hidden).toBe(false);
      await expectFresh(harness);
      edit(harness.viewElements[field]!, "");
      expect(harness.page.require("silent-payment-result").hidden).toBe(true);
      expect(harness.page.require("silent-payment-address").textContent).toBe("");
    });

    it(`drops a late reply after a parent ${field} edit before debounce`, async () => {
      const harness = await start();
      edit(harness.viewElements[field]!, field === "mnemonic" ? "" : fixture.passphrase);
      pendingDerivations[0]!.resolve(silentOutcome);
      await settlePromises();
      expect(harness.deriveSilentPayment).toHaveBeenCalledOnce();
      expect(harness.page.require("silent-payment-result").hidden).toBe(true);
      await expectFresh(harness);
    });
  }

  for (const pending of [false, true])
    it(`Generate revokes ${pending ? "pending" : "completed"} output without an input event`, async () => {
      const harness = await start();
      if (!pending) {
        pendingDerivations[0]!.resolve(silentOutcome);
        await settlePromises();
      }
      harness.viewElements.generate12Button!.click();
      await settlePromises();
      expect(harness.viewElements.mnemonic!.value).toBe(fixture.otherPhrase);
      if (pending) {
        pendingDerivations[0]!.resolve(silentOutcome);
        await settlePromises();
      }
      expect(harness.page.require("silent-payment-result").hidden).toBe(true);
      await expectFresh(harness, "");
    });

  for (const [id, value, type] of [
    ["silent-payment-network", "testnet", "change"],
    ["silent-payment-account", "1", "input"],
    ["silent-payment-labels", "1, 2", "input"],
  ])
    it(`revokes a pending feature request on ${id} edits`, async () => {
      const harness = await start();
      edit(harness.page.require(id!), value!, type!);
      pendingDerivations[0]!.resolve(silentOutcome);
      await settlePromises();
      expect(harness.page.require("silent-payment-result").hidden).toBe(true);
      harness.page.require("derive-silent-payment").click();
      expect(harness.deriveSilentPayment).toHaveBeenCalledTimes(2);
      pendingDerivations[1]!.resolve(silentOutcome);
      await settlePromises();
      expect(harness.page.require("silent-payment-result").hidden).toBe(false);
    });

  it("does not republish an earlier request after the new labels are refused", async () => {
    const harness = await start();
    edit(harness.page.require("silent-payment-labels"), "not a label");
    harness.page.require("derive-silent-payment").click();
    expect(harness.page.require("silent-payment-error").hidden).toBe(false);
    pendingDerivations[0]!.resolve(silentOutcome);
    await settlePromises();
    expect(harness.page.require("silent-payment-result").hidden).toBe(true);
    expect(harness.page.require("silent-payment-error").hidden).toBe(false);
  });
});
