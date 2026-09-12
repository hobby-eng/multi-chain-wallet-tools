import { bech32 } from '@scure/base';
import { bytesToHex, encodeBase58Check, hash160, hexToBytes, secp256k1, sha256 } from '@ckd/core/crypto.js';
import { descriptorChecksum } from './descriptor.js';
import { materializeDescriptorKey } from './descriptor-key.js';
import { buildCustomMiniscriptPolicy, type CustomMiniscriptContext } from './custom-miniscript.js';
import { compilePolicyMiniscript } from './miniscript-engine.js';
import { analyzeMusigDescriptor } from './musig-descriptor.js';
import type { HashlockKind } from './preimage.js';
import type { PsbtChain, PsbtNetwork } from './psbt.js';

export type LockKind = 'none' | 'height' | 'time' | 'relative-blocks' | 'relative-time';
export type PolicyMode =
  | 'locked-multisig'
  | 'delayed-recovery'
  | 'delayed-recovery-multisig'
  | 'backup-committee'
  | 'escalating-recovery'
  | 'decaying-multisig'
  | 'expanding-multisig'
  | 'staged-recovery'
  | 'htlc'
  | 'custom-miniscript';

export interface PolicyRequest {
  readonly chain: PsbtChain;
  readonly network: PsbtNetwork;
  readonly required: number;
  readonly publicKeys: readonly string[];
  readonly keyOrder?: 'supplied' | 'bip67';
  readonly lockKind: LockKind;
  readonly lockValue: number;
  readonly bitcoinWrapper: 'p2wsh' | 'p2sh' | 'p2tr' | 'p2tr-musig2';
  readonly mode?: PolicyMode;
  readonly recoveryPublicKey?: string;
  readonly recoveryPublicKeys?: readonly string[];
  readonly recoveryRequired?: number;
  readonly secondLockKind?: LockKind;
  readonly secondLockValue?: number;
  readonly emergencyPublicKeys?: readonly string[];
  readonly emergencyRequired?: number;
  readonly hashKind?: HashlockKind;
  readonly hashDigest?: string;
  readonly stagedDescriptorKeys?: {
    readonly primary: string;
    readonly recovery: string;
    readonly emergency: string;
  };
  readonly customMiniscript?: string;
  readonly customContext?: CustomMiniscriptContext;
}

export interface BuiltPolicy {
  readonly redeemScript: Uint8Array;
  readonly scriptPubKey: Uint8Array;
  readonly address: string;
  readonly spendingRequirement: string;
  readonly compatibility: string;
  readonly keyOrder: 'supplied' | 'bip67';
  readonly policyExpression: string;
  readonly descriptor: string;
  readonly miniscript: string;
  readonly miniscriptAsm: string;
  readonly miniscriptAnalysis: string;
}

function validatePublicKeys(values: readonly string[]): Uint8Array[] {
  if (values.length < 1 || values.length > 16) throw new Error('Enter from 1 to 16 compressed public keys.');
  const seen = new Set<string>();
  return values.map((value, index) => {
    const normalized = value.trim().toLowerCase();
    if (/^[xt]pub[1-9a-hj-np-za-km-z]+$/u.test(normalized) || /^\[[0-9a-f]{8}\/[^]+\][xt]pub/u.test(normalized)) {
      throw new Error(`Public key ${index + 1} is an account xpub, not a compressed child public key. Use Multisig wallet -> Deterministic ranged wallet for xpubs, or paste a derived 33-byte child public key that starts with 02 or 03.`);
    }
    if (!/^(02|03)[0-9a-f]{64}$/u.test(normalized)) throw new Error(`Public key ${index + 1} must be a compressed 33-byte secp256k1 key.`);
    if (seen.has(normalized)) throw new Error(`Public key ${index + 1} duplicates an earlier key.`);
    seen.add(normalized);
    const bytes = hexToBytes(normalized);
    try { secp256k1.Point.fromBytes(bytes); } catch { throw new Error(`Public key ${index + 1} is not a valid secp256k1 point.`); }
    return bytes;
  });
}

