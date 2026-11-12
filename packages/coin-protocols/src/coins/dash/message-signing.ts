// Dash's message signing: Dash Core's compact signature of P2PKH addresses.
import {
  signDashCompactP2pkhMessage,
  verifyDashCompactP2pkhMessage,
} from "@ckd/core/compact-message-dash.js";
import type { CoinMessageSigning, MessageSigningRequest } from "../message-signing.js";

/** Dash's one format, Dash Core's signmessage. */
export const DASH_MESSAGE_SIGNING: CoinMessageSigning = Object.freeze({
  formats: Object.freeze(["dash-compact"]),
  sign: (privateKey: Uint8Array, request: MessageSigningRequest) =>
    signDashCompactP2pkhMessage(privateKey, request.address, request.message, request.network),
  verify: (request: MessageSigningRequest, signature: string) =>
    verifyDashCompactP2pkhMessage(request.address, request.message, signature, request.network),
});
