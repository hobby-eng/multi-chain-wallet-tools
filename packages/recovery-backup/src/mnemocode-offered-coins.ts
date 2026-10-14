// The coins of MnemoCode that the Deriver's wallet questions offer as "an address of another coin",
// with their known answers. The full build, with every coin of the Deriver, offers all of
// MnemoCode's (core/coins.ts). A build with fewer coins gets a generated list of its own coins in
// place of this module (tooling/key-derivation-composition.mjs), as the owner chose on 2026-10-07,
// so that it offers and checks no coin it leaves out.
import { COINS } from "../../recovery-mnemocode/source/core/coins.js";
import { COIN_ADDRESS_SELF_TEST } from "../../recovery-mnemocode/source/core/coins-self-test.js";
import type { Coin } from "../../recovery-mnemocode/source/core/coins/coin.js";
import type { SelfTestFeature } from "../../recovery-mnemocode/source/core/self-test-check.js";

export const OFFERED_COINS: readonly Coin[] = COINS;
/** The known answers of the offered coins' addresses. */
export const OFFERED_COIN_CHECKS: readonly SelfTestFeature[] = [COIN_ADDRESS_SELF_TEST];
