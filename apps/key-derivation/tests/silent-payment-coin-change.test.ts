import { afterEach, expect, it, vi } from "vitest";
import { installControllerFixture, type Deferred } from "./fake-deriver-controller.js";
import { RecoveryTestPage, settlePromises } from "./fake-recovery-page.js";
import type { SilentPaymentResult } from "../src/workers/silent-payment.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

/** A synthetic Silent Payments result: placeholder texts, no key of any wallet. */
const RESULT: SilentPaymentResult = {
  account: 0,
  scanPath: "m/352'/0'/0'/1'/0",
  spendPath: "m/352'/0'/0'/0'/0",
  scanPublicKey: "synthetic scan public key",
  spendPublicKey: "synthetic spend public key",
  address: "sp1synthetic",
  changeAddress: "sp1syntheticchange",
  labeledAddresses: [],
};

/** The original wallet under Bitcoin with Silent Payments built in, its tab opened. */
async function openSilentPayments() {
  const page = new RecoveryTestPage();
  const pending: Deferred<SilentPaymentResult>[] = [];
  const main = installControllerFixture(
    page,
    { otherPhrase: PHRASE, seedBytes: 64, seedMarker: 1, otherSeedMarker: 2 },
    pending,
    true,
  );
  main.viewElements.mnemonic!.value = PHRASE;
  await settlePromises();
  page.require("silent-payment-tab").click();
  await settlePromises();
  expect(main.deriveSilentPayment).toHaveBeenCalledOnce();
  const chooseCoin = (family: string) => {
    main.view.controls.coin.value = family;
    main.view.controls.coin.dispatchEvent(new Event("change"));
  };
  const shown = () => [
    page.require("silent-payment-result").hidden,
    page.require("silent-payment-address").textContent,
  ];
  return { pending, chooseCoin, shown };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("drops a shown Bitcoin Silent Payments result when a coin without them is chosen", async () => {
  const f = await openSilentPayments();
  f.pending[0]?.resolve(RESULT);
  await settlePromises();
  expect(f.shown()).toEqual([false, "sp1synthetic"]);
  f.chooseCoin("other");
  expect(f.shown()).toEqual([true, ""]);
});

it("revokes a running Silent Payments derivation when a coin without them is chosen", async () => {
  const f = await openSilentPayments();
  f.chooseCoin("other");
  f.pending[0]?.resolve(RESULT);
  await settlePromises();
  expect(f.shown()).toEqual([true, ""]);
});

it("keeps Silent Payments work under another variant of Bitcoin", async () => {
  const f = await openSilentPayments();
  f.pending[0]?.resolve(RESULT);
  await settlePromises();
  f.chooseCoin("bitcoin");
  expect(f.shown()).toEqual([false, "sp1synthetic"]);
});
