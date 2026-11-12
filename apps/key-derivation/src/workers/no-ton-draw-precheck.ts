// ton-draw-precheck.ts in a build that offers no such condition: the page never asks for it there,
// and the worker carries none of its code or words.
import type { DrawPrecheck } from "@ckd/core/bip39-wallet-check.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const ERRORS = new ErrorCatalog("wallet.wallet-check-draw", {
  absent: () => "This build offers no such check.",
});

/** Refuses: this build offers no such check. */
export function tonDrawPrecheck(): Promise<DrawPrecheck> {
  return Promise.reject(ERRORS.create("absent", []));
}
