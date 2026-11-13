// The settings of each MHFE tab that its mhfe command carries, read from the tab's choices alone:
// the PIM and memory level fields, the length, the kind of reference or confirmation, the kind of
// new password and the repair words. A source never reads a phrase, container, password,
// passphrase, address or fingerprint field, nor whether one is empty: mhfe asks for each at its
// prompts. The view (recovery-mhfe-command.ts) shows what a source builds. Some choices follow the
// format facts that the container preview reads once a container phrase is typed: the lengths
// Decode and Change password offer, Decode's one password for a length with a built-in check, and
// whether Change password confirms by that check, unasked. They are format metadata the page shows
// anyway, not a secret, and the command may change with them (accepted in review 1, 2026-11-13).
import {
  MhfeCommand,
  type MhfeCheckReference,
  type MhfeEncryptChoices,
  type MhfeLength,
  type MhfeRekeyConfirmation,
  type MhfeWork,
} from "@ckd/recovery-backup/mhfe-command.js";
import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { MemoryLevelField, runsHere, type MhfeCommandSource } from "./recovery-mhfe-command.js";
import { PimField, selectedRepairCount, type PhraseLengthChoice } from "./recovery-mhfe-fields.js";
import type { NewPasswordChoice } from "./recovery-mhfe-new-password.js";
import type { ReferenceKind, WalletReferenceField } from "./recovery-mhfe-reference.js";
import { required } from "./recovery-workspace-shared.js";

/** The length of a 24-word phrase, which has no built-in check: mhfe decrypt then takes more passwords. */
const FULL_LENGTH = 24;

/** The parts of a PIM field a source reads: as typed, and settled for the command. */
type PimSetting = Pick<PimField, "value" | "settled">;

/** The length chosen, as `--words` takes it: "auto" for detection, undefined while none is. */
function statedLength(length: Pick<PhraseLengthChoice, "chosen">): MhfeLength | undefined {
  const words = length.chosen();
  return words === 0 ? "auto" : words;
}

/** What the settings use of the new password's choice: its kind, and a change of runsHere(). */
type NewPasswordKind = Pick<NewPasswordChoice, "kind" | "reconsider">;

/**
 * The settings of Encode that are not secret: the PIM, the memory level, the container length,
 * the kind of the new password and the repair words. The memory level decides whether the browser
 * runs the encryption at all (runsHere), which the new password's choice asks before it makes a
 * password.
 */
