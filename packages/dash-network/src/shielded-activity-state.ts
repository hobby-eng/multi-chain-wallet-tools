import type { ActivitySnapshot, ShieldedActivity, ViewerKeyKind } from "./types.js";

export type ShieldedNoteSpendStatus = "unknown" | "spent" | "spendable";

/** Keeps provisional nullifier coverage separate from established spend state. */
export class ShieldedActivityState {
  readonly #snapshot: ActivitySnapshot;

  constructor(snapshot: ActivitySnapshot) {
    this.#snapshot = snapshot;
  }

  static noteSpendStatus(
    record: ShieldedActivity,
    complete: boolean,
    keyKind: ViewerKeyKind,
  ): ShieldedNoteSpendStatus {
    if (record.incoming === undefined) return "unknown";
    if (record.spent === true) return "spent";
    // An unobserved spend can still appear beyond the scanned prefix.
    return keyKind === "full" && complete && record.spent === false ? "spendable" : "unknown";
  }

  noteSpendStatus(record: ShieldedActivity): ShieldedNoteSpendStatus {
    return ShieldedActivityState.noteSpendStatus(
      record,
      this.#snapshot.complete,
      this.#snapshot.keyKind,
    );
  }

  get balance(): bigint | null {
    return this.#snapshot.keyKind === "full" && this.#snapshot.complete
      ? this.#snapshot.balance
      : null;
  }
}
