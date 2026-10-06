// Recover & Back Up: the host its feature modules plug into. It owns what every panel shares (tabs,
// help popovers, the job gate and phrases linked from Generate & Derive) and installs the modules
// the build selected; it knows no feature by name.
import type { CoinRegistry } from "@ckd/coins/registry-base.js";
import type { WalletMatcherTargetDetector } from "@ckd/recovery/matcher-types.js";
import type { RecoverySourceReceiver } from "./recovery-source-link.js";
import { selectedRecoveryFeatures } from "./recovery-feature-selection.js";
import { HelpPopovers } from "./recovery-help-popovers.js";
import { RecoveryJobGate, bindJobGate } from "./recovery-job-gate.js";
import { LinkedSources } from "./recovery-linked-sources.js";
import { installTabs, required } from "./recovery-workspace-shared.js";

interface RecoveryWorkspaceOptions {
  readonly registry: CoinRegistry;
  readonly detectTargets: WalletMatcherTargetDetector;
  readonly mnemonicToSeed: (mnemonic: string, passphrase: string) => Uint8Array;
  readonly writeClipboard: (value: string) => Promise<void>;
  readonly downloadText: (text: string, fileName: string, mimeType: string) => void;
  readonly useMnemonicInDeriver: (mnemonic: string, passphrase?: string) => void;
}

export function installRecoveryWorkspace(
  options: RecoveryWorkspaceOptions,
): RecoverySourceReceiver {
  const jobs = new RecoveryJobGate();
  bindJobGate(
    jobs,
    [...document.querySelectorAll<HTMLButtonElement>("#recovery-workspace button.primary")],
    required<HTMLElement>("#recovery-busy"),
  );
  installTabs(document, "[data-recovery-tab]", "[data-recovery-panel]");
  new HelpPopovers().install(document);
  for (const method of document.querySelectorAll<HTMLElement>(".backup-method")) {
    installTabs(method, "[data-operation-tab]", "[data-operation-panel]");
  }
  const sources = new LinkedSources(
    selectedRecoveryFeatures.flatMap((feature) =>
      feature.phraseSlot === undefined ? [] : [feature.phraseSlot],
    ),
  );
  const context = {
    ...options,
    jobs,
    readMnemonic: sources.readMnemonic.bind(sources),
    linkedValue: sources.linkedValue.bind(sources),
    linkedSourceRevealed: sources.isRevealed.bind(sources),
  };
  for (const feature of selectedRecoveryFeatures) feature.install(context);
  sources.install();
  return {
    useSource: (reference, target) => sources.use(reference, target),
    offerSource: (reference) => sources.offer(reference),
    setCryptoEnabled: (enabled) => jobs.setReady(enabled),
  };
}
