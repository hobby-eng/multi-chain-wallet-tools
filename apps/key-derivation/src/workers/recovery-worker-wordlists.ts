import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const KEYS = { bip39: "ckdPageBip39English", slip39: "ckdPageSlip39English" } as const;
const ERRORS = new ErrorCatalog("wallet.recovery-wordlists", {
  missing: () => "The worker was started without the page's public wordlist.",
});
type WordlistKind = keyof typeof KEYS;

/** Named public data ports keep recovery dictionaries embedded only once in an HTML artifact. */
export class RecoveryWorkerWordlists {
  /** The stable page/worker key, shared by prelude writers and readers. */
  static key(kind: WordlistKind): string {
    return KEYS[kind];
  }

  /** Serializes public dictionary data only; private inputs belong in transferred requests. */
  static prelude(kind: WordlistKind, words: readonly string[]): string {
    return `self[${JSON.stringify(KEYS[kind])}]=${JSON.stringify(words)};\n`;
  }

  /** Checks the received array/text shape; the codec owns dictionary size and uniqueness rules. */
  static read(kind: WordlistKind): readonly string[] {
    const value: unknown = Reflect.get(globalThis, KEYS[kind]);
    if (!Array.isArray(value)) throw ERRORS.create("missing", []);
    const entries: readonly unknown[] = value;
    const words: string[] = [];
    for (const entry of entries) {
      if (typeof entry !== "string") throw ERRORS.create("missing", []);
      words.push(entry);
    }
    return Object.freeze(words);
  }
}
