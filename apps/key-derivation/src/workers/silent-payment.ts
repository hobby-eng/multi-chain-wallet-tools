// Worker composition keeps the established callback and result names; rules and key ownership live in the library.
import { SilentPaymentWallet } from "@ckd/coins/bitcoin/silent-payments.js";

/** BIP352 worker callback; its seed stays owned by the request scope. */
export const deriveSilentPayment = SilentPaymentWallet.derive;
export type { SilentPaymentResult } from "@ckd/coins/bitcoin/silent-payments.js";
