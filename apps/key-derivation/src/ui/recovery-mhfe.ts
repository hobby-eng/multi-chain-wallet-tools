// MHFE panel: encrypts a BIP39 phrase into a 24-word container, or on request into one as long as
// a 12- to 21-word phrase, and recovers it, with the MHFE 0.5.0 browser package. Each operation tab
// is its own class (recovery-mhfe-encode.ts, recovery-mhfe-decode.ts); they share one engine.
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
import { MhfeDecodeTab } from "./recovery-mhfe-decode.js";
import { MhfeEncodeTab } from "./recovery-mhfe-encode.js";
import { FAST_MODE_THREADS, MhfeEngine } from "./recovery-mhfe-engine.js";
import {
  installMnemonicSourceDiagnostic,
  installSecretToggle,
  leadParagraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** The one warning of the MHFE panel: what MHFE is, what recovery needs, and how fast this page runs. */
function renderSpeedNotice(fastMode: boolean): void {
  const experimental = leadParagraph(
    "Experimental.",
    "MHFE has not had enough independent review to protect real funds. Recovery needs the password, and the " +
      "PIM or memory level if you changed them.",
  );
  const speed = fastMode
    ? leadParagraph(
        "Fast mode:",
        "all four processor cores are in use; a recovery takes about one and a half minutes.",
      )
    : leadParagraph(
        "Slow mode:",
        "in this HTML version the browser lets MHFE use one processor core, so a recovery takes about four to " +
          "seven minutes. For about one and a half minutes, use the executable version of this tool.",
      );
  required<HTMLElement>("#mhfe-mode").replaceChildren(experimental, speed);
  required<HTMLElement>("#mhfe-runtime").textContent = fastMode
    ? `Active · ${FAST_MODE_THREADS} threads`
    : "Inactive · 1 thread · use the executable version";
}

function installMhfe(context: RecoveryFeatureContext): void {
  const engine = new MhfeEngine();
  renderSpeedNotice(engine.fastMode);
  installSecretToggle("#toggle-mhfe-source", "#mhfe-source", "Show", "Hide", "recovery phrase");
  installMnemonicSourceDiagnostic(context, "mhfe", "#mhfe-source", "#toggle-mhfe-source");
  new MhfeEncodeTab(context, engine);
  new MhfeDecodeTab(context, engine);
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
