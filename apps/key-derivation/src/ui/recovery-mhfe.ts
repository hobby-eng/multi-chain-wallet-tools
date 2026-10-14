// MHFE panel: every operation of the MHFE 0.6.0 browser package, one class per tab over one shared
// engine: encrypt and recover a BIP39 phrase, rehearse a recovery, draw a new wallet, change the
// password, open hidden wallets, repair a container phrase, make a password, and the self-test on request.
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
import { MhfeCheckTab } from "./recovery-mhfe-check.js";
import { MhfeDecodeTab } from "./recovery-mhfe-decode.js";
import { MhfeEncodeTab } from "./recovery-mhfe-encode.js";
import { FAST_MODE_THREADS, MhfeEngine } from "./recovery-mhfe-engine.js";
import { MhfeNewWalletTab } from "./recovery-mhfe-new-wallet.js";
import { MhfePasswordTab } from "./recovery-mhfe-password.js";
import { MhfePanelParameters } from "./recovery-mhfe-parameters.js";
import { MhfeRekeyTab } from "./recovery-mhfe-rekey.js";
import { MhfeRepairTab } from "./recovery-mhfe-repair.js";
import { MhfePanelCheck } from "./recovery-mhfe-self-check.js";
import { MhfeSelfTestTab } from "./recovery-mhfe-self-test.js";
import { timeRange } from "./recovery-mhfe-status.js";
import { MhfeWalletsTab } from "./recovery-mhfe-wallets.js";
import { installMhfeWordHints } from "./recovery-mhfe-word-hints.js";
import {
  installMnemonicSourceDiagnostic,
  installSecretToggle,
  leadParagraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** The one warning of the MHFE panel: what MHFE is, what recovery needs, and how fast this page runs. */
function renderSpeedNotice(engine: MhfeEngine): void {
  const experimental = leadParagraph(
    "Experimental:",
    "not independently reviewed; do not use it to protect real funds. Recovery needs the password, and the " +
      "PIM or memory level if you changed them.",
  );
  const recovery = `a recovery takes about ${timeRange(...engine.recoverySeconds)}`;
  const speed = engine.fastMode
    ? leadParagraph(
        "Fast mode:",
        `all ${FAST_MODE_THREADS} processor cores are in use; ${recovery}.`,
      )
    : leadParagraph(
        "Slow mode:",
        `in this HTML version the browser lets MHFE run the ${FAST_MODE_THREADS} Argon2 lanes one after ` +
          `another, so ${recovery}. For the fast mode, use the executable version of this tool.`,
      );
  required<HTMLElement>("#mhfe-mode").replaceChildren(experimental, speed);
  required<HTMLElement>("#mhfe-runtime").textContent = engine.fastMode
    ? `Active · ${FAST_MODE_THREADS} threads`
    : "Inactive · 1 thread · use the executable version";
}

function installMhfe(context: RecoveryFeatureContext): void {
  const engine = new MhfeEngine();
  new MhfePanelParameters(required<HTMLElement>("#mhfe-panel"), engine);
  renderSpeedNotice(engine);
  // MHFE checks its classes when its panel is first opened, before any of its fields opens.
  const panelCheck = new MhfePanelCheck(
    engine,
    required<HTMLElement>("#mhfe-panel"),
    required<HTMLElement>("#mhfe-self-check-status"),
  );
  required<HTMLButtonElement>('[data-recovery-tab][aria-controls="mhfe-panel"]').addEventListener(
    "click",
    () => void panelCheck.ensure(),
  );
  installSecretToggle("#toggle-mhfe-source", "#mhfe-source", "Show", "Hide", "recovery phrase");
  installMnemonicSourceDiagnostic(context, "mhfe", "#mhfe-source", "#toggle-mhfe-source");
  new MhfeEncodeTab(context, engine);
  new MhfeDecodeTab(context, engine);
  new MhfeCheckTab(context, engine);
  new MhfeNewWalletTab(context, engine);
  new MhfeRekeyTab(context, engine);
  new MhfeWalletsTab(context, engine);
  new MhfeRepairTab(context, engine);
  new MhfePasswordTab(engine);
  new MhfeSelfTestTab(context, engine);
  // Hints below every field of words, as mhfe gives them where it reads typed words.
  installMhfeWordHints(engine, required<HTMLElement>("#mhfe-panel"));
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "mhfe",
    panelId: "mhfe-panel",
    phraseField: "#mhfe-source",
    linkedNote: PHRASE_ONLY_NOTE,
  },
  install: installMhfe,
};
