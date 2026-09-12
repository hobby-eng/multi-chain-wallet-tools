import type { TaprootScriptTree } from '@scure/btc-signer/payment.js';
import { materializeDescriptorKey, validateDescriptorPublicKey } from './descriptor-key.js';
import { compilePolicyMiniscript } from './miniscript-engine.js';
import { HDKey, type Versions } from '@scure/bip32';
import { bech32m } from '@scure/base';
import { NETWORK, TEST_NETWORK, p2tr } from '@scure/btc-signer';
import { keyAggregate, sortKeys } from '@scure/btc-signer/musig2.js';
import { bytesToHex, hexToBytes, secp256k1 } from '@ckd/core/crypto.js';
import type { PsbtNetwork } from './psbt.js';

export interface MusigKeyAnalysis {
  readonly participantCount: number;
  readonly sortedParticipantKeys: readonly string[];
  readonly aggregateCompressedKey: string;
  readonly aggregateXOnlyKey: string;
  readonly syntheticXpub: string | null;
  readonly derivation: string;
}

export interface MusigDescriptorAnalysis {
  readonly keys: readonly MusigKeyAnalysis[];
  readonly outputScript: string | null;
  readonly address: string | null;
}

const SYNTHETIC_CHAIN_CODE = hexToBytes('868087ca02a6f974c4598924c36b57762d32cb45717167e300622c7167e38965');
const MAINNET_VERSIONS: Versions = { private: 0x0488ade4, public: 0x0488b21e };
const TESTNET_VERSIONS: Versions = { private: 0x04358394, public: 0x043587cf };

function matchingClose(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('MuSig2 expression has an unclosed parenthesis.');
}

function splitTopLevel(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let angle = 0;
  let curly = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (character === '<') angle += 1;
    else if (character === '>') angle -= 1;
    else if (character === ',' && round === 0 && square === 0 && angle === 0 && curly === 0) {
      result.push(text.slice(start, index));
      start = index + 1;
    }
  }
  result.push(text.slice(start));
  return result;
}

function parseParticipant(expression: string, network: PsbtNetwork, wildcardIndex: number, branch: 0 | 1): { publicKey: Uint8Array; xpub: boolean; ranged: boolean; multipath: boolean } {
  validateDescriptorPublicKey(expression, network, { wildcardIndex });
  const withoutOrigin = expression.replace(/^\[[^\]]+\]/u, '');
  if (/^(02|03)[0-9a-fA-F]{64}$/u.test(withoutOrigin)) {
    const publicKey = hexToBytes(withoutOrigin);
    secp256k1.Point.fromBytes(publicKey);
    return { publicKey, xpub: false, ranged: false, multipath: false };
  }
  const match = /^([xt]pub[1-9A-HJ-NP-Za-km-z]+)(.*)$/u.exec(withoutOrigin);
  if (match === null) throw new Error('BIP-390 participants must be compressed public keys or public extended keys; private keys are not accepted.');
  const expectedPrefix = network === 'mainnet' ? 'xpub' : 'tpub';
  if (!match[1]!.startsWith(expectedPrefix)) throw new Error(`The selected ${network} network requires ${expectedPrefix} MuSig2 participant keys.`);
  const suffix = match[2]!;
  const publicKey = hexToBytes(materializeDescriptorKey(expression, network, branch, wildcardIndex));
  return { publicKey, xpub: true, ranged: suffix.includes('*'), multipath: suffix.includes('<') };
}

function aggregate(publicKeys: readonly Uint8Array[]): { compressed: Uint8Array; xOnly: Uint8Array } {
  if (publicKeys.length < 1) throw new Error('BIP-390 musig() requires at least one participant key.');
  const sorted = sortKeys([...publicKeys]);
  const context = keyAggregate(sorted);
  return { compressed: context.aggPublicKey.toBytes(true), xOnly: context.aggPublicKey.toBytes(true).slice(1) };
}

