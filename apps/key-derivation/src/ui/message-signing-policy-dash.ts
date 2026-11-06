import { DASH_ADDRESS_FAMILIES } from "@ckd/coins/dash/address-families.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import type { MessageSigningPolicy } from "./message-signing-policy.js";

/** Dash offers only its compact signature on the address families that own that capability. */
export class DashMessageSigningPolicy implements MessageSigningPolicy {
  /** The address family owns signing applicability. */
  format(resultId: string): MessageSigningFormat | null {
    return DASH_ADDRESS_FAMILIES.signsCompact(resultId) ? "dash-compact" : null;
  }
  /** Unknown formats have no label. */
  label(format: unknown): string {
    return format === "dash-compact" ? "Dash Core compact P2PKH" : "";
  }
  /** There is no alternate Dash message-signing format. */
  allowsLegacyChoice(): boolean {
    return false;
  }
  /** Refuses an arbitrary selector value without coercion. */
  choose(resultId: string, selection: unknown): MessageSigningFormat | null {
    const format = this.format(resultId);
    return format !== null && selection === format ? format : null;
  }
}

/** The stateless Dash policy used by both editions. */
export const DASH_MESSAGE_SIGNING_POLICY = new DashMessageSigningPolicy();