function orderedPolicyKeys(
  values: readonly string[],
  keyOrder: 'supplied' | 'bip67',
  tapscript: boolean,
): Uint8Array[] {
  const keys = validatePublicKeys(values).map((key) => tapscript ? key.slice(1) : key);
  if (tapscript && new Set(keys.map(bytesToHex)).size !== keys.length) {
    throw new Error('Taproot participant keys must have distinct x-only public keys.');
  }
  return keys.sort((left, right) => keyOrder === 'bip67' ? bytesToHex(left).localeCompare(bytesToHex(right)) : 0);
}

function orderKeyBytes(keys: readonly Uint8Array[], keyOrder: 'supplied' | 'bip67'): Uint8Array[] {
  return [...keys].sort((left, right) => keyOrder === 'bip67' ? bytesToHex(left).localeCompare(bytesToHex(right)) : 0);
}

function lockDetails(kind: LockKind, value: number): { fragment: string; requirement: string } {
  if (kind === 'none') return { fragment: '', requirement: 'No timelock' };
  let encoded = value;
  let requirement: string;
  let fragmentName: 'after' | 'older';
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x7fffffff) throw new Error('Lock value is outside the supported script-number range.');
  if (kind === 'height') {
    if (value >= 500_000_000) throw new Error('Absolute block height must be below 500000000; larger values are timestamps.');
    fragmentName = 'after';
    requirement = `Absolute block height ≥ ${value}; spending input sequence must not be final`;
  } else if (kind === 'time') {
    if (value < 500_000_000) throw new Error('Absolute Unix locktime must be at least 500000000.');
    fragmentName = 'after';
    requirement = `Absolute median-time-past locktime ≥ ${value}; spending input sequence must not be final`;
  } else if (kind === 'relative-blocks') {
    if (value > 0xffff) throw new Error('Relative block delay cannot exceed 65535.');
    fragmentName = 'older';
    requirement = `Relative delay of ${value} blocks via BIP68/BIP112 sequence`;
  } else {
    const units = Math.ceil(value / 512);
    if (units > 0xffff) throw new Error('Relative time delay is too large.');
    encoded = (1 << 22) | units;
    fragmentName = 'older';
    requirement = `Relative delay of ${units * 512} seconds (${units} × 512-second units) via BIP68/BIP112 sequence`;
  }
  return { fragment: `${fragmentName}(${encoded})`, requirement };
}

function multisigMiniscript(keys: readonly Uint8Array[], required: number, tapscript: boolean): string {
  return `${tapscript ? 'multi_a' : 'multi'}(${required},${keys.map(bytesToHex).join(',')})`;
}

function signingMiniscript(keys: readonly Uint8Array[], required: number, tapscript: boolean): string {
  return keys.length === 1 && required === 1 ? `pk(${bytesToHex(keys[0]!)})` : multisigMiniscript(keys, required, tapscript);
}

function lockedMiniscript(inner: string, lock: ReturnType<typeof lockDetails>): string {
  return lock.fragment.length === 0 ? inner : `and_v(v:${lock.fragment},${inner})`;
}

function checksummedDescriptor(payload: string): string {
  return `${payload}#${descriptorChecksum(payload)}`;
}

function base58Address(prefix: number, hash: Uint8Array): string {
  const payload = new Uint8Array(21);
  payload[0] = prefix;
  payload.set(hash, 1);
  return encodeBase58Check(payload);
}

