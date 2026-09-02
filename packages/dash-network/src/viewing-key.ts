export type ViewingKeyKind = 'full' | 'incoming' | 'outgoing';

export interface NormalizedViewingKey {
  hex: string;
  kind: ViewingKeyKind;
  bundleNetwork?: 'mainnet' | 'testnet';
}

export type ViewingKeyInputMode = 'automatic' | 'outgoing';

const FULL_VIEWING_KEY_HEX_LENGTH = 192;
const INCOMING_VIEWING_KEY_HEX_LENGTH = 128;
const OUTGOING_VIEWING_KEY_HEX_LENGTH = 64;

/**
 * Normalizes only canonical-length raw Orchard viewing-key candidates.
 * Canonical field validation is deliberately delegated to the pinned Dash
 * Orchard WASM adapter after this presentation-layer check.
 */
export function normalizeViewingKey(
  value: string,
  inputMode: ViewingKeyInputMode = 'automatic',
): NormalizedViewingKey {
  const trimmed = value.trim();
  let bundleNetwork: NormalizedViewingKey['bundleNetwork'];
  let keyValue = trimmed;
  if (trimmed.startsWith('{')) {
    if (inputMode === 'outgoing') throw new Error('A Full Viewing Key bundle cannot be used in outgoing-only mode.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('The viewing bundle is not valid JSON.');
    }
    if (typeof parsed !== 'object' || parsed === null) throw new Error('The viewing bundle must be a JSON object.');
    const bundle = parsed as Record<string, unknown>;
    if (bundle.format !== 'dash-shielded-viewing-bundle' || bundle.version !== 1) {
      throw new Error('Unsupported Dash Shielded viewing bundle format or version.');
    }
    if (bundle.network !== 'mainnet' && bundle.network !== 'testnet') {
      throw new Error('Viewing bundle network must be mainnet or testnet.');
    }
    if (typeof bundle.fullViewingKey !== 'string') {
      throw new Error('Viewing bundle is missing fullViewingKey.');
    }
    bundleNetwork = bundle.network;
    keyValue = bundle.fullViewingKey;
  }
  const normalized = keyValue.toLowerCase().replace(/^0x/u, '').replace(/\s+/gu, '');
  if (!/^[0-9a-f]+$/u.test(normalized)) {
    throw new Error('Viewing keys may contain only hexadecimal characters.');
  }
  if (inputMode === 'outgoing') {
    if (normalized.length === OUTGOING_VIEWING_KEY_HEX_LENGTH) {
      return { hex: normalized, kind: 'outgoing' };
    }
    throw new Error('Outgoing-only mode requires the raw 32-byte OVK: exactly 64 hexadecimal characters.');
  }
  if (normalized.length === FULL_VIEWING_KEY_HEX_LENGTH) {
    return bundleNetwork === undefined
      ? { hex: normalized, kind: 'full' }
      : { hex: normalized, kind: 'full', bundleNetwork };
  }
  if (normalized.length === INCOMING_VIEWING_KEY_HEX_LENGTH) {
    return { hex: normalized, kind: 'incoming' };
  }
  if (normalized.length === OUTGOING_VIEWING_KEY_HEX_LENGTH) {
    throw new Error(
      'A 32-byte OVK cannot be distinguished from a spending key by length. Select Outgoing-only mode only if you copied the field explicitly labeled Outgoing Viewing Key.',
    );
  }
  throw new Error(
    'Paste a raw 64-byte IVK (128 hex) or 96-byte FVK (192 hex).',
  );
}
