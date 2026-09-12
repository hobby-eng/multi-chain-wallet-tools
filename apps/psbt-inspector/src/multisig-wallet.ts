import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@ckd/core/crypto.js';
import { getBitcoinNetwork, getDashNetwork, type Bip32Versions } from '@ckd/core/networks.js';
import type { NetworkName } from '@ckd/core/types.js';
import { buildDashCoreImport } from './dash-import.js';
import { descriptorChecksum } from './descriptor.js';
import { buildPolicy, policyHex } from './policy.js';
import type { PsbtChain, PsbtNetwork } from './psbt.js';

export type MultisigKeyOrder = 'supplied' | 'bip67';
export type MultisigWrapper = 'p2sh' | 'p2wsh';
export type MultisigBranch = 0 | 1;

export interface ParsedAccountXpub {
  readonly label: string;
  readonly origin: string;
  readonly fingerprint: string;
  readonly originPath: string;
  readonly xpub: string;
  readonly node: HDKey;
}

export interface RangedWalletRequest {
  readonly chain: PsbtChain;
  readonly network: PsbtNetwork;
  readonly required: number;
  readonly keyOrder: MultisigKeyOrder;
  readonly wrapper: MultisigWrapper;
  readonly accountXpubs: readonly string[];
  readonly branches: readonly MultisigBranch[];
  readonly startIndex: number;
  readonly endIndex: number;
}

export interface RangedAddressRow {
  readonly branch: MultisigBranch;
  readonly index: number;
  readonly pathSuffix: string;
  readonly publicKeys: readonly string[];
  readonly redeemScript: string;
  readonly scriptPubKey: string;
  readonly address: string;
}

export interface DescriptorRecord {
  readonly branch: MultisigBranch;
  readonly label: string;
  readonly descriptor: string;
}

export interface RangedWallet {
  readonly accounts: readonly ParsedAccountXpub[];
  readonly descriptors: readonly DescriptorRecord[];
  readonly rows: readonly RangedAddressRow[];
  readonly importText: string;
  readonly importJson: string;
  readonly derivationDetails: string;
}

function versions(chain: PsbtChain, network: PsbtNetwork): Bip32Versions {
  const name: NetworkName = network === 'mainnet' ? 'mainnet' : 'testnet';
  return chain === 'dash' ? getDashNetwork(name).versions : getBitcoinNetwork(name).versions;
}

function xpubNetworkHint(value: string, expectedNetwork: PsbtNetwork): string {
  if (value.startsWith('xpub') && expectedNetwork !== 'mainnet') {
    return ' This looks like a mainnet xpub. Select mainnet, or export testnet cosigner keys as tpub from the deriver.';
  }
  if (value.startsWith('tpub') && expectedNetwork === 'mainnet') {
    return ' This looks like a testnet tpub. Select testnet, or export mainnet cosigner keys as xpub from the deriver.';
  }
  return '';
}

export function branchLabel(branch: MultisigBranch): string {
  return branch === 0 ? 'receive' : 'change';
}

function normalizedWrapper(chain: PsbtChain, wrapper: MultisigWrapper): MultisigWrapper {
  return chain === 'dash' ? 'p2sh' : wrapper;
}

function descriptorFunction(order: MultisigKeyOrder): 'multi' | 'sortedmulti' {
  return order === 'bip67' ? 'sortedmulti' : 'multi';
}

export function descriptorWithChecksum(payload: string): string {
  return `${payload}#${descriptorChecksum(payload)}`;
}

export function concreteDescriptor(
  chain: PsbtChain,
  wrapper: MultisigWrapper,
  required: number,
  publicKeys: readonly string[],
  keyOrder: MultisigKeyOrder,
): string {
  const selectedWrapper = normalizedWrapper(chain, wrapper);
  const keys = keyOrder === 'bip67' ? [...publicKeys].sort((left, right) => left.localeCompare(right)) : [...publicKeys];
  const payload = `${selectedWrapper === 'p2wsh' ? 'wsh' : 'sh'}(${descriptorFunction(keyOrder)}(${required},${keys.join(',')}))`;
  return descriptorWithChecksum(payload);
}

export interface ConcreteMultisigRequest {
  readonly chain: PsbtChain;
  readonly network: PsbtNetwork;
  readonly required: number;
  readonly keyOrder: MultisigKeyOrder;
  readonly wrapper: MultisigWrapper;
  readonly publicKeys: readonly string[];
  readonly branch?: MultisigBranch;
  readonly index?: number;
}