export class EncryptSettings implements MhfeCommandSource {
  readonly operation = "encrypt";
  readonly #pim = new PimField("encrypt");
  readonly #level = new MemoryLevelField("encrypt");
  readonly levelFields = [this.#level];
  readonly #sameLength = required<HTMLInputElement>("#mhfe-length-same");
  readonly #newPassword: NewPasswordKind;

  constructor(newPassword: NewPasswordKind) {
    this.#newPassword = newPassword;
    // A level the browser cannot run puts a password made away, and level 0 brings it back.
    this.#level.onChange(() => this.#newPassword.reconsider());
  }

  works(): readonly MhfeWork[] {
    return [{ pim: this.#pim.value(), memoryLevel: this.#level.value }];
  }

  /** Whether the browser runs the encryption at the level chosen. */
  runsHere(): boolean {
    return runsHere(this);
  }

  /**
   * Every setting; throws the PIM field's refusal (PimField.settled) for a PIM that cannot be used,
   * and MhfeRepairChoiceError while no offered repair choice is selected.
   */
  read(parameters: Pick<MhfeParameters, "repairWordCounts" | "maxPim">): MhfeEncryptChoices {
    return {
      pim: this.#pim.settled(parameters.maxPim),
      memoryLevel: this.#level.value,
      sameLength: this.#sameLength.checked,
      newPassword: this.#newPassword.kind,
      repairWords: selectedRepairCount("mhfe-repair-count", parameters),
    };
  }

  /**
   * The settings an encryption in the browser uses. Throws, before the caller reads any secret, for
   * a PIM that cannot be used (read) or a level the browser cannot run (MhfeCommand), whatever the
   * state of the Encrypt button.
   */
  forBrowser(parameters: MhfeParameters): MhfeEncryptChoices {
    const choices = this.read(parameters);
    new MhfeCommand(parameters).assertRunsInBrowser(choices, this.operation);
    return choices;
  }

  line(command: MhfeCommand, parameters: MhfeParameters): string {
    return command.encrypt(this.read(parameters));
  }

  /** 24 words has no option, which the length note explains; a made password mhfe makes itself. */
  notes(): Readonly<Record<string, boolean>> {
    return { length: !this.#sameLength.checked, made: this.#newPassword.kind !== "own" };
  }
}

/**
 * The settings of a recovery, `mhfe decrypt`: the first password's PIM, the tab's memory level and
 * the length. Hidden wallets take the same command at detection, since mhfe 0.8.0 opens them in
 * decrypt: a command of their own would tell a shell history that hidden wallets were opened.
 * Further passwords are added at mhfe's prompt, each with its settings, and no option carries them,
 * so the command never depends on them; they show the command only through a PIM other than 0.
 */
export class DecryptCommandSource implements MhfeCommandSource {
  readonly operation: "decrypt" | "wallets";
  readonly levelFields: readonly MemoryLevelField[];
  readonly #level: MemoryLevelField;
  readonly #pims: () => readonly PimSetting[];
  readonly #length: Pick<PhraseLengthChoice, "chosen"> | undefined;

  /** `pims` are the PIM fields of the passwords used, the first first; `length` is Decode's. */
  constructor(
    operation: "decrypt" | "wallets",
    level: MemoryLevelField,
    pims: () => readonly PimSetting[],
    length?: Pick<PhraseLengthChoice, "chosen">,
  ) {
    this.operation = operation;
    this.#level = level;
    this.levelFields = [level];
    this.#pims = pims;
    this.#length = length;
  }

  works(): readonly MhfeWork[] {
    return this.#pims().map((pim) => ({ pim: pim.value(), memoryLevel: this.#level.value }));
  }

  line(command: MhfeCommand, parameters: MhfeParameters): string {
    const pims = this.#pims();
    const [first] = pims;
    if (first === undefined) throw new Error("A recovery has a first password.");
    const whose = pims.length > 1 ? "Password 1: " : "";
    return command.decrypt({
      work: { pim: first.settled(parameters.maxPim, whose), memoryLevel: this.#level.value },
      words: this.#length === undefined ? "auto" : (statedLength(this.#length) ?? "auto"),
    });
  }

  /**
   * Decode's note on more passwords: mhfe offers them, and asks about a BIP39 passphrase for a
   * 24-word reading, except where a stated length of 12 to 21 words has a built-in check, where it
   * takes one password (mhfe decrypt.rs: `checked`). Hidden wallets state no length.
   */
  notes(): Readonly<Record<string, boolean>> {
    if (this.#length === undefined) return {};
    const words = statedLength(this.#length);
    const one = words !== undefined && words !== "auto" && words !== FULL_LENGTH;
    return { more: !one, one };
  }
}

/**
 * The settings of a rehearsal, `mhfe check`: the PIM, the memory level and what it compares with,
 * of an address only its coin and one path. The phrase + passphrase check has no option: mhfe
 * offers it in its list, which the list note says.
 */
export class CheckCommandSource implements MhfeCommandSource {
  readonly operation = "check";
  readonly levelFields: readonly MemoryLevelField[];
  readonly #level: MemoryLevelField;
  readonly #pim: PimSetting;
  readonly #length: Pick<PhraseLengthChoice, "chosen">;
  readonly #referenceField: Pick<WalletReferenceField, "commandReference">;

  constructor(
    level: MemoryLevelField,
    pim: PimSetting,
    length: Pick<PhraseLengthChoice, "chosen">,
    reference: Pick<WalletReferenceField, "commandReference">,
  ) {
    this.#level = level;
    this.levelFields = [level];
    this.#pim = pim;
    this.#length = length;
    this.#referenceField = reference;
  }

  works(): readonly MhfeWork[] {
    return [{ pim: this.#pim.value(), memoryLevel: this.#level.value }];
  }

  line(command: MhfeCommand, parameters: MhfeParameters): string {
    const reference = this.#reference();
    return command.check({
      work: { pim: this.#pim.settled(parameters.maxPim), memoryLevel: this.#level.value },
      ...(reference === undefined ? {} : { reference }),
    });
  }

  /** Without a reference option, mhfe asks what to compare with from its list. */
  notes(): Readonly<Record<string, boolean>> {
    const kind = this.#reference()?.kind;
    return { list: kind === undefined || kind === "walletCheck" };
  }

  /** The reference as the command carries it; the built-in check once a length is chosen. */
  #reference(): MhfeCheckReference | undefined {
    const chosen = this.#referenceField.commandReference();
    switch (chosen?.kind) {
      case "address":
        return {
          kind: "address",
          ...(chosen.coin === undefined ? {} : { coin: chosen.coin }),
          ...(chosen.path === undefined ? {} : { path: chosen.path }),
        };
      case "fingerprint":
      case "walletCheck":
        return { kind: chosen.kind };
      case "builtInCheck": {
        const words = statedLength(this.#length);
        return words === undefined ? undefined : { kind: "builtInCheck", words };
      }
      default:
        return undefined;
    }
  }
}

/** What Change password confirms by where it asks: the page's "owner" is mhfe's "show". */
const REKEY_CONFIRMATIONS: Partial<Record<ReferenceKind, MhfeRekeyConfirmation>> = {
  address: "address",
  fingerprint: "fingerprint",
  owner: "show",
};

/** The fields of Change password whose settings `mhfe rekey` takes. */
export interface RekeySettingFields {
  readonly oldLevel: MemoryLevelField;
  readonly newLevel: MemoryLevelField;
  readonly oldPim: PimSetting;
  readonly newPim: PimSetting;
  readonly length: Pick<PhraseLengthChoice, "chosen">;
  /** The confirmation chosen where the tab asks one; undefined for the built-in check or none. */
  readonly confirmation: () => ReferenceKind | undefined;
  /** Whether an address confirmation searches one path only, which mhfe rekey cannot. */
  readonly searchesOnePath: () => boolean;
  readonly newPassword: Pick<NewPasswordChoice, "kind">;
}

/**
 * The settings of a password change, `mhfe rekey`: both containers' PIM and memory level, the
 * length and the confirmation where chosen, the new password's kind and the repair words. The
 * passphrase question is never answered here (mhfe asks it), and an address confirmation's one
 * path has no option in mhfe rekey, which the path note says.
 */
export class RekeyCommandSource implements MhfeCommandSource {
  readonly operation = "rekey";
  readonly levelFields: readonly MemoryLevelField[];
  readonly #fields: RekeySettingFields;

  constructor(fields: RekeySettingFields) {
    this.#fields = fields;
    this.levelFields = [fields.oldLevel, fields.newLevel];
  }

  works(): readonly MhfeWork[] {
    const { oldLevel, newLevel, oldPim, newPim } = this.#fields;
    return [
      { pim: oldPim.value(), memoryLevel: oldLevel.value },
      { pim: newPim.value(), memoryLevel: newLevel.value },
    ];
  }

  /** Whether the browser runs both containers' levels, which the new password's choice asks. */
  runsHere(): boolean {
    return runsHere(this);
  }

  line(command: MhfeCommand, parameters: MhfeParameters): string {
    const { oldLevel, newLevel, oldPim, newPim, length, newPassword } = this.#fields;
    const words = statedLength(length);
    const confirm = this.#confirm();
    return command.rekey({
      old: {
        pim: oldPim.settled(parameters.maxPim, "Old container: "),
        memoryLevel: oldLevel.value,
      },
      new: {
        pim: newPim.settled(parameters.maxPim, "New container: "),
        memoryLevel: newLevel.value,
      },
      ...(words === undefined ? {} : { words }),
      ...(confirm === undefined ? {} : { confirm }),
      newPassword: newPassword.kind,
      repairWords: selectedRepairCount("mhfe-rekey-repair-count", parameters),
    });
  }

  notes(): Readonly<Record<string, boolean>> {
    return {
      made: this.#fields.newPassword.kind !== "own",
      path: this.#confirm() === "address" && this.#fields.searchesOnePath(),
    };
  }

  #confirm(): MhfeRekeyConfirmation | undefined {
    const kind = this.#fields.confirmation();
    return kind === undefined ? undefined : REKEY_CONFIRMATIONS[kind];
  }
}
