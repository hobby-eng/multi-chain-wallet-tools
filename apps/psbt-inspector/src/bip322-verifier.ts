import { init, type Network, type TimeConstraints } from 'btcutil-js';
import wasm from 'btcutil-js-wasm';
import type { PsbtNetwork } from './psbt.js';

export interface Bip322Verification {
  readonly valid: boolean;
  readonly timeConstraints?: TimeConstraints;
}

let initialization: ReturnType<typeof init> | null = null;

function btcutil(): ReturnType<typeof init> {
  initialization ??= init(Uint8Array.from(wasm).buffer);
  return initialization;
}

export async function verifyBip322Message(
  message: string,
  address: string,
  signature: string,
  network: PsbtNetwork,
): Promise<Bip322Verification> {
  const api = await btcutil();
  return api.bip322.verifyMessage(message, address.trim(), signature.trim(), network as Network);
}
