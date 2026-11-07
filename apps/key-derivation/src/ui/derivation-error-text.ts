import type { DerivationResultsError } from "@ckd/ui/derivation-results.js";
import type { DerivationStreamError } from "@ckd/coins/derivation-stream.js";
import type { DerivationSecretsError } from "@ckd/core/secrets.js";
import type { Bip39InputError } from "@ckd/core/bip39-input.js";
import { Bip39InputText } from "./bip39-input-text.js";
import type { RenderedSecretsError } from "./secrets.js";

type KnownCode =
  | DerivationResultsError["code"]
  | DerivationStreamError["code"]
  | DerivationSecretsError["code"]
  | Bip39InputError["code"]
  | RenderedSecretsError["code"];
const MESSAGES = {
  ...Bip39InputText.MESSAGES,
  "ui.secret.cleanup": "A private result could not be cleared normally. Close this wallet page.",
  "ui.secret.retired": "This private result is being replaced or cleared. Run the operation again.",
  "derivation.key.address": "The selected address no longer matches the requested derivation path.",
  "derivation.key.unavailable": "This derivation mode does not expose a compatible private key.",
  "derivation.key.material": "The derived private key could not be read in its expected form.",
  "derivation.result.text": "The derivation result contains an invalid private text field.",
  "derivation.result.retired": "This derivation result has already been cleared. Derive it again.",
  "derivation.result.property":
    "The derivation result could not release its private text normally.",
  "derivation.results.branch-missing":
    "The result branch state was lost during streamed derivation. Derive the wallet again.",
  "derivation.results.mutating":
    "The wallet results are being replaced or cleared. Derive the wallet again.",
  "derivation.stream.batch-size": "This derivation adapter has an invalid batch size.",
  "derivation.stream.batch": "The derivation adapter returned an inconsistent streamed batch.",
  "derivation.stream.active": "This derivation stream is already running.",
} satisfies Record<KnownCode, string>;

/** One page catalogue for shared result/stream refusal codes in both wallet workspaces. */
export class DerivationErrorText {
  /** Native cleanup faults never expose their supplied cause or interrupt other owners' cleanup. */
  static readonly CLEANUP_FAILURE =
    "The derivation worker or a wallet panel could not be released normally.";

  /**
   * Translate stable codes across transport; supplied diagnostics never enter the page. A protocol
   * may add the texts of its own input refusals (CoinAdapter.inputMessages).
   */
  static of(
    cause: unknown,
    fallback = "Derivation failed.",
    protocolMessages: Readonly<Record<string, string>> = {},
  ): string {
    try {
      const code =
        typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
      return (
        [...Object.entries(MESSAGES), ...Object.entries(protocolMessages)].find(
          ([candidate]) => candidate === code,
        )?.[1] ?? fallback
      );
    } catch {
      // Foreign errors can have throwing getters; handling a failure must remain input-free.
      return fallback;
    }
  }
}
