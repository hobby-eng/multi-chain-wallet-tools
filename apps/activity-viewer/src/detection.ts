import { normalizeIdentityLookupInput } from '@ckd/dash-network/platform-identity-source.js';
import {
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
} from '@ckd/dash-network/private-material.js';
import {
  validateCoreAddress,
  validatePlatformAddress,
} from '@ckd/dash-network/public-address.js';
import type { ViewerNetwork } from '@ckd/dash-network/types.js';
import {
  normalizeViewingKey,
  type ViewingKeyInputMode,
} from '@ckd/dash-network/viewing-key.js';
import type { ViewerMode } from './view.js';

export interface DetectedViewerInput {
  mode: ViewerMode;
  value: string;
  viewingKeyMode: ViewingKeyInputMode;
  explicit: boolean;
}

type OrchardPrefix = 'orchard' | 'orchard-fvk' | 'orchard-ivk' | 'orchard-ovk';

const EXPLICIT_PREFIX = /^(core|platform|identity|orchard|orchard-fvk|orchard-ivk|orchard-ovk)\s*:\s*(.+)$/isu;
const ROUTING_PREFIX = /^(core|platform|identity|orchard|orchard-fvk|orchard-ivk|orchard-ovk)\s*:\s*(.*)$/iu;
const RAW_32_BYTE_HEX = /^(?:0x)?[0-9a-f]{64}$/iu;

function validateOrchard(
  value: string,
  network: ViewerNetwork,
  prefix: OrchardPrefix,
): DetectedViewerInput {
  const viewingKeyMode: ViewingKeyInputMode = prefix === 'orchard-ovk' ? 'outgoing' : 'automatic';
  const key = normalizeViewingKey(value, viewingKeyMode);
  try {
    if (key.bundleNetwork !== undefined && key.bundleNetwork !== network) {
      throw new Error(`This viewing bundle is for ${key.bundleNetwork}; select that network before scanning.`);
    }
    if (prefix === 'orchard-fvk' && key.kind !== 'full') {
      throw new Error('orchard-fvk: requires a 96-byte Full Viewing Key.');
    }
    if (prefix === 'orchard-ivk' && key.kind !== 'incoming') {
      throw new Error('orchard-ivk: requires a 64-byte Incoming Viewing Key.');
    }
    return { mode: 'shielded', value, viewingKeyMode, explicit: true };
  } finally {
    key.hex = '';
  }
}

function explicitInput(
  prefix: string,
  value: string,
  network: ViewerNetwork,
): DetectedViewerInput {
  if (prefix.startsWith('orchard')) {
    return validateOrchard(value, network, prefix as OrchardPrefix);
  }
  assertPublicLookupInput(value);
  if (prefix === 'core') {
    validateCoreAddress(value, network);
    return { mode: 'core', value, viewingKeyMode: 'automatic', explicit: true };
  }
  if (prefix === 'platform') {
    validatePlatformAddress(value, network);
    return { mode: 'platform', value, viewingKeyMode: 'automatic', explicit: true };
  }
  normalizeIdentityLookupInput(value);
  return { mode: 'identity', value, viewingKeyMode: 'automatic', explicit: true };
}

export function looksLikeAutoOrchardInput(value: string): boolean {
  const trimmed = value.trim();
  if (/^orchard(?:-(?:fvk|ivk|ovk))?\s*:/iu.test(trimmed)) return true;
  if (trimmed.startsWith('{')) return true;
  const hex = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '');
  return /^[0-9a-f]+$/iu.test(hex) && (hex.length === 128 || hex.length === 192);
}

export function assertAutoViewerBatchInput(value: string): void {
  assertPublicBatchLookupInput(value);
  const effectivePublicValues = value
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const routed = ROUTING_PREFIX.exec(trimmed);
      if (routed === null) return trimmed;
      const prefix = routed[1]!.toLowerCase();
      const effectiveValue = routed[2]!.trim();
      if (prefix === 'orchard-ovk' && RAW_32_BYTE_HEX.test(effectiveValue)) {
        return 'explicit-orchard-viewing-capability';
      }
      return effectiveValue;
    })
    .join('\n');
  assertPublicBatchLookupInput(effectivePublicValues);
}

export function detectViewerInput(value: string, network: ViewerNetwork): DetectedViewerInput {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error('Enter a public address, Identity lookup, or Orchard viewing key.');

  const explicit = EXPLICIT_PREFIX.exec(trimmed);
  if (explicit !== null) {
    const prefix = explicit[1]!.toLowerCase();
    const explicitValue = explicit[2]!.trim();
    if (explicitValue.length === 0) throw new Error(`${prefix}: requires a value.`);
    return explicitInput(prefix, explicitValue, network);
  }

  if (looksLikeAutoOrchardInput(trimmed)) {
    const detected = validateOrchard(trimmed, network, 'orchard');
    return { ...detected, explicit: false };
  }

  assertPublicLookupInput(trimmed);
  if (/^t?dash1/iu.test(trimmed)) {
    validatePlatformAddress(trimmed, network);
    return { mode: 'platform', value: trimmed, viewingKeyMode: 'automatic', explicit: false };
  }

  try {
    validateCoreAddress(trimmed, network);
    return { mode: 'core', value: trimmed, viewingKeyMode: 'automatic', explicit: false };
  } catch (networkError) {
    const otherNetwork: ViewerNetwork = network === 'mainnet' ? 'testnet' : 'mainnet';
    try {
      validateCoreAddress(trimmed, otherNetwork);
    } catch {
      normalizeIdentityLookupInput(trimmed);
      return { mode: 'identity', value: trimmed, viewingKeyMode: 'automatic', explicit: false };
    }
    throw networkError;
  }
}
