// "Check the written backup": after Encode or a split, the person types the backup again from the
// paper, and MnemoCode says whether it restores the same seed phrase, without showing it
// (checkBackup and checkShareBackup of its WebAssembly). A check holds the result it compares with
// until the result is no longer shown.
import { SecretValue } from "@ckd/core/secret-value.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { mnemocode } from "./mnemocode-engine.js";
import { Masking, type EncodedFormat, type MaskingMode } from "./mnemocode-facts.js";
import { MNEMOCODE_DECODE_ENTRY } from "./mnemocode.js";

const ERRORS = new ErrorCatalog("wallet.mnemocode-backup-check", {
  retired: () => "This written-backup check no longer belongs to the current result.",
});

/** What the person typed from the paper, with the dates written there where the backup has them. */
export interface WrittenBackup {
  readonly backup: string;
  readonly dates?: string;
}

/** What MnemoCode found the written backup to be. */
export interface BackupResult {
  readonly verdict: "restores" | "differs" | "unreadable" | "unchecked";
  readonly message: string;
  readonly notes: readonly string[];
}

/** The check of one shown result, which wipes what it holds when the result goes. */
export interface BackupCheck {
  /** Whether the backup has dates, which the person types too. */
  readonly dated: boolean;
  check(written: WrittenBackup): BackupResult;
  wipe(): void;
}

/** The finding as plain data, the finding itself freed. */
function finding(found: ReturnType<ReturnType<typeof mnemocode>["checkBackup"]>): BackupResult {
  using owned = found;
  return {
    verdict: owned.verdict as BackupResult["verdict"],
    message: owned.message,
    notes: owned.notes,
  };
}

/** The phrase and dates a check compares with, wiped together. */
class Expected {
  readonly #secrets: SecretValue<readonly string[]>;
  readonly dated: boolean;

  constructor(mnemonic: string, dates: string | undefined) {
    this.#secrets = SecretValue.texts([mnemonic, dates ?? ""]);
    this.dated = dates !== undefined;
  }

  get mnemonic(): string {
    return this.#secrets.value[0] ?? "";
  }

  get dates(): string | undefined {
    return this.dated ? (this.#secrets.value[1] ?? "") : undefined;
  }

  wipe(): void {
    this.#secrets.wipe();
  }
}

/** The check of codes against the encoded result they were written from. */
export class EncodedBackupCheck implements BackupCheck {
  readonly #expected: Expected;
  readonly #format: EncodedFormat;
  readonly #mode: MaskingMode;

  /** Whether a backup of `mode` can be checked: a replaced last word cannot. */
  static supports(mode: MaskingMode): boolean {
    return Masking.of(mode).capabilities.backupCheck;
  }

  constructor(result: {
    readonly mnemonic: string;
    readonly format: EncodedFormat;
    readonly mode: MaskingMode;
    readonly dates: string | undefined;
  }) {
    this.#expected = new Expected(result.mnemonic, result.dates);
    this.#format = result.format;
    this.#mode = result.mode;
  }

  get dated(): boolean {
    return this.#expected.dated;
  }

  check(written: WrittenBackup): BackupResult {
    return finding(
      mnemocode().checkBackup(
        this.#expected.mnemonic,
        this.#format,
        this.#mode,
        this.#expected.dates,
        written.backup,
        written.dates,
      ),
    );
  }

  wipe(): void {
    this.#expected.wipe();
  }
}

/** The check of shares written down against the split they came from. */
export class ShareBackupCheck implements BackupCheck {
  readonly #expected: Expected;
  readonly #mode: MaskingMode;
  readonly #threshold: number;

  constructor(split: {
    readonly mnemonic: string;
    readonly mode: MaskingMode;
    readonly threshold: number;
    readonly dates: string | undefined;
  }) {
    this.#expected = new Expected(split.mnemonic, split.dates);
    this.#mode = split.mode;
    this.#threshold = split.threshold;
  }

  get dated(): boolean {
    return this.#expected.dated;
  }

  check(written: WrittenBackup): BackupResult {
    return finding(
      mnemocode().checkShareBackup(
        this.#expected.mnemonic,
        this.#mode,
        this.#threshold,
        this.#expected.dates,
        MNEMOCODE_DECODE_ENTRY,
        written.backup,
        written.dates,
      ),
    );
  }

  wipe(): void {
    this.#expected.wipe();
  }
}

/**
 * Owns a displayed result's check: retirement refuses new comparisons and wipes what the check
 * holds.
 */
export class BackupCheckSession implements Disposable {
  #check: BackupCheck | undefined;

  /** Takes exclusive ownership of the offered check. */
  constructor(check: BackupCheck) {
    this.#check = check;
  }

  /** Whether the backup needs its dates typed; refuses reads after retirement. */
  get dated(): boolean {
    if (this.#check === undefined) throw ERRORS.create("retired", []);
    return this.#check.dated;
  }

  /** Compares a written answer with the result. */
  check(written: WrittenBackup): BackupResult {
    if (this.#check === undefined) throw ERRORS.create("retired", []);
    return this.#check.check(written);
  }

  wipe(): void {
    const check = this.#check;
    this.#check = undefined;
    check?.wipe();
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}
