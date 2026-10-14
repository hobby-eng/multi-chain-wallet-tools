// The secrets of one wallet scan, registered with the scan's own guard and with the session's, and
// the network gateway that refuses to send any of them. Every coin adapter opens its scan here, so
// that none can forget to register a secret or register it with only one of the two guards.
import type { RecoveryWatchOnlyInput } from "@ckd/recovery/watch-only/types.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { RecoveryConcurrencyLimiter } from "./concurrency.js";
import { RecoveryNetworkGateway } from "./network-gateway.js";
import type { RecoveryScanContext } from "./types.js";

export class ScanSecrets {
  readonly guard = new SecretEgressGuard();
  readonly #session: SecretEgressGuard | undefined;

  constructor(context: Pick<RecoveryScanContext, "sessionSecretGuard">) {
    this.#session = context.sessionSecretGuard;
  }

  /**
   * Registers a watch-only input that must not leave: an extended key reveals a whole branch of
   * addresses. A single public key or identity is asked about openly, so it is not registered.
   */
  watchOnly(input: RecoveryWatchOnlyInput, label: string): void {
    if (input.kind !== "public-key" && input.kind !== "identity")
      this.registerString(`${label} watch-only input`, input.value);
  }

  /** The gateway that checks every request against this scan's secrets. */
  gateway(
    context: Pick<RecoveryScanContext, "networkApi" | "networkLimiter">,
  ): RecoveryNetworkGateway {
    return new RecoveryNetworkGateway(
      this.guard,
      context.networkApi,
      context.networkLimiter ?? new RecoveryConcurrencyLimiter(),
    );
  }

  /** Forgets this scan's candidates; the session guard retains its export protection. */
  close(): void {
    this.guard.clear();
  }

  registerString(label: string, value: string): void {
    this.guard.registerString(label, value);
    this.#session?.registerString(label, value);
  }

  registerBytes(label: string, value: Uint8Array): void {
    this.guard.registerBytes(label, value);
    this.#session?.registerBytes(label, value);
  }
}