function parseMusigExpression(expression: string, network: PsbtNetwork, wildcardIndex: number, branch: 0 | 1 = 0): MusigKeyAnalysis {
  if (!expression.startsWith('musig(')) throw new Error('Expected a musig() key expression.');
  const close = matchingClose(expression, 5);
  const suffix = expression.slice(close + 1);
  if (suffix.includes('*') && (!suffix.endsWith('/*') || suffix.indexOf('*') !== suffix.lastIndexOf('*'))) throw new Error('MuSig2 derivation permits at most one final wildcard.');
  if (/[hH']/u.test(suffix)) throw new Error('BIP-390 MuSig2 derivation cannot contain hardened child steps.');
  if (suffix.length > 0 && !suffix.startsWith('/')) throw new Error('Unexpected data after musig() expression.');
  const participantExpressions = splitTopLevel(expression.slice(6, close));
  if (participantExpressions.some((participant) => participant.includes('musig('))) throw new Error('BIP-390 musig() expressions cannot be nested.');
  if (participantExpressions.length > 999) throw new Error('BIP-390 musig() supports at most 999 participant keys.');
  const participants = participantExpressions.map((participant) => parseParticipant(participant, network, wildcardIndex, branch));
  let aggregateKey = aggregate(participants.map(({ publicKey }) => publicKey));
  let syntheticXpub: string | null = null;
  if (suffix.length > 0) {
    if (participants.some(({ xpub }) => !xpub)) throw new Error('A derived BIP-390 musig() expression requires every participant to be an xpub.');
    if (participants.some(({ ranged, multipath }) => ranged || multipath)) {
      throw new Error('BIP-390 does not allow participant wildcard/multipath derivation together with aggregate-key derivation.');
    }
    const versions = network === 'mainnet' ? MAINNET_VERSIONS : TESTNET_VERSIONS;
    const synthetic = new HDKey({ publicKey: aggregateKey.compressed, chainCode: SYNTHETIC_CHAIN_CODE, versions });
    syntheticXpub = synthetic.publicExtendedKey;
    // Reuse the ordinary BIP32 suffix validator before choosing a branch.
    const derived = hexToBytes(materializeDescriptorKey(`${syntheticXpub}${suffix}`, network, branch, wildcardIndex));
    aggregateKey = { compressed: derived, xOnly: derived.slice(1) };
  }
  const sortedParticipantKeys = sortKeys(participants.map(({ publicKey }) => publicKey)).map(bytesToHex);
  return {
    participantCount: participants.length,
    sortedParticipantKeys,
    aggregateCompressedKey: bytesToHex(aggregateKey.compressed),
    aggregateXOnlyKey: bytesToHex(aggregateKey.xOnly),
    syntheticXpub,
    derivation: suffix.length === 0 ? `participant keys derived at wildcard index ${wildcardIndex}, then KeySort + KeyAgg` : `BIP-328 synthetic aggregate xpub derived at ${suffix.replace('*', String(wildcardIndex))}`,
  };
}

function musigExpressions(text: string): string[] {
  const expressions: string[] = [];
  let offset = 0;
  while (true) {
    const start = text.indexOf('musig(', offset);
    if (start === -1) return expressions;
    const close = matchingClose(text, start + 5);
    let end = close + 1;
    while (text[end] === '/') {
      end += 1;
      if (text[end] === '<') {
        const closing = text.indexOf('>', end);
        if (closing === -1) throw new Error('MuSig2 multipath expression is unclosed.');
        end = closing + 1;
      } else {
        while (end < text.length && /[0-9*hH']/u.test(text[end]!)) end += 1;
      }
    }
    if (end < text.length && ![',', ')', '}'].includes(text[end]!)) {
      throw new Error(`Unexpected MuSig2 key suffix beginning with ${JSON.stringify(text[end])}.`);
    }
    expressions.push(text.slice(start, end));
    offset = end;
  }
}

export function analyzeMusigDescriptor(input: string, network: PsbtNetwork, wildcardIndex: number, branch: 0 | 1 = 0): MusigDescriptorAnalysis | null {
  const payload = input.trim().replaceAll('\\_', '_').replaceAll('\\*', '*').replaceAll(/\s+/gu, '').split('#')[0]!;
  const type = /^(rawtr|tr|sp)\(/u.exec(payload)?.[1];
  const expressions = musigExpressions(payload);
  if (expressions.length === 0) return null;
  if (type === undefined) throw new Error('BIP-390 musig() is permitted only inside tr(), rawtr(), or sp() descriptors.');
  const keys = expressions.map((expression) => parseMusigExpression(expression, network, wildcardIndex, branch));
  if (type === 'sp') return { keys, outputScript: null, address: null };
  const payment = compileTaprootDescriptor(payload, network, wildcardIndex, branch);
  return { keys, outputScript: bytesToHex(payment.script), address: payment.address };
}

/** Expand keys before sorting/compiling, and preserve the exact binary tree. */
export function compileTaprootDescriptor(payload: string, network: PsbtNetwork, wildcardIndex: number, branch: 0 | 1 = 0): { script: Uint8Array; address: string } {
  function key(text: string): string {
    if (text.startsWith('musig(')) return parseMusigExpression(text, network, wildcardIndex, branch).aggregateXOnlyKey;
    validateDescriptorPublicKey(text, network, { allowXOnly: true, wildcardIndex });
    const bare = text.replace(/^\[[^\]]+\]/u, '');
    const concrete = /^[0-9a-fA-F]{64}$/u.test(bare) ? bare.toLowerCase() : materializeDescriptorKey(text, network, branch, wildcardIndex);
    if (concrete.length !== 64 && concrete.length !== 66) throw new Error('Taproot keys must be x-only or compressed points.');
    return concrete.length === 66 ? concrete.slice(2) : concrete;
  }
  function fragment(text: string): string {
    const match = /^([a-z]*:)?([a-z0-9_]+)\(/u.exec(text);
    if (match === null) return text;
    const open = match[0].length - 1;
    if (matchingClose(text, open) !== text.length - 1) throw new Error('Unexpected data after Tapscript fragment.');
    const name = match[2]!;
    let args = splitTopLevel(text.slice(open + 1, -1));
    if (['pk', 'pk_k', 'pkh', 'pk_h'].includes(name)) {
      if (args.length !== 1) throw new Error('Invalid key fragment arity.');
      args = [key(args[0]!)];
    } else if (name === 'multi_a' || name === 'sortedmulti_a') {
      const threshold = Number(args[0]);
      if (!/^[1-9][0-9]*$/u.test(args[0]!) || threshold > args.length - 1) throw new Error('Invalid Tapscript multisig threshold.');
      const keys = args.slice(1).map(key);
      args = [args[0]!, ...(name === 'sortedmulti_a' ? keys.sort() : keys)];
    } else args = args.map(fragment);
    return `${match[1] ?? ''}${name === 'sortedmulti_a' ? 'multi_a' : name}(${args.join(',')})`;
  }
  function tree(text: string, depth = 0): TaprootScriptTree {
    if (depth > 128) throw new Error('Taproot tree exceeds 128 levels.');
    if (text.startsWith('{')) {
      if (!text.endsWith('}')) throw new Error('Unclosed Taproot tree.');
      const nodes = splitTopLevel(text.slice(1, -1));
      if (nodes.length !== 2) throw new Error('Taproot tree branches must have exactly two children.');
      return [tree(nodes[0]!, depth + 1), tree(nodes[1]!, depth + 1)];
    }
    return { script: compilePolicyMiniscript(fragment(text), { tapscript: true }).script };
  }
  const type = payload.startsWith('rawtr(') ? 'rawtr' : 'tr';
  const open = payload.indexOf('(');
  if (matchingClose(payload, open) !== payload.length - 1) throw new Error('Unexpected data after Taproot descriptor.');
  const args = splitTopLevel(payload.slice(open + 1, -1));
  if (args.length < 1 || args.length > (type === 'tr' ? 2 : 1)) throw new Error('Invalid Taproot descriptor arity.');
  const internal = hexToBytes(key(args[0]!));
  if (type === 'rawtr') return {
    script: Uint8Array.of(0x51, 0x20, ...internal),
    address: bech32m.encode(network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb', [1, ...bech32m.toWords(internal)]),
  };
  const net = network === 'mainnet' ? NETWORK : network === 'regtest' ? { ...TEST_NETWORK, bech32: 'bcrt' } : TEST_NETWORK;
  const payment = args[1] === undefined ? p2tr(internal, undefined, net) : p2tr(internal, tree(args[1]), net, true);
  return { script: payment.script, address: payment.address };
}
