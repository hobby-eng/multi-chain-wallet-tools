import { bytesToHex } from '@ckd/core/crypto.js';
import type {
  ActivitySnapshot,
  ScannedMatch,
  ShieldedActivity,
  ShieldedPage,
  ViewerKeyKind,
} from './types.js';

function activityFromMatch(match: ScannedMatch, keyKind: ViewerKeyKind): ShieldedActivity {
  if (match.incoming !== undefined && match.outgoing !== undefined) {
    if (
      match.incoming.value !== match.outgoing.value
      || match.incoming.addressRaw !== match.outgoing.addressRaw
      || match.incoming.memoHex !== match.outgoing.memoHex
    ) {
      throw new Error('Incoming and outgoing recovery disagree for the same Orchard note.');
    }
    if (keyKind !== 'full') throw new Error('Incoming-only recovery cannot classify self/change outputs.');
    return { ...match, direction: 'self', spent: false };
  }
  if (match.incoming !== undefined) {
    if (keyKind === 'outgoing') throw new Error('Outgoing-only recovery cannot contain incoming notes.');
    return keyKind === 'full'
      ? { ...match, direction: 'received', spent: false }
      : { ...match, direction: 'received' };
  }
  if (keyKind === 'incoming') throw new Error('Incoming-only recovery cannot contain outgoing outputs.');
  if (match.outgoing !== undefined) return { ...match, direction: 'sent' };
  throw new Error('A scan match must contain incoming or outgoing viewing data.');
}

export class ShieldedActivityLedger {
  readonly #records = new Map<string, ShieldedActivity>();
  readonly #incomingByNullifier = new Map<string, ShieldedActivity>();
  #scannedNotes = 0n;
  #proofHeight = 0n;
  #protocolVersion = 0;
  readonly #keyKind: ViewerKeyKind;

  constructor(keyKind: ViewerKeyKind = 'full') {
    this.#keyKind = keyKind;
  }

  applyPage(pageStart: bigint, page: ShieldedPage, matches: ScannedMatch[]): void {
    const pageEnd = pageStart + BigInt(page.notes.length);
    const matchesByPosition = new Map<bigint, ScannedMatch>();
    for (const match of matches) {
      if (match.position < pageStart || match.position >= pageEnd) {
        throw new Error('The Orchard scanner returned a position outside the DAPI page.');
      }
      if (matchesByPosition.has(match.position)) {
        throw new Error('The Orchard scanner returned a duplicate note position.');
      }
      matchesByPosition.set(match.position, match);
    }

    for (let index = 0; index < page.notes.length; index += 1) {
      const position = pageStart + BigInt(index);
      const match = matchesByPosition.get(position);
      if (match !== undefined && !this.#records.has(match.cmx)) {
        const activity = activityFromMatch(match, this.#keyKind);
        this.#records.set(match.cmx, activity);
        const noteNullifier = activity.incoming?.noteNullifier;
        if (noteNullifier !== undefined) this.#incomingByNullifier.set(noteNullifier, activity);
      }

      const wireNote = page.notes[index];
      if (wireNote === undefined) throw new Error('DAPI page changed while it was being processed.');
      const actionNullifier = bytesToHex(wireNote.nullifier);
      const spent = this.#incomingByNullifier.get(actionNullifier);
      if (spent !== undefined) spent.spent = true;
    }
    this.#scannedNotes = pageEnd;
    this.#proofHeight = this.#proofHeight > page.proofHeight ? this.#proofHeight : page.proofHeight;
    this.#protocolVersion = Math.max(this.#protocolVersion, page.protocolVersion);
  }

  snapshot(complete: boolean): ActivitySnapshot {
    const records = [...this.#records.values()].sort((left, right) =>
      left.position < right.position ? -1 : left.position > right.position ? 1 : 0,
    );
    let balance = 0n;
    let receivedExternal = 0n;
    let sentExternal = 0n;
    let selfOrChange = 0n;
    for (const record of records) {
      if (record.incoming !== undefined && record.spent === false) balance += record.incoming.value;
      if (record.direction === 'received') receivedExternal += record.incoming?.value ?? 0n;
      if (record.direction === 'sent') sentExternal += record.outgoing?.value ?? 0n;
      if (record.direction === 'self') selfOrChange += record.incoming?.value ?? 0n;
    }
    return {
      records,
      scannedNotes: this.#scannedNotes,
      proofHeight: this.#proofHeight,
      protocolVersion: this.#protocolVersion,
      complete,
      keyKind: this.#keyKind,
      balance: this.#keyKind === 'full' ? balance : null,
      receivedExternal: this.#keyKind === 'outgoing' ? null : receivedExternal,
      sentExternal: this.#keyKind === 'incoming' ? null : sentExternal,
      selfOrChange: this.#keyKind === 'full' ? selfOrChange : null,
    };
  }
}