export function buildPolicy(request: PolicyRequest): BuiltPolicy {
  const keyOrder = request.keyOrder ?? 'supplied';
  const mode = request.mode ?? 'locked-multisig';
  if (mode === 'custom-miniscript') {
    if (request.chain !== 'bitcoin') throw new Error('Custom Miniscript creation is available for Bitcoin only.');
    const custom = buildCustomMiniscriptPolicy(
      request.customMiniscript ?? '',
      request.customContext ?? 'p2wsh',
      request.network,
    );
    return {
      redeemScript: custom.script,
      scriptPubKey: custom.scriptPubKey,
      address: custom.address,
      spendingRequirement: custom.requirement,
      compatibility: custom.compatibility,
      keyOrder,
      policyExpression: `custom-${request.customContext ?? 'p2wsh'}`,
      descriptor: custom.descriptor,
      miniscript: custom.miniscript,
      miniscriptAsm: custom.asm,
      miniscriptAnalysis: custom.analysis,
    };
  }
  if (request.chain === 'dash' && request.bitcoinWrapper !== 'p2sh') {
    throw new Error('Dash policy construction supports Legacy P2SH only.');
  }
  const musig2 = request.bitcoinWrapper === 'p2tr-musig2';
  const tapscript = request.bitcoinWrapper === 'p2tr';
  const sourceKeys = validatePublicKeys(request.publicKeys);
  const keys = orderedPolicyKeys(request.publicKeys, keyOrder, tapscript);
  if (!Number.isSafeInteger(request.required) || request.required < 1 || request.required > keys.length) {
    throw new Error(`Required signatures must be from 1 to ${keys.length}.`);
  }
  if (musig2) {
    if (request.chain !== 'bitcoin') throw new Error('MuSig2 Taproot construction is available for Bitcoin only.');
    if (mode !== 'locked-multisig' || request.lockKind !== 'none') {
      throw new Error('MuSig2 key-path construction is a cooperative N-of-N spend and cannot represent the selected script policy or timelock.');
    }
    if (request.required !== sourceKeys.length) {
      throw new Error(`MuSig2 key-path construction requires all ${sourceKeys.length} participants; it is not M-of-N multisig.`);
    }
    const descriptorBody = `tr(musig(${sourceKeys.map(bytesToHex).join(',')}))`;
    const analysis = analyzeMusigDescriptor(descriptorBody, request.network, 0);
    if (analysis?.address === null || analysis?.address === undefined || analysis.outputScript === null) {
      throw new Error('MuSig2 aggregate key could not be converted to a Taproot output.');
    }
    return {
      redeemScript: new Uint8Array(),
      scriptPubKey: hexToBytes(analysis.outputScript),
      address: analysis.address,
      spendingRequirement: `All ${sourceKeys.length} participants cooperate in one BIP327 MuSig2 aggregate Schnorr signature; this is N-of-N, not script multisig.`,
      compatibility: 'Bitcoin Taproot key-path MuSig2 output using a BIP390 musig() descriptor. Spending requires a signer that implements the MuSig2 nonce and partial-signature protocol; ordinary PSBT multisig signing is not sufficient.',
      keyOrder,
      policyExpression: `musig2(${sourceKeys.length}-of-${sourceKeys.length})`,
      descriptor: checksummedDescriptor(descriptorBody),
      miniscript: 'Not applicable: this is a Taproot key-path spend.',
      miniscriptAsm: 'No Tapscript leaf.',
      miniscriptAnalysis: `BIP327 KeySort + KeyAgg produced aggregate x-only key ${analysis.keys[0]!.aggregateXOnlyKey}.`,
    };
  }
  const primaryExpression = `${request.required}-of-${keys.length}`;
  const primaryMiniscript = multisigMiniscript(keys, request.required, tapscript);
  let requirement: string;
  let policyExpression: string;
  let miniscript: string;
  let portableDescriptorBody: string | null = null;
  if (mode === 'htlc') {
    if (request.lockKind === 'none') throw new Error('An HTLC-like fallback branch requires an absolute or relative timelock.');
    const recoveryKeys = orderedPolicyKeys(request.recoveryPublicKeys ?? [], keyOrder, tapscript);
    const recoveryRequired = request.recoveryRequired ?? Math.min(request.required, recoveryKeys.length);
    if (!Number.isSafeInteger(recoveryRequired) || recoveryRequired < 1 || recoveryRequired > recoveryKeys.length) {
      throw new Error(`Recovery signatures must be from 1 to ${recoveryKeys.length}.`);
    }
    const hashKind = request.hashKind ?? 'sha256';
    const digest = (request.hashDigest ?? '').trim().toLowerCase();
    const digestLength = hashKind === 'sha256' || hashKind === 'hash256' ? 64 : 40;
    if (!new RegExp(`^[0-9a-f]{${digestLength}}$`, 'u').test(digest)) {
      throw new Error(`${hashKind} commitment must be exactly ${digestLength / 2} bytes encoded as hexadecimal.`);
    }
    const delayed = lockDetails(request.lockKind, request.lockValue);
    const recoveryExpression = `${recoveryRequired}-of-${recoveryKeys.length}`;
    requirement = `${request.required}-of-${keys.length} plus an exact 32-byte ${hashKind} preimage immediately OR ${recoveryExpression} after: ${delayed.requirement}`;
    policyExpression = `htlc(primary:${primaryExpression}+${hashKind}:${digest},fallback:after(${request.lockValue},${recoveryExpression}))`;
    miniscript = `andor(${signingMiniscript(keys, request.required, tapscript)},${hashKind}(${digest}),${lockedMiniscript(signingMiniscript(recoveryKeys, recoveryRequired, tapscript), delayed)})`;
  } else if (mode === 'delayed-recovery') {
    if (request.lockKind === 'none') throw new Error('A delayed recovery branch requires an absolute or relative timelock.');
    const recoveryInputs = request.recoveryPublicKeys ?? [request.recoveryPublicKey ?? ''];
    if (recoveryInputs.length !== 1) throw new Error('Delayed recovery requires exactly one recovery key.');
    const recoveryKey = orderedPolicyKeys(recoveryInputs, 'supplied', tapscript)[0]!;
    const delayed = lockDetails(request.lockKind, request.lockValue);
    requirement = `${request.required}-of-${keys.length} immediately OR recovery key after: ${delayed.requirement}`;
    policyExpression = `or(${primaryExpression},after(${request.lockValue},recovery-key))`;
    miniscript = `or_i(${primaryMiniscript},${lockedMiniscript(`pk(${bytesToHex(recoveryKey)})`, delayed)})`;
  } else if (mode === 'delayed-recovery-multisig' || mode === 'backup-committee') {
    if (request.lockKind === 'none') throw new Error('A delayed recovery or backup branch requires an absolute or relative timelock.');
    const recoveryKeys = orderedPolicyKeys(request.recoveryPublicKeys ?? [], keyOrder, tapscript);
    const recoveryRequired = request.recoveryRequired ?? Math.min(request.required, recoveryKeys.length);
    const delayed = lockDetails(request.lockKind, request.lockValue);
    requirement = mode === 'backup-committee'
      ? `${request.required}-of-${keys.length} primary committee immediately OR ${recoveryRequired}-of-${recoveryKeys.length} backup committee after: ${delayed.requirement}`
      : `${request.required}-of-${keys.length} immediately OR ${recoveryRequired}-of-${recoveryKeys.length} recovery keys after: ${delayed.requirement}`;
    policyExpression = mode === 'backup-committee'
      ? `or(primary:${primaryExpression},after(${request.lockValue},backup:${recoveryRequired}-of-${recoveryKeys.length}))`
      : `or(${primaryExpression},after(${request.lockValue},recovery:${recoveryRequired}-of-${recoveryKeys.length}))`;
    miniscript = `or_i(${primaryMiniscript},${lockedMiniscript(multisigMiniscript(recoveryKeys, recoveryRequired, tapscript), delayed)})`;
  } else if (mode === 'decaying-multisig') {
    if (request.lockKind === 'none') throw new Error('Decaying multisig requires a timelock.');
    const recoveryRequired = request.recoveryRequired ?? Math.max(1, request.required - 1);
    if (recoveryRequired >= request.required) throw new Error('Decaying multisig must reduce the required signature count after the lock.');
    const delayed = lockDetails(request.lockKind, request.lockValue);
    requirement = `${request.required}-of-${keys.length} immediately OR decays to ${recoveryRequired}-of-${keys.length} after: ${delayed.requirement}`;
    policyExpression = `or(${primaryExpression},after(${request.lockValue},decayed:${recoveryRequired}-of-${keys.length}))`;
    miniscript = `or_i(${primaryMiniscript},${lockedMiniscript(multisigMiniscript(keys, recoveryRequired, tapscript), delayed)})`;
  } else if (mode === 'expanding-multisig') {
    if (request.lockKind === 'none') throw new Error('Expanding multisig requires a timelock.');
    const recoveryKeys = orderedPolicyKeys(request.recoveryPublicKeys ?? [], keyOrder, tapscript);
    const primaryKeySet = new Set(keys.map(bytesToHex));
    const duplicate = recoveryKeys.find((key) => primaryKeySet.has(bytesToHex(key)));
    if (duplicate !== undefined) throw new Error(`Expanding multisig additional key duplicates a primary key: ${bytesToHex(duplicate)}.`);
    const expandedKeys = orderKeyBytes([...keys, ...recoveryKeys], keyOrder);
    const recoveryRequired = request.recoveryRequired ?? request.required;
    const delayed = lockDetails(request.lockKind, request.lockValue);
    requirement = `${request.required}-of-${keys.length} immediately OR expands to ${recoveryRequired}-of-${expandedKeys.length} after: ${delayed.requirement}`;
    policyExpression = `or(${primaryExpression},after(${request.lockValue},expanded:${recoveryRequired}-of-${expandedKeys.length}))`;
    miniscript = `or_i(${primaryMiniscript},${lockedMiniscript(multisigMiniscript(expandedKeys, recoveryRequired, tapscript), delayed)})`;
  } else if (mode === 'staged-recovery') {
    if (keys.length !== 1 || request.required !== 1) throw new Error('Staged recovery requires exactly one primary key and one required primary signature.');
    const primaryKey = keys[0]!;
    if (request.lockKind === 'none' || request.secondLockKind === undefined || request.secondLockKind === 'none') {
      throw new Error('Staged recovery requires both first and second timelocks.');
    }
    const recoveryKey = orderedPolicyKeys(request.recoveryPublicKeys ?? [], 'supplied', tapscript)[0];
    const emergencyKey = orderedPolicyKeys(request.emergencyPublicKeys ?? [], 'supplied', tapscript)[0];
    if (recoveryKey === undefined || (request.recoveryPublicKeys?.length ?? 0) !== 1) throw new Error('Staged recovery requires exactly one first recovery key.');
    if (emergencyKey === undefined || (request.emergencyPublicKeys?.length ?? 0) !== 1) throw new Error('Staged recovery requires exactly one second recovery key.');
    const first = lockDetails(request.lockKind, request.lockValue);
    const second = lockDetails(request.secondLockKind, request.secondLockValue ?? 0);
    requirement = `Primary key immediately OR first recovery key after: ${first.requirement} OR second recovery key after: ${second.requirement}`;
    policyExpression = `or(primary-key,after(${request.lockValue},first-recovery-key),after(${request.secondLockValue ?? 0},second-recovery-key))`;
    const recoveryCheck = `${tapscript ? 'pk' : 'pkh'}(${bytesToHex(recoveryKey)})`;
    const emergencyCheck = `${tapscript ? 'pk' : 'pkh'}(${bytesToHex(emergencyKey)})`;
    miniscript = `or_d(pk(${bytesToHex(primaryKey)}),or_i(and_v(v:${recoveryCheck},${first.fragment}),and_v(v:${emergencyCheck},${second.fragment})))`;
    if (request.stagedDescriptorKeys !== undefined) {
      const descriptorKeys = {
        primary: request.stagedDescriptorKeys.primary.trim().replaceAll('\\*', '*'),
        recovery: request.stagedDescriptorKeys.recovery.trim().replaceAll('\\*', '*'),
        emergency: request.stagedDescriptorKeys.emergency.trim().replaceAll('\\*', '*'),
      };
      for (const value of Object.values(descriptorKeys)) materializeDescriptorKey(value, request.network, 0, 0);
      const recoveryFunction = tapscript ? 'pk' : 'pkh';
      portableDescriptorBody = `or_d(pk(${descriptorKeys.primary}),or_i(and_v(v:${recoveryFunction}(${descriptorKeys.recovery}),${first.fragment}),and_v(v:${recoveryFunction}(${descriptorKeys.emergency}),${second.fragment})))`;
    }
  } else if (mode === 'escalating-recovery') {
    if (request.lockKind === 'none' || request.secondLockKind === undefined || request.secondLockKind === 'none') {
      throw new Error('Escalating recovery requires both first and second timelocks.');
    }
    const recoveryKeys = orderedPolicyKeys(request.recoveryPublicKeys ?? [], keyOrder, tapscript);
    const recoveryRequired = request.recoveryRequired ?? Math.min(request.required, recoveryKeys.length);
    const emergencyKeys = orderedPolicyKeys(request.emergencyPublicKeys ?? [], keyOrder, tapscript);
    const emergencyRequired = request.emergencyRequired ?? Math.min(recoveryRequired, emergencyKeys.length);
    const first = lockDetails(request.lockKind, request.lockValue);
    const second = lockDetails(request.secondLockKind, request.secondLockValue ?? 0);
    requirement = `${request.required}-of-${keys.length} immediately OR ${recoveryRequired}-of-${recoveryKeys.length} after first lock (${first.requirement}) OR ${emergencyRequired}-of-${emergencyKeys.length} after second lock (${second.requirement})`;
    policyExpression = `or(${primaryExpression},after(${request.lockValue},recovery:${recoveryRequired}-of-${recoveryKeys.length}),after(${request.secondLockValue ?? 0},emergency:${emergencyRequired}-of-${emergencyKeys.length}))`;
    miniscript = `or_i(${primaryMiniscript},or_i(${lockedMiniscript(multisigMiniscript(recoveryKeys, recoveryRequired, tapscript), first)},${lockedMiniscript(multisigMiniscript(emergencyKeys, emergencyRequired, tapscript), second)}))`;
  } else {
    const locked = lockDetails(request.lockKind, request.lockValue);
    requirement = locked.requirement;
    policyExpression = request.lockKind === 'none' ? primaryExpression : `after(${request.lockValue},${primaryExpression})`;
    miniscript = lockedMiniscript(primaryMiniscript, locked);
  }
  const compiled = compilePolicyMiniscript(miniscript, { tapscript });
  const redeemScript = compiled.script;
  if ((request.chain === 'dash' || request.bitcoinWrapper === 'p2sh') && redeemScript.length > 520) {
    throw new Error('This P2SH redeem script exceeds the 520-byte script element limit. Use fewer public keys or Bitcoin P2WSH.');
  }

  let scriptPubKey: Uint8Array;
  let address: string;
  let taprootDescriptor: string | null = null;
  if (request.chain === 'bitcoin' && request.bitcoinWrapper === 'p2tr') {
    const taproot = buildCustomMiniscriptPolicy(miniscript, 'tapscript', request.network);
    scriptPubKey = taproot.scriptPubKey;
    address = taproot.address;
    taprootDescriptor = taproot.descriptor;
  } else if (request.chain === 'bitcoin' && request.bitcoinWrapper === 'p2wsh') {
    const digest = sha256(redeemScript);
    scriptPubKey = new Uint8Array(34);
    scriptPubKey.set([0x00, 0x20]);
    scriptPubKey.set(digest, 2);
    address = bech32.encode(request.network === 'mainnet' ? 'bc' : request.network === 'regtest' ? 'bcrt' : 'tb', [0, ...bech32.toWords(digest)]);
  } else {
    const digest = hash160(redeemScript);
    scriptPubKey = new Uint8Array(23);
    scriptPubKey.set([0xa9, 0x14]);
    scriptPubKey.set(digest, 2);
    scriptPubKey[22] = 0x87;
    const prefix = request.chain === 'dash'
      ? (request.network === 'mainnet' ? 0x10 : 0x13)
      : (request.network === 'mainnet' ? 0x05 : 0xc4);
    address = base58Address(prefix, digest);
  }
  const standardMultisig = mode === 'locked-multisig' && request.lockKind === 'none';
  const descriptorBody = portableDescriptorBody ?? (standardMultisig
    ? `${keyOrder === 'bip67' ? 'sortedmulti' : 'multi'}(${request.required},${keys.map(bytesToHex).join(',')})`
    : miniscript);
  const descriptor = taprootDescriptor ?? (request.chain === 'dash' && !standardMultisig
    ? checksummedDescriptor(`raw(${bytesToHex(scriptPubKey)})`)
    : checksummedDescriptor(`${request.chain === 'bitcoin' && request.bitcoinWrapper === 'p2wsh' ? 'wsh' : 'sh'}(${descriptorBody})`));
  const keyOrderDescription = tapscript
    ? (keyOrder === 'bip67' ? 'lexicographically sorted x-only keys committed to multi_a()' : 'x-only keys committed exactly as entered to multi_a()')
    : (keyOrder === 'bip67' ? 'BIP67 lexicographic sortedmulti' : 'committed exactly as entered');
  return {
    redeemScript,
    scriptPubKey,
    address,
    spendingRequirement: `${requirement}; key order is ${keyOrderDescription}`,
    compatibility: request.chain === 'dash'
      ? (standardMultisig
          ? 'Standard Dash P2SH multisig. Importing this public-key descriptor is watch-only by itself; Dash Core can sign only when the corresponding private keys are also present in that wallet.'
          : 'ADVANCED CUSTOM DASH P2SH: the exported raw() descriptor identifies the P2SH scriptPubKey for watch-only use, but is not solvable and does not carry the redeemScript policy. Dash Core does not accept Miniscript policy expressions as descriptors and its standard wallet signer does not automatically satisfy custom conditional, hashlock, CLTV, or CSV branches. Preserve the separately displayed redeemScript and do not fund this address without a tested custom signer and recovery procedure.')
      : (tapscript
          ? 'Bitcoin Taproot script-path output with a standard unspendable NUMS internal key, so the displayed Tapscript policy cannot be bypassed by a key-path signature. Every signer must support this exact Tapscript Miniscript leaf.'
          : ((request.mode ?? 'locked-multisig') === 'locked-multisig' && request.lockKind === 'none'
          ? 'Standard Bitcoin multisig script. Wallet support still depends on the selected P2SH/P2WSH wrapper and imported policy metadata.'
          : 'Advanced Bitcoin script policy. Confirm Miniscript/descriptor support in every intended wallet and signer before funding.')),
    keyOrder,
    policyExpression,
    descriptor,
    miniscript,
    miniscriptAsm: compiled.asm,
    miniscriptAnalysis: compiled.analysis,
  };
}

export function policyHex(policy: BuiltPolicy): { redeemScript: string; scriptPubKey: string } {
  return { redeemScript: bytesToHex(policy.redeemScript), scriptPubKey: bytesToHex(policy.scriptPubKey) };
}