export interface ConcreteMultisigWallet {
  readonly address: string;
  readonly requirement: string;
  readonly compatibility: string;
  readonly descriptor: string;
  readonly redeemScript: string;
  readonly scriptPubKey: string;
  readonly orderedPublicKeys: readonly string[];
  readonly importText: string;
  readonly importJson: string;
  readonly derivationDetails: string;
}

function assertConcreteRequest(request: ConcreteMultisigRequest): void {
  if (request.publicKeys.length < 1 || request.publicKeys.length > 16) throw new Error('Enter from 1 to 16 compressed child public keys or account xpubs.');
  if (!Number.isSafeInteger(request.required) || request.required < 1 || request.required > request.publicKeys.length) {
    throw new Error(`Required signatures must be from 1 to ${request.publicKeys.length}.`);
  }
  if (request.branch !== undefined && request.branch !== 0 && request.branch !== 1) throw new Error('Concrete xpub branch must be 0 (receive) or 1 (change).');
  if (request.index !== undefined && (!Number.isSafeInteger(request.index) || request.index < 0 || request.index > 0x7fff_ffff)) {
    throw new Error('Concrete xpub index must be a non-negative non-hardened integer.');
  }
}

function concreteImportPayload(request: ConcreteMultisigRequest, address: string, redeemScript: string, descriptor: string): { text: string; json: string } {
  if (request.chain === 'dash') {
    const dashImport = buildDashCoreImport(address, redeemScript, descriptor);
    return {
      text: dashImport.fullPolicyGuiCommand === null
        ? dashImport.legacyCommand
        : `dash-cli ${dashImport.fullPolicyGuiCommand}`,
      json: dashImport.rpcJson,
    };
  }
  const payload = [{ desc: descriptor, timestamp: 'now', active: false, internal: false }];
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  return { json, text: `bitcoin-cli importdescriptors '${JSON.stringify(payload)}'` };
}

