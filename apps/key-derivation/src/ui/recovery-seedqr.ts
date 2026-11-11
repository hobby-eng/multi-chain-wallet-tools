import { RenderedSecrets } from "./secrets.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  decodeCompactSeedQr,
  decodeStandardSeedQr,
  encodeCompactSeedQr,
  encodeStandardSeedQr,
  isCompactSeedQr,
  isStandardSeedQr,
} from "@ckd/recovery-backup/seedqr.js";
import { createQrAction } from "@ckd/ui/payment-qr.js";
import { installQrImageImport } from "@ckd/ui/qr-image-import.js";
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
import { InputRevision } from "./recovery-input-revision.js";
import { hiddenSeedQr } from "./recovery-seedqr-hidden-selection.js";
import { RecoverySecretToggle } from "./recovery-secret-toggle.js";

/** What Decode says of an image that gives no SeedQR while its hidden record went unread. */
const NO_SEEDQR = "This QR image holds no SeedQR.";

/** Decode's image import: a PNG's hidden SeedQR first where the build has one, then the QR. */
function installSeedQrImport(): void {
  installQrImageImport(document, required<HTMLTextAreaElement>("#seedqr-payload"), {
    ...(hiddenSeedQr === undefined ? {} : { readHidden: hiddenSeedQr.readHidden }),
    onDecoded(decoded) {
      const compact = decoded.binaryData;
      if (compact !== undefined && isCompactSeedQr(compact)) {
        required<HTMLSelectElement>("#seedqr-restore-format").value = "compact";
        return bytesToHex(compact);
      }
      const text = decoded.text.trim();
      // Without its hidden record, a decoy QR gives what ordinary scanners show: rather than fill
      // the field with it, say why the record went unread (the import adds the reason).
      if (decoded.hiddenUnread !== undefined && !isStandardSeedQr(text)) throw new Error(NO_SEEDQR);
      required<HTMLSelectElement>("#seedqr-restore-format").value = "standard";
      return text;
    },
    onError(message) {
      RenderedSecrets.text(required<HTMLElement>("#seedqr-restore-result"), message);
    },
  });
}

/** The card of an ordinary SeedQR of `mnemonic` in `format`, with its QR while `current` holds. */
function renderOrdinarySeedQr(
  result: HTMLElement,
  mnemonic: string,
  format: string,
  current: () => boolean,
): void {
  let compact: Uint8Array | undefined;
  try {
    const payload =
      format === "compact"
        ? (compact = encodeCompactSeedQr(mnemonic))
        : encodeStandardSeedQr(mnemonic);
    const displayed = typeof payload === "string" ? payload : bytesToHex(payload);
    const card = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = format === "compact" ? "CompactSeedQR" : "Standard SeedQR";
    const text = document.createElement("p");
    text.className = "concealed share-secret";
    text.textContent = displayed;
    const qr = createQrAction(
      document,
      typeof payload === "string" ? payload : Array.from(payload),
      title.textContent,
      displayed,
      {
        heading: title.textContent,
        description:
          format === "compact" ? "Binary payload shown below as hexadecimal:" : "Numeric payload:",
        ecc: "L",
        current: () => current() && card.isConnected && !text.classList.contains("concealed"),
      },
    );
    qr.classList.add("share-qr-action");
    card.append(title, text, qr);
    result.append(card);
  } finally {
    compact?.fill(0);
  }
}

function installSeedQr(context: RecoveryFeatureContext): void {
  installSecretToggle("#toggle-seedqr-source", "#seedqr-source", "Show", "Hide", "recovery phrase");
  installMnemonicSourceDiagnostic(context, "seedqr", "#seedqr-source", "#toggle-seedqr-source");
  installSecretToggle(
    "#toggle-seedqr-created",
    "#seedqr-create-result .share-secret",
    "Show payload",
    "Hide payload",
  );
  installSecretToggle("#toggle-seedqr-payload", "#seedqr-payload", "Show", "Hide", "payload");
  installSeedQrImport();
  const seedQrCreateResult = required<HTMLElement>("#seedqr-create-result");
  const inputs = new InputRevision(required("#seedqr-source"), () => {
    seedQrCreateResult.replaceChildren();
    hidden?.wipe();
  });
  inputs.watch(required("#seedqr-format"));
  const hidden = hiddenSeedQr?.install(inputs);
  inputs.bindPageLifetime();
  context.jobs.onChange((change) => {
    if (change === "ready" && !context.jobs.ready) inputs.revise();
  });
  document.addEventListener("recovery-source-change", (event) => {
    if (event instanceof CustomEvent && event.detail === "seedqr") inputs.revise();
  });
  required<HTMLButtonElement>("#create-seedqr").addEventListener("click", () => {
    const captured = inputs.capture();
    const current = (): boolean => captured() && context.jobs.ready;
    seedQrCreateResult.replaceChildren();
    hidden?.wipe();
    try {
      const mnemonic = context.readMnemonic("seedqr", "#seedqr-source");
      if (hidden?.chosen === true) hidden.show(seedQrCreateResult, mnemonic, current);
      else
        renderOrdinarySeedQr(
          seedQrCreateResult,
          mnemonic,
          required<HTMLSelectElement>("#seedqr-format").value,
          current,
        );
      // A new SeedQR of either form starts concealed, with Show payload and its actions to match.
      seedQrCreateResult
        .closest<HTMLElement>(RecoverySecretToggle.SCOPE)
        ?.dispatchEvent(new CustomEvent("secret-content-reset"));
    } catch (cause) {
      seedQrCreateResult.textContent =
        cause instanceof Error ? cause.message : "SeedQR creation failed.";
    }
  });

  const seedQrRestoreResult = required<HTMLElement>("#seedqr-restore-result");
  required<HTMLButtonElement>("#restore-seedqr").addEventListener("click", () => {
    RenderedSecrets.replace(seedQrRestoreResult);
    let compact: Uint8Array | undefined;
    try {
      const format = required<HTMLSelectElement>("#seedqr-restore-format").value;
      const payload = required<HTMLTextAreaElement>("#seedqr-payload").value.trim();
      const mnemonic =
        format === "compact"
          ? decodeCompactSeedQr((compact = hexToBytes(payload)))
          : decodeStandardSeedQr(payload);
      renderRecoveredMnemonic(
        seedQrRestoreResult,
        mnemonic,
        context.writeClipboard,
        context.useMnemonicInDeriver,
        context.mnemonicToSeed,
      );
    } catch (cause) {
      RenderedSecrets.text(
        seedQrRestoreResult,
        cause instanceof Error ? cause.message : "SeedQR restoration failed.",
      );
    } finally {
      compact?.fill(0);
    }
  });
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "seedqr",
    panelId: "seedqr-panel",
    phraseField: "#seedqr-source",
    linkedNote: PHRASE_ONLY_NOTE,
  },
  install: installSeedQr,
};
