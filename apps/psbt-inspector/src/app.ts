import { BUILD_INFO } from "@ckd/build-info";
import { installSelectedPsbtFeatures, selectedSelfTests } from "./feature-selection.js";
import { InspectorSelfTest } from "./self-test.js";
import { required } from "./ui-common.js";

declare const __PSBT_FEATURES__: readonly string[];
const enabledFeatures = new Set(__PSBT_FEATURES__);
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
const modeFeature: Readonly<Record<string, readonly string[]>> = {
  inspector: ["psbt-decoder"],
  script: ["script-decoder", "descriptor-decoder"],
  builder: ["policy-builder"],
  wallet: ["multisig-wallet"],
  verify: ["message-verification"],
  bip38: ["bip38-decrypt"],
};
const panels = new Map<string, HTMLElement>();
for (const mode of Object.keys(modeFeature)) {
  const panel = document.getElementById(`${mode}-panel`);
  if (panel !== null) panels.set(mode, panel);
}

for (const button of modeButtons) {
  const requiredFeatures = modeFeature[button.dataset.mode ?? ""] ?? [];
  button.hidden = !requiredFeatures.some((feature) => enabledFeatures.has(feature));
  // Every workflow opens only after the startup self-test has passed.
  button.disabled = true;
  button.addEventListener("click", () => {
    const mode = button.dataset.mode ?? "";
    for (const [panelMode, panel] of panels) panel.hidden = panelMode !== mode;
    for (const item of modeButtons) {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    }
  });
}

installSelectedPsbtFeatures();
required<HTMLElement>("psbt-build-version").textContent = BUILD_INFO.version;
required<HTMLElement>("psbt-build-date").textContent = BUILD_INFO.releaseDate;
required<HTMLElement>("psbt-build-fingerprint").textContent = BUILD_INFO.fingerprint;
required<HTMLElement>("psbt-artifact-checksum-file").textContent = BUILD_INFO.checksumFile;
required<HTMLElement>("psbt-build-footer").textContent = `Build ${BUILD_INFO.version}`;

void new InspectorSelfTest(selectedSelfTests()).start().then((passed) => {
  if (!passed) {
    // A failed self-test keeps every workflow closed.
    for (const panel of panels.values()) panel.hidden = true;
    return;
  }
  for (const button of modeButtons) button.disabled = false;
  modeButtons.find((button) => !button.hidden)?.click();
});
