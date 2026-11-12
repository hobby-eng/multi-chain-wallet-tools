import { DASH_ADDRESS_FAMILIES } from "@ckd/coins/dash/address-families.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import {
  BASE64_SIGNATURE,
  type MessageFormatText,
  type MessageSigningPolicy,
} from "./message-signing-policy.js";

const COMPACT: readonly MessageSigningFormat[] = Object.freeze(["dash-compact"] as const);
const COMPACT_TEXT: MessageFormatText = Object.freeze({
  label: "Dash Core compact P2PKH",
  output: BASE64_SIGNATURE,
  notes: [],
  compact: true,
});

/** Dash offers only its compact signature on the address families that own that capability. */
export class DashMessageSigningPolicy implements MessageSigningPolicy {
  /** The address family owns signing applicability; only the row's own address signs. */
  offer(resultId: string, addressKey: string): readonly MessageSigningFormat[] {
    return addressKey === "address" && DASH_ADDRESS_FAMILIES.signsCompact(resultId) ? COMPACT : [];
  }
  /** Unknown formats have no texts. */
  describe(format: unknown): MessageFormatText | undefined {
    return format === "dash-compact" ? COMPACT_TEXT : undefined;
  }
}

/** The stateless Dash policy used by both editions. */
export const DASH_MESSAGE_SIGNING_POLICY = new DashMessageSigningPolicy();
