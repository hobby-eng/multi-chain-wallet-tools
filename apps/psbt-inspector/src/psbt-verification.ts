import { equalBytes } from '@ckd/core/bytes.js';
import { pair, type PsbtPair } from './psbt-binary.js';
import type { PsbtChain, PsbtVerificationCheck, SuppliedUtxo } from './psbt-types.js';

export function inputVerification(
  map: readonly PsbtPair[],
  utxo: SuppliedUtxo | null,
  chain: PsbtChain,
  commitmentFailure: string | null,
  mixedLockKinds: boolean,
): readonly PsbtVerificationCheck[] {
  const checks: PsbtVerificationCheck[] = [
    {
      relationship: 'PSBT framing and field schema',
      status: 'verified',
      detail: 'Canonical lengths, unique keys, known field encodings and amount ranges passed.',
    },
  ];
  checks.push(
    utxo === null
      ? { relationship: 'UTXO binding', status: 'not-verified', detail: 'No UTXO record was supplied for this input.' }
      : utxo.binding === 'non-witness'
        ? {
            relationship: 'UTXO binding',
            status: 'verified',
            detail: 'The previous transaction ID and selected output were checked.',
          }
        : {
            relationship: 'UTXO binding',
            status: 'not-verified',
            detail:
              'A witness UTXO was supplied, but this offline file cannot prove it matches the referenced blockchain output.',
          },
  );
  const hasScripts = pair(map, 0x04) !== undefined || pair(map, 0x05) !== undefined;
  checks.push(
    commitmentFailure !== null
      ? { relationship: 'Redeem/witness script commitments', status: 'failed', detail: commitmentFailure }
      : !hasScripts
        ? {
            relationship: 'Redeem/witness script commitments',
            status: 'not-applicable',
            detail: 'No redeemScript or witnessScript metadata was supplied.',
          }
        : utxo === null
          ? {
              relationship: 'Redeem/witness script commitments',
              status: 'not-verified',
              detail: 'Script metadata is present, but no supplied UTXO scriptPubKey anchors it.',
            }
          : {
              relationship: 'Redeem/witness script commitments',
              status: 'verified',
              detail: 'HASH160/SHA256 commitments were matched to the supplied UTXO and nested witness program.',
            },
  );
  const preimages = map.filter(({ type }) => type >= 10n && type <= 13n).length;
  checks.push(
    preimages === 0
      ? { relationship: 'Hash preimages', status: 'not-applicable', detail: 'No hash-preimage fields were supplied.' }
      : {
          relationship: 'Hash preimages',
          status: 'verified',
          detail: `${preimages} supplied preimage commitment(s) matched.`,
        },
  );
  if (chain === 'bitcoin') {
    const participantFields = map.filter(({ type }) => type === 0x1an).length;
    const referenceFields = map.filter(({ type }) => type === 0x1bn || type === 0x1cn).length;
    checks.push(
      participantFields > 0
        ? {
            relationship: 'MuSig2 participant aggregation',
            status: 'verified',
            detail: `${participantFields} participant list(s) matched BIP327 KeyAgg; linked nonce/signature participants were checked where lists were supplied.`,
          }
        : referenceFields > 0
          ? {
              relationship: 'MuSig2 participant aggregation',
              status: 'not-verified',
              detail:
                'Nonce or partial-signature metadata is present without a participant list for independent KeyAgg membership checks.',
            }
          : {
              relationship: 'MuSig2 participant aggregation',
              status: 'not-applicable',
              detail: 'No MuSig2 fields were supplied.',
            },
    );
  }
  const taprootInternal = pair(map, 0x17)?.value;
  const taprootLeaves = map.filter(({ type }) => type === 0x15n);
  const mismatchedControl =
    taprootInternal !== undefined &&
    taprootLeaves.some(({ keyData }) => !equalBytes(taprootInternal, keyData.slice(1, 33)));
  checks.push(
    mismatchedControl
      ? {
          relationship: 'Taproot control-block internal key',
          status: 'failed',
          detail: 'A tapleaf control block contains a different internal key than PSBT_IN_TAP_INTERNAL_KEY.',
        }
      : taprootLeaves.length === 0
        ? {
            relationship: 'Taproot control-block internal key',
            status: 'not-applicable',
            detail: 'No Taproot leaf/control-block metadata was supplied.',
          }
        : taprootInternal === undefined
          ? {
              relationship: 'Taproot control-block internal key',
              status: 'not-verified',
              detail: 'Taproot leaves are present without PSBT_IN_TAP_INTERNAL_KEY for comparison.',
            }
          : {
              relationship: 'Taproot control-block internal key',
              status: 'verified',
              detail: `${taprootLeaves.length} control block(s) match PSBT_IN_TAP_INTERNAL_KEY.`,
            },
  );
  const signatures = map.filter(({ type }) => [2n, 19n, 20n, 28n].includes(type)).length;
  checks.push(
    signatures === 0
      ? {
          relationship: 'Cryptographic signatures',
          status: 'not-applicable',
          detail: 'No signature fields were supplied.',
        }
      : {
          relationship: 'Cryptographic signatures',
          status: 'not-verified',
          detail: `${signatures} signature field(s) are structurally valid; this inspector does not calculate sighashes or verify signatures.`,
        },
  );
  if (mixedLockKinds)
    checks.push({
      relationship: 'PSBT v2 locktime requirements',
      status: 'failed',
      detail:
        'The PSBT contains both height-based and time-based requirements; one transaction nLockTime cannot satisfy both kinds.',
    });
  else if (pair(map, 17) !== undefined || pair(map, 18) !== undefined)
    checks.push({
      relationship: 'PSBT v2 locktime requirements',
      status: 'verified',
      detail:
        pair(map, 17) !== undefined && pair(map, 18) !== undefined
          ? 'This input supplies alternative time and height requirements; the transaction-wide BIP370 calculation selects a compatible unit.'
          : 'Required locktime values are compatible with the transaction-wide BIP370 calculation.',
    });
  else
    checks.push({
      relationship: 'PSBT v2 locktime requirements',
      status: 'not-applicable',
      detail: 'No required locktime field was supplied.',
    });
  return checks;
}
