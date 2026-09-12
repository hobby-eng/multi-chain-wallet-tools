import { Transaction } from '@scure/btc-signer';
import { init, type Network } from 'btcutil-js';
import wasm from 'btcutil-js-wasm';
import { hexToBytes, wipe } from '@ckd/core/crypto.js';
import type { NetworkName } from '@ckd/core/types.js';
import type { CompactMessageSignature } from '@ckd/core/compact-message.js';

export type Bip322SigningMode = 'legacy-p2pkh' | 'nested-segwit' | 'native-segwit' | 'taproot';

let initialization: ReturnType<typeof init> | null = null;

function btcutil(): ReturnType<typeof init> {
  initialization ??= init(Uint8Array.from(wasm).buffer);
  return initialization;
}

function decodeBase64(value: string): Uint8Array {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function signBip322Message(
  privateKeyHex: string,
  address: string,
  message: string,
  network: NetworkName,
  mode: Bip322SigningMode,
  scriptPubKeyHex: string,
  redeemScriptHex?: string,
  internalPublicKeyHex?: string,
): Promise<CompactMessageSignature> {
  if (message.length === 0) throw new Error('Enter a message to sign.');
  const privateKey = hexToBytes(privateKeyHex);
  try {
    const api = await btcutil();
    const scriptPubKey = hexToBytes(scriptPubKeyHex);
    const full = mode === 'legacy-p2pkh' || mode === 'nested-segwit';
    const psbt = full
      ? await api.bip322.buildToSignPacketFull(message, scriptPubKey, 2, 0, 0)
      : await api.bip322.buildToSignPacketSimple(message, scriptPubKey);
    const transaction = Transaction.fromPSBT(decodeBase64(psbt));
    if (mode === 'nested-segwit') {
      if (redeemScriptHex === undefined) throw new Error('Nested SegWit message signing requires the P2WPKH redeem script.');
      transaction.updateInput(0, { redeemScript: hexToBytes(redeemScriptHex) });
    } else if (mode === 'taproot') {
      if (internalPublicKeyHex === undefined) throw new Error('Taproot message signing requires the internal x-only public key.');
      transaction.updateInput(0, { tapInternalKey: hexToBytes(internalPublicKeyHex) });
    }
    if (!transaction.signIdx(privateKey, 0)) throw new Error('The selected private key could not sign the BIP-322 transaction.');
    transaction.finalizeIdx(0);
    const signature = full
      ? `ful${encodeBase64(transaction.extract())}`
      : `smp${encodeBase64(await api.bip322.serializeTxWitness(transaction.getInput(0).finalScriptWitness ?? []))}`;
    const verification = await api.bip322.verifyMessage(message, address, signature, network as Network);
    if (!verification.valid) throw new Error('The generated BIP-322 signature did not verify against the selected address.');
    return {
      signature,
      format: full ? 'BIP-322 full' : 'BIP-322 simple',
      verified: true,
    };
  } finally {
    wipe(privateKey);
  }
}