function parseConcreteKeyInput(
  value: string,
  request: ConcreteMultisigRequest,
  position: number,
): { publicKey: string; detail: string } {
  const normalized = value.trim().toLowerCase();
  if (/^(02|03)[0-9a-f]{64}$/u.test(normalized)) {
    return { publicKey: normalized, detail: `${position}. child public key supplied directly` };
  }
  const originMatch = /^\[([0-9a-fA-F]{8}(?:\/[0-9]+['hH]?)+)\]([A-Za-z0-9]+)$/u.exec(value.trim());
  const bare = originMatch?.[2] ?? value.trim();
  if (!/^[xt]pub[1-9A-HJ-NP-Za-km-z]+$/u.test(bare)) {
    throw new Error(`Key input ${position} must be a compressed 33-byte public key or an account xpub.`);
  }
  const branch = request.branch ?? 0;
  const index = request.index ?? 0;
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(bare, versions(request.chain, request.network));
  } catch (cause) {
    throw new Error(`Account xpub ${position} is not valid for the selected network: ${String(cause)}.${xpubNetworkHint(bare, request.network)}`);
  }
  const child = node.deriveChild(branch).deriveChild(index);
  const publicKey = child.publicKey;
  if (publicKey === null) throw new Error(`Account xpub ${position} did not derive a child public key at /${branch}/${index}.`);
  const origin = originMatch?.[1]?.replaceAll("'", 'h').toLowerCase();
  child.wipePrivateData();
  node.wipePrivateData();
  return {
    publicKey: bytesToHex(publicKey),
    detail: origin === undefined
      ? `${position}. account xpub -> /${branch}/${index}`
      : `${position}. [${origin}] account xpub -> /${branch}/${index}`,
  };
}

/** Builds one concrete m-of-n multisig address/script from child public keys or account xpubs derived at one branch/index. */
export function buildConcreteMultisigWallet(request: ConcreteMultisigRequest): ConcreteMultisigWallet {
  assertConcreteRequest(request);
  const wrapper = normalizedWrapper(request.chain, request.wrapper);
  const concreteInputs = request.publicKeys.map((value, index) => parseConcreteKeyInput(value, request, index + 1));
  const publicKeys = concreteInputs.map(({ publicKey }) => publicKey);
  const policy = buildPolicy({
    chain: request.chain,
    network: request.network,
    required: request.required,
    publicKeys,
    keyOrder: request.keyOrder,
    lockKind: 'none',
    lockValue: 0,
    bitcoinWrapper: wrapper,
  });
  const hex = policyHex(policy);
  const descriptor = concreteDescriptor(request.chain, request.wrapper, request.required, publicKeys, request.keyOrder);
  const orderedPublicKeys = request.keyOrder === 'bip67'
    ? [...publicKeys].sort((left, right) => left.localeCompare(right))
    : publicKeys;
  const importData = concreteImportPayload(request, policy.address, hex.redeemScript, descriptor);
  return {
    address: policy.address,
    requirement: policy.spendingRequirement,
    compatibility: policy.compatibility,
    descriptor,
    redeemScript: hex.redeemScript,
    scriptPubKey: hex.scriptPubKey,
    orderedPublicKeys,
    importText: importData.text,
    importJson: importData.json,
    derivationDetails: [
      `${request.required}-of-${request.publicKeys.length} ${request.keyOrder === 'bip67' ? 'BIP67 sortedmulti' : 'supplied-order multi'} ${wrapper.toUpperCase()}`,
      `Network: ${request.chain === 'dash' ? 'Dash Core' : 'Bitcoin'} ${request.network}`,
      `Concrete inputs resolved at xpub suffix /${request.branch ?? 0}/${request.index ?? 0} when an input is an account xpub`,
      `Public keys (${request.keyOrder === 'bip67' ? 'BIP67 lexicographic order' : 'exactly as supplied'}):`,
      ...orderedPublicKeys.map((key, index) => `${index + 1}. ${key}`),
      'Input resolution:',
      ...concreteInputs.map(({ detail }) => detail),
    ].join('\n'),
  };
}

export function parseAccountXpub(line: string, chain: PsbtChain, network: PsbtNetwork, index: number): ParsedAccountXpub {
  const value = line.trim();
  const match = /^\[([0-9a-fA-F]{8})((?:\/[0-9]+['hH]?)+)\]([A-Za-z0-9]+)$/u.exec(value);
  const xpub = match?.[3] ?? value;
  if (!/^[xt]pub[1-9A-HJ-NP-Za-km-z]+$/u.test(xpub)) {
    throw new Error(`Account public key ${index + 1} must be an xpub/tpub, optionally prefixed as [fingerprint/path]xpub.`);
  }
  let node: HDKey;
  try {
    node = HDKey.fromExtendedKey(xpub, versions(chain, network));
  } catch (cause) {
    throw new Error(`Account public key ${index + 1} is not valid for the selected network: ${String(cause)}.${xpubNetworkHint(xpub, network)}`);
  }
  if (node.publicKey === null) throw new Error(`Account public key ${index + 1} does not contain public key material.`);
  const fingerprint = match?.[1]?.toLowerCase() ?? 'not supplied';
  const path = match?.[2]?.replaceAll("'", 'h').toLowerCase() ?? '';
  return {
    label: `Cosigner ${index + 1}`,
    origin: match === null ? '' : `[${fingerprint}${path}]`,
    fingerprint,
    originPath: path.length === 0 ? 'not supplied' : `m${path}`,
    xpub: node.publicExtendedKey,
    node,
  };
}

function validateRange(startIndex: number, endIndex: number): void {
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error('Start index must be a non-negative integer.');
  if (!Number.isSafeInteger(endIndex) || endIndex < startIndex) throw new Error('End index must be greater than or equal to the start index.');
  if (endIndex - startIndex + 1 > 200) throw new Error('Build at most 200 addresses per branch at once.');
}

function assertRequest(request: RangedWalletRequest): void {
  if (request.accountXpubs.length < 1 || request.accountXpubs.length > 16) throw new Error('Enter from 1 to 16 account public keys.');
  if (!Number.isSafeInteger(request.required) || request.required < 1 || request.required > request.accountXpubs.length) {
    throw new Error(`Required signatures must be from 1 to ${request.accountXpubs.length}.`);
  }
  if (request.branches.length === 0) throw new Error('Select at least one branch.');
  validateRange(request.startIndex, request.endIndex);
}

function assertConsistentOrigins(accounts: readonly ParsedAccountXpub[]): void {
  const paths = new Set(accounts.map((account) => account.originPath).filter((path) => path !== 'not supplied'));
  if (paths.size > 1) {
    throw new Error(
      `Account public keys use mixed derivation paths (${[...paths].join(', ')}). Recreate/export every cosigner with the same multisig script type and account path, for example all Dash Purpose48 P2SH keys at m/48h/5h/0h/0h. Mixing legacy m/45h/0 with Purpose48 changes the multisig script and address.`,
    );
  }
}

function branchDescriptor(
  request: RangedWalletRequest,
  accounts: readonly ParsedAccountXpub[],
  branch: MultisigBranch,
): string {
  const wrapper = normalizedWrapper(request.chain, request.wrapper);
  const payload = `${wrapper === 'p2wsh' ? 'wsh' : 'sh'}(${descriptorFunction(request.keyOrder)}(${request.required},${accounts.map((account) => `${account.origin}${account.xpub}/${branch}/*`).join(',')}))`;
  return descriptorWithChecksum(payload);
}

function deriveRow(request: RangedWalletRequest, accounts: readonly ParsedAccountXpub[], branch: MultisigBranch, index: number): RangedAddressRow {
  const publicKeys = accounts.map((account) => {
    const key = account.node.deriveChild(branch).deriveChild(index).publicKey;
    if (key === null) throw new Error(`${account.label} did not derive public key /${branch}/${index}.`);
    return bytesToHex(key);
  });
  const policy = buildPolicy({
    chain: request.chain,
    network: request.network,
    required: request.required,
    publicKeys,
    keyOrder: request.keyOrder,
    lockKind: 'none',
    lockValue: 0,
    bitcoinWrapper: normalizedWrapper(request.chain, request.wrapper),
  });
  return {
    branch,
    index,
    pathSuffix: `/${branch}/${index}`,
    publicKeys: request.keyOrder === 'bip67' ? [...publicKeys].sort((left, right) => left.localeCompare(right)) : publicKeys,
    redeemScript: policyHex(policy).redeemScript,
    scriptPubKey: policyHex(policy).scriptPubKey,
    address: policy.address,
  };
}

function importPayload(request: RangedWalletRequest, descriptors: readonly DescriptorRecord[]): { text: string; json: string } {
  if (request.chain === 'bitcoin') {
    const payload = descriptors.map((descriptor) => ({
      desc: descriptor.descriptor,
      timestamp: 'now',
      active: false,
      internal: descriptor.branch === 1,
      range: [request.startIndex, request.endIndex],
    }));
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    return { json, text: `bitcoin-cli importdescriptors '${JSON.stringify(payload)}'` };
  }
  const payload = descriptors.map((descriptor) => ({
    desc: descriptor.descriptor,
    timestamp: 'now',
    active: false,
    internal: descriptor.branch === 1,
    range: [request.startIndex, request.endIndex],
    next_index: request.startIndex,
    label: `Multisig ${descriptor.label}`,
  }));
  const json = `${JSON.stringify({ jsonrpc: '1.0', id: 'multisig-wallet', method: 'importdescriptors', params: [payload] }, null, 2)}\n`;
  return { json, text: `dash-cli importdescriptors '${JSON.stringify(payload)}'` };
}

export function buildRangedWallet(request: RangedWalletRequest): RangedWallet {
  assertRequest(request);
  const accounts = request.accountXpubs.map((line, index) => parseAccountXpub(line, request.chain, request.network, index));
  assertConsistentOrigins(accounts);
  const descriptors = request.branches.map((branch) => ({
    branch,
    label: `${branchLabel(branch)} /${branch}/*`,
    descriptor: branchDescriptor(request, accounts, branch),
  }));
  const rows: RangedAddressRow[] = [];
  for (const branch of request.branches) {
    for (let index = request.startIndex; index <= request.endIndex; index += 1) {
      rows.push(deriveRow(request, accounts, branch, index));
    }
  }
  const importData = importPayload(request, descriptors);
  return {
    accounts,
    descriptors,
    rows,
    importText: importData.text,
    importJson: importData.json,
    derivationDetails: [
      `${request.required}-of-${accounts.length} ${request.keyOrder === 'bip67' ? 'BIP67 sortedmulti' : 'supplied-order multi'} ${normalizedWrapper(request.chain, request.wrapper).toUpperCase()}`,
      `Network: ${request.chain === 'dash' ? 'Dash Core' : 'Bitcoin'} ${request.network}`,
      `Branches: ${request.branches.map((branch) => `${branchLabel(branch)} /${branch}`).join(', ')}`,
      `Index range: ${request.startIndex}-${request.endIndex}`,
      'All cosigner account public keys must come from the same multisig derivation family; mixed m/45 and Purpose48 keys intentionally produce different addresses.',
      ...accounts.map((account) => `${account.label}: ${account.originPath} · fingerprint ${account.fingerprint} · ${account.xpub}`),
    ].join('\n'),
  };
}
