import type { MhfePackageParts } from "../runtime/runtime.js";
import { MhfeModuleClass } from "../runtime/runtime.js";
export {
  MhfeError,
  type MhfeErrorCode,
  type MhfeSelfCheckProgress,
  type MhfeSelfCheckReport,
} from "../runtime/runtime.js";

/** runtime/worker.js and runtime/mhfe.wasm. */
export type MhfeRepairSources = MhfePackageParts;

export interface MhfeRepairCard {
  profile: "MHFE-REPAIR-1";
  /** The repair words, one space apart. */
  words: string;
  /** Unreadable words the card repairs. */
  repairsUnreadable: number;
  /** Wrong words the card repairs: half as many. */
  repairsWrong: number;
}

export interface MhfeRepaired {
  /** The repaired container, every word in full. */
  container: string;
  containerFingerprint: string;
  /** True when nothing needed a repair. */
  unchanged: boolean;
  /** Positions of the container phrase's words that were repaired, from 1. */
  containerWords: number[];
  /** Positions of the card's words that were wrong or unreadable, from 1. */
  cardWords: number[];
  /**
   * Every repaired word with what was read there, container phrase first: a repair is never
   * silent.
   */
  changes: { onCard: boolean; position: number; read: string | null; word: string }[];
}

export interface MhfeContainerReading {
  /**
   * "container": valid as it stands. "marked": words typed as "?"; ask for the repair words at
   * once. "notAContainer": a container's length but not a container; offer to type it again or
   * to repair it. "wrongLength": a length no container has.
   */
  reading: "container" | "marked" | "notAContainer" | "wrongLength";
  /** Words typed, "?" included. */
  wordCount: number;
  /** For "marked": every word that cannot be read, from 1, words outside the list included. */
  unreadable: number[];
}

/** The module's fixed values, from parameters(). */
export interface MhfeRepairParameters {
  version: string;
  profile: "MHFE-REPAIR-1";
  repairWordCounts: (2 | 4 | 6 | 8)[];
  recommendedRepairWords: number;
  repairCapacities: { count: number; unreadable: number; wrong: number }[];
}

/** Every method returns a promise and reports every error by rejecting it. */
export class MhfeRepair extends MhfeModuleClass<MhfeRepairParameters> {
  constructor(sources: MhfeRepairSources);
  repairWords(options: { container: string; count: 2 | 4 | 6 | 8 }): Promise<MhfeRepairCard>;
  /** "?" stands for a word that cannot be read. */
  repairContainer(options: { container: string; card: string }): Promise<MhfeRepaired>;
  /** What a container phrase as typed is, before it is used; "?" stands for an unreadable word. */
  inspectContainer(options: { container: string }): Promise<MhfeContainerReading>;
}
