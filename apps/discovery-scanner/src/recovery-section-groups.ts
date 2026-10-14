import type { RecoverySectionId } from "./types.js";

const CORE = ["core", "legacyCore", "coinjoin", "providerCollateral"] as const;
const ADDRESSABLE = [...CORE, "platform"] as const;
const HISTORY = [...ADDRESSABLE, "identity"] as const;
const GROUPS = {
  core: CORE,
  addressable: ADDRESSABLE,
  history: HISTORY,
  derivable: [...HISTORY, "shielded"],
  credits: ["platform", "identity"],
} satisfies Record<string, readonly RecoverySectionId[]>;

/** Section membership shared by discovery summaries, result tabs and exports. */
export class RecoverySectionGroups {
  readonly #groups = GROUPS;

  members(group: keyof typeof GROUPS): readonly RecoverySectionId[] {
    return [...this.#groups[group]];
  }

  has(group: keyof typeof GROUPS, section: RecoverySectionId): boolean {
    return this.members(group).includes(section);
  }
}

export const RECOVERY_SECTION_GROUPS = new RecoverySectionGroups();
