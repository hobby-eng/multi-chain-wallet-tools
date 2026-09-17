import { decodeScript } from './script.js';
import { analyzeSighash } from './signing-commitments.js';
import type { PsbtChain, PsbtNetwork } from './psbt.js';

interface PreviousScriptSigDetails {
  readonly signature: string | null;
  readonly signatureHash: string | null;
  readonly publicKey: string | null;
  readonly asm: string;
  readonly pushes: readonly string[];
  readonly raw: string;
}

interface OpReturnDetails {
  readonly payloadHex: string;
  readonly payloadSize: number;
  readonly pushCount: number;
}

export function describePreviousScriptSig(
  scriptSig: string,
  chain: PsbtChain,
  network: PsbtNetwork,
): PreviousScriptSigDetails {
  if (scriptSig.length === 0)
    return { signature: null, signatureHash: null, publicKey: null, asm: 'Empty', pushes: [], raw: '' };
  let decoded;
  try {
    decoded = decodeScript(scriptSig, chain, network, 'spending');
  } catch (error) {
    return {
      signature: null,
      signatureHash: null,
      publicKey: null,
      pushes: [],
      raw: scriptSig,
      asm: `Unable to decode scriptSig: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const pushes = decoded.operations.flatMap(({ data }) => (data === null ? [] : [data]));
  const signature = decoded.operations.length === 2 ? (decoded.operations[0]?.data ?? null) : null;
  const publicKey =
    decoded.operations.length === 2 &&
    /^(?:02|03)[0-9a-f]{64}$|^04[0-9a-f]{128}$/u.test(decoded.operations[1]?.data ?? '')
      ? decoded.operations[1]!.data
      : null;
  const standardP2pkh = signature !== null && publicKey !== null && /^30[0-9a-f]{14,142}$/u.test(signature);
  const sighashByte = standardP2pkh ? Number.parseInt(signature.slice(-2), 16) : null;
  return {
    signature: standardP2pkh ? signature : null,
    signatureHash: sighashByte === null ? null : analyzeSighash(sighashByte, 'legacy').label,
    publicKey: standardP2pkh ? publicKey : null,
    asm: decoded.asm,
    pushes,
    raw: scriptSig,
  };
}

export function describeOpReturn(script: Uint8Array, chain: PsbtChain, network: PsbtNetwork): OpReturnDetails | null {
  let decoded;
  try {
    decoded = decodeScript(
      Array.from(script, (value) => value.toString(16).padStart(2, '0')).join(''),
      chain,
      network,
      'script-pubkey',
    );
  } catch {
    return null;
  }
  if (decoded.operations[0]?.opcode !== 0x6a) return null;
  const payloadOperations = decoded.operations.slice(1);
  if (payloadOperations.some(({ data }) => data === null)) return null;
  const payloads = payloadOperations.map(({ data }) => data ?? '');
  return {
    payloadHex: payloads.join(''),
    payloadSize: payloads.reduce((total, payload) => total + payload.length / 2, 0),
    pushCount: payloads.length,
  };
}
