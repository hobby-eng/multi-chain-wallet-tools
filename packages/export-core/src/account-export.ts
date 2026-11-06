import type { AccountDescriptorExport } from "@ckd/core/types.js";

const ACTIONS = {
  publicCopy: { containsSecret: false, download: false },
  publicDownload: { containsSecret: false, download: true },
  privateCopy: { containsSecret: true, download: false },
  privateDownload: { containsSecret: true, download: true },
} as const;
const FORMATS = ["raw", "core"] as const;
type AccountAction = keyof typeof ACTIONS;
type AccountActionDefinition = (typeof ACTIONS)[AccountAction];
type AccountFormat = (typeof FORMATS)[number];

/** Stable refusals, without repeating supplied descriptors, action or format text. */
export type AccountExportErrorCode =
  | "account-export.action"
  | "account-export.format"
  | "account-export.disclosure"
  | "account-export.descriptors";

/** An invalid export request; the front end translates code into its own message. */
export class AccountExportError extends Error {
  readonly code: AccountExportErrorCode;
  constructor(code: AccountExportErrorCode) {
    super(code);
    this.name = "AccountExportError";
    this.code = code;
  }
}

function isAction(value: unknown): value is AccountAction {
  return typeof value === "string" && Object.hasOwn(ACTIONS, value);
}

function isFormat(value: unknown): value is AccountFormat {
  return FORMATS.some((format) => format === value);
}

function actionOf(value: unknown): AccountActionDefinition {
  if (!isAction(value)) throw new AccountExportError("account-export.action");
  return ACTIONS[value];
}

function permitted(action: AccountActionDefinition, revealed: boolean): boolean {
  return !action.containsSecret || revealed;
}

/** Admitted account export choice; retains public options only, never descriptor text. */
export class AccountExportChoice {
  readonly #action: AccountActionDefinition;
  readonly #format: AccountFormat;

  /** Refuses an unknown action or format before a caller accesses descriptor values. */
  constructor(action: unknown, format: unknown) {
    this.#action = actionOf(action);
    if (!isFormat(format)) throw new AccountExportError("account-export.format");
    this.#format = format;
  }

  /** Whether the choice carries account spending keys, rather than watch-only descriptors. */
  get containsSecret(): boolean {
    return this.#action.containsSecret;
  }

  /** Whether the requested native edge is a file download. */
  get download(): boolean {
    return this.#action.download;
  }

  /**
   * A transient view for immediate native handoff. Throws account-export.disclosure for concealed
   * private data; Core conversion may throw account-export.descriptors. No text is retained.
   */
  text(bundle: AccountDescriptorExport, revealed: boolean): string {
    if (!permitted(this.#action, revealed))
      throw new AccountExportError("account-export.disclosure");
    const descriptors = this.containsSecret ? bundle.privateText : bundle.publicText;
    return this.#format === "core" ? AccountExportChoice.coreCommand(descriptors) : descriptors;
  }

  /** Public filename metadata; PRIVATE marks an explicit unencrypted spending-key export. */
  filename(stem: string): string {
    return `${stem}.${this.containsSecret ? "PRIVATE" : "public"}.${this.#format === "core" ? "core-import" : "descriptors"}.txt`;
  }

  /** Capability query for controls; unknown actions throw account-export.action. */
  static permits(action: unknown, revealed: boolean): boolean {
    return permitted(actionOf(action), revealed);
  }

  /**
   * Core console syntax, requiring generated receive/change descriptor text. Refuses missing
   * branch markers or unsafe delimiters with account-export.descriptors; retains no text.
   */
  static coreCommand(descriptors: string): string {
    const lines = descriptors.split("\n");
    if (
      lines.length !== 2 ||
      lines.some((line, branch) => !line.includes(`/${branch}/*`) || /['"\\\r\n]/u.test(line))
    )
      throw new AccountExportError("account-export.descriptors");
    const requests = lines.map((desc, branch) => ({
      desc,
      timestamp: 0,
      active: true,
      internal: branch === 1,
    }));
    return `importdescriptors '${JSON.stringify(requests)}'`;
  }
}

/** Compatibility entry for the generated-descriptor console conversion. */
export const coreImportCommand = AccountExportChoice.coreCommand.bind(AccountExportChoice);
