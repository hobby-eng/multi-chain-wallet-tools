import { readFileSync } from "node:fs";

const SOURCE = new URL(
  "../apps/key-derivation/src/partials/mnemocode-wallet-fields.html",
  import.meta.url,
);
const PREFIX_TOKEN = "__MNEMOCODE_PREFIX__";
const NONE_NOTE_TOKEN = "__MNEMOCODE_WALLET_NONE_NOTE__";
const PASSPHRASE_NOTE_TOKEN = "__MNEMOCODE_WALLET_PASSPHRASE_NOTE__";
const MARKER_NAME = "MNEMOCODE_WALLET_FIELDS";
const MARKER_PATTERN = new RegExp(`<!--\\s*${MARKER_NAME}\\s*:\\s*([\\s\\S]*?)\\s*-->`, "gu");
const PREFIX_PATTERN = /^mnemocode-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const DEFAULT_NONE_NOTE = "list every candidate instead";
const PASSPHRASE_NOTE = "Part of the wallet; each check uses it";
// WalletEvidenceField fills this span from candidate-list's MAX_PASSPHRASE_BYTES.
const PASSPHRASE_LIMIT_NOTE =
  '(at most <span id="__MNEMOCODE_PREFIX__-wallet-passphrase-limit"></span> bytes)';
// Only these operation-specific notes differ; the fields and wallet Help have one source.
const OPERATION_NOTES = new Map([
  [
    "mnemocode-restore",
    {
      none: "every phrase that fits is shown",
      listContent: "phrases",
    },
  ],
  [
    "mnemocode-forgotten-shares",
    {
      none: "each set that fits is shown with its fingerprint",
      passphraseSuffix: ".",
    },
  ],
  [
    "mnemocode-forgotten",
    {
      listContent: "candidates",
    },
  ],
  [
    "mnemocode-reencode",
    {
      passphraseSuffix: ".",
    },
  ],
]);

/** Build-time fields consumed by WalletEvidenceField; host operation wrappers stay in index.html. */
export class MnemoCodeWalletTemplate {
  // Read once across all edition renders, without a DOM or an operation-specific HTML copy.
  static #source;

  /** Render one wallet question, including its existing operation-specific notes. */
  render(prefix) {
    if (typeof prefix !== "string" || prefix.trim() !== prefix || !PREFIX_PATTERN.test(prefix))
      throw new Error("Invalid MnemoCode wallet prefix.");

    const source = (MnemoCodeWalletTemplate.#source ??= readFileSync(SOURCE, "utf8"));
    const notes = OPERATION_NOTES.get(prefix);
    const passphraseSuffix = notes?.listContent
      ? `, and a candidate list stores it with the ${notes.listContent} ${PASSPHRASE_LIMIT_NOTE}.`
      : (notes?.passphraseSuffix ?? ` ${PASSPHRASE_LIMIT_NOTE}.`);
    return source
      .replaceAll(NONE_NOTE_TOKEN, notes?.none ?? DEFAULT_NONE_NOTE)
      .replaceAll(PASSPHRASE_NOTE_TOKEN, `${PASSPHRASE_NOTE}${passphraseSuffix}`)
      .replaceAll(PREFIX_TOKEN, prefix);
  }

  /** Expand <!-- MNEMOCODE_WALLET_FIELDS: prefix --> before coin/feature admission. */
  expand(template) {
    const prefixes = new Set();
    const rendered = template.replace(MARKER_PATTERN, (_marker, value) => {
      const prefix = value.trim();
      const fields = this.render(prefix);
      if (prefixes.has(prefix)) throw new Error(`Duplicate MnemoCode wallet prefix: ${prefix}.`);
      prefixes.add(prefix);
      return fields;
    });
    if (rendered.includes(MARKER_NAME))
      throw new Error("Malformed MnemoCode wallet fields marker.");
    return rendered;
  }
}
