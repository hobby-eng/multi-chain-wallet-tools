// BIP85's published application vectors (bip-0085.mediawiki, "Test vectors"), checked at startup
// before the page derives any child: the 12-word BIP39, WIF, XPRV and 64-byte HEX applications of
// the specification's root key. The 12-word phrase is checked by its entropy, as the specification
// gives it: the worker holds no word list (the page checks BIP39 itself). Public test data only.
import {
  deriveBip85Bip39,
  deriveBip85Hex,
  deriveBip85Wif,
  deriveBip85Xprv,
} from "@ckd/core/bip85.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { expectEqual, now } from "../../../../packages/verification/src/helpers.js";

/** The specification's root key of every application vector. */
const ROOT =
  "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb";

export function runBip85SelfTest(): CryptoSelfTestReport {
  const started = now();
  const words = deriveBip85Bip39(ROOT, 12, 0);
  expectEqual("BIP85 BIP39 path", words.path, "m/83696968'/39'/0'/12'/0'");
  // The entropy of "girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose".
  expectEqual("BIP85 BIP39 entropy", words.entropyHex, "6250b68daf746d12a24d58b4787a714b");
  expectEqual(
    "BIP85 WIF",
    deriveBip85Wif(ROOT, 0).wif,
    "Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhp",
  );
  expectEqual(
    "BIP85 XPRV",
    deriveBip85Xprv(ROOT, 0).xprv,
    "xprv9s21ZrQH143K2srSbCSg4m4kLvPMzcWydgmKEnMmoZUurYuBuYG46c6P71UGXMzmriLzCCBvKQWBUv3vPB3m1SATMhp3uEjXHJ42jFg7myX",
  );
  expectEqual(
    "BIP85 HEX",
    deriveBip85Hex(ROOT, 64, 0).entropyHex,
    "492db4698cf3b73a5a24998aa3e9d7fa96275d85724a91e71aa2d645442f878555d078fd1f1f67e368976f04137b1f7a0d19232136ca50c44614af72b5582a5c",
  );
  return {
    passed: true,
    checks: ["BIP85 BIP39 / WIF / XPRV / HEX"],
    durationMs: Math.round(now() - started),
  };
}
