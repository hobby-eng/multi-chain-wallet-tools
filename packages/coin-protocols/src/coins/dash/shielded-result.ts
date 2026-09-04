import { bytesToHex, concatBytes, hexToBytes } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { field, type DerivationResult, type ShieldedBatchOptions } from '@ckd/core/types.js';
import { encodeDashShieldedAddress, ORCHARD_ADDRESS_TYPE } from './shielded-address.js';

export const DASH_ORCHARD_RELEASE = 'Dash Platform v4.1.1 / dashpay/orchard dashified-0.14.1';

interface RawShieldedRow {
  index: number;
  rawAddress: string;
}

interface RawShieldedResult {
  spendingKey: string;
  fullViewingKey: string;
  incomingViewingKey: string;
  outgoingViewingKey: string;
  rows: RawShieldedRow[];
}

function assertHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error(`The official Dash Orchard adapter returned an invalid ${label}.`);
  }
  return value;
}

function parseOfficialResult(json: string, start: number, count: number): RawShieldedResult {
  let candidate: unknown;
  try {
    candidate = JSON.parse(json);
  } catch {
    throw new Error('The official Dash Orchard adapter returned malformed JSON.');
  }
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('The official Dash Orchard adapter returned an invalid result.');
  }
  const raw = candidate as Partial<RawShieldedResult>;
  const spendingKey = assertHex(raw.spendingKey, 32, 'spending key');
  const fullViewingKey = assertHex(raw.fullViewingKey, 96, 'full viewing key');
  const incomingViewingKey = assertHex(raw.incomingViewingKey, 64, 'incoming viewing key');
  const outgoingViewingKey = assertHex(raw.outgoingViewingKey, 32, 'outgoing viewing key');
  if (!Array.isArray(raw.rows) || raw.rows.length !== count) {
    throw new Error('The official Dash Orchard adapter returned an invalid address count.');
  }
  const rows = raw.rows.map((row, offset) => {
    const expectedIndex = start + offset;
    if (typeof row !== 'object' || row === null || row.index !== expectedIndex) {
      throw new Error('The official Dash Orchard adapter returned a non-sequential index.');
    }
    return { index: expectedIndex, rawAddress: assertHex(row.rawAddress, 43, 'raw address') };
  });
  return { spendingKey, fullViewingKey, incomingViewingKey, outgoingViewingKey, rows };
}

/** Validates official WASM output and maps it to the protocol-neutral UI schema. */
export function buildDashShieldedResult(
  json: string,
  options: Pick<ShieldedBatchOptions, 'network' | 'account' | 'start' | 'count'>,
): DerivationResult {
  const network = getDashNetwork(options.network);
  const raw = parseOfficialResult(json, options.start, options.count);
  const path = `m/32'/${network.coinType}'/${options.account}'`;
  const rows = raw.rows.map(({ index, rawAddress: rawAddressHex }) => {
    const rawAddress = hexToBytes(rawAddressHex);
    const displayPayload = concatBytes(Uint8Array.of(ORCHARD_ADDRESS_TYPE), rawAddress);
    const address = encodeDashShieldedAddress(rawAddress, network.platformHrp);
    const diversifier = rawAddress.slice(0, 11);
    const diversifiedTransmissionKey = rawAddress.slice(11);

    const row = {
      index,
      path: `${path} · external diversifier index ${index}`,
      title: `Shielded address #${index}`,
      basic: [
        field('address', 'Dash Shielded receive address', address),
        field(
          'spendingKey',
          'Account Orchard spending key (same for every address)',
          raw.spendingKey,
          true,
          'This is account-wide spending authority, repeated beside each diversified address for Basic-mode recovery. It is not unique to this address and is not WIF.',
        ),
        field(
          'fullViewingKey',
          'Account Full Viewing Key (same for every address)',
          raw.fullViewingKey,
          true,
          'This account-wide FVK watches all external and internal diversified addresses in the Orchard account; there is no separate FVK for only this address.',
        ),
      ],
      advanced: [
        field('path', 'ZIP-32 account path', path),
        field(
          'diversifierIndex',
          'External diversifier index',
          String(index),
          false,
          'Sequential input to the account diversifier key. It selects another receive address without creating another Orchard account or another viewing key.',
        ),
        field('rawAddress', 'Raw Orchard address (d || pk_d)', rawAddressHex),
        field('addressType', 'Dash Orchard display type byte', '0x10'),
        field('displayPayload', 'Bech32m display payload (type || raw address)', bytesToHex(displayPayload)),
        field(
          'diversifier',
          'Orchard diversifier d',
          bytesToHex(diversifier),
          false,
          'The 11-byte diversified-address component derived from the account diversifier key and external index.',
        ),
        field(
          'diversifiedTransmissionKey',
          'Diversified transmission key pk_d',
          bytesToHex(diversifiedTransmissionKey),
          false,
          'The address’s 32-byte Pallas key-agreement public component. It is not a secp256k1 public key and does not provide viewing or spending authority by itself.',
        ),
        field('humanReadablePart', 'Bech32m HRP', network.platformHrp),
      ],
    };
    rawAddress.fill(0);
    displayPayload.fill(0);
    diversifier.fill(0);
    diversifiedTransmissionKey.fill(0);
    return row;
  });

  return {
    id: 'dash-shielded',
    title: 'Dash Shielded (Orchard / ZIP-32)',
    networkLabel: `${network.label} Shielded`,
    pathTemplate: `${path} · external diversifier index i`,
    basicSummary: [],
    summary: [
      field('accountPath', 'ZIP-32 account derivation path', path),
      field('implementation', 'Pinned official implementation', DASH_ORCHARD_RELEASE),
      field(
        'spendingKey',
        'Account Orchard spending key (raw 32-byte hex)',
        raw.spendingKey,
        true,
        'Canonical raw Orchard SpendingKey bytes from Dash\'s official ZIP-32 implementation. This is not WIF.',
      ),
      field(
        'fullViewingKey',
        'Orchard full viewing key (complete watch-only, raw 96-byte hex)',
        raw.fullViewingKey,
        true,
        'Recommended for the connected viewer. It reveals incoming, outgoing, and spent activity but cannot authorize spending.',
      ),
      field(
        'incomingViewingKey',
        'Orchard incoming viewing key (receive-only, raw 64-byte hex)',
        raw.incomingViewingKey,
        true,
        'Limited to incoming-note detection and address derivation; it cannot determine spend state, outgoing activity, or balance.',
      ),
      field('outgoingViewingKey', 'Orchard outgoing viewing key (raw 32-byte hex)', raw.outgoingViewingKey, true),
    ],
    rows,
    notices: [
      'Shielded keys are Orchard/ZIP-32 material, not secp256k1 public keys or WIF. Viewing keys are concealed because they expose wallet activity even though they cannot spend funds.',
      'Orchard spending and viewing keys are account-wide. Every diversified receive address in this result shares the same keys; the external diversifier index only selects a different address (d || pk_d) under that account.',
      'Dash Shielded uses a raw 43-byte Orchard payment address with Dash type byte 0x10 and Dash-specific Bech32m; it is not a Zcash Unified Address.',
    ],
  };
}
