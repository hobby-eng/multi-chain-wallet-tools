// Recover & Back Up: the host its feature modules plug into. It owns what every panel shares (tabs,
// help popovers, the job gate and phrases linked from Generate & Derive) and installs the modules
// the build selected; it knows no feature by name.
import { fullSelfTestParts, type HeavyJobs } from "./full-self-test.js";
import type { RecoverySourceReceiver } from "./recovery-source-link.js";
import { selectedRecoveryFeatures } from "./recovery-feature-selection.js";
import { HelpPopovers } from "./recovery-help-popovers.js";
import { RecoveryJobGate, bindJobGate } from "./recovery-job-gate.js";
import { LinkedSources } from "./recovery-linked-sources.js";
import { installTabs, required, type RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import { RecoveryUiSelfTest } from "./recovery-ui-self-test.js";

/** What the page gives Recover & Back Up: the services its modules' context passes on. */
type RecoveryWorkspaceOptions = Pick<
  RecoveryFeatureContext,
  | "registry"
  | "detectTargets"
  | "mnemonicToSeed"
  | "writeClipboard"
  | "downloadText"
  | "useMnemonicInDeriver"
>;

/** What the page uses of Recover & Back Up: its linked sources and its one-heavy-job gate. */
export interface RecoveryWorkspace extends RecoverySourceReceiver {
  readonly jobs: HeavyJobs;
  onSelfTestFailure(listener: (cause: unknown) => void): void;
}

export function installRecoveryWorkspace(options: RecoveryWorkspaceOptions): RecoveryWorkspace {
  RecoverySecretLifecycle.install(document);
  fullSelfTestParts.add(async () => RecoveryUiSelfTest.run());
  const jobs = new RecoveryJobGate();
  const failureListeners: ((cause: unknown) => void)[] = [];
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
    mnemonicToSeed: readyOperation(jobs, options.mnemonicToSeed),
    writeClipboard: readyOperation(jobs, options.writeClipboard),
    downloadText: readyOperation(jobs, options.downloadText),
    useMnemonicInDeriver: readyOperation(jobs, options.useMnemonicInDeriver),
    readMnemonic: readyOperation(jobs, sources.readMnemonic.bind(sources)),
    useRecoverySource: readyOperation(jobs, sources.use.bind(sources)),
    linkedValue: readyOperation(jobs, sources.linkedValue.bind(sources)),
    linkedSourceRevealed: sources.isRevealed.bind(sources),
    selfTestFailed: (cause: unknown) => {
      jobs.setReady(false);
      for (const listener of failureListeners) listener(cause);
    },
  };
  for (const feature of selectedRecoveryFeatures) feature.install(context);
  sources.install();
  return {
    useSource: (reference, target) => sources.use(reference, target),
    offerSource: (reference) => sources.offer(reference),
    setCryptoEnabled: (enabled) => {
      if (enabled) {
        jobs.setReady(false);
        RecoveryUiSelfTest.run();
      }
      jobs.setReady(enabled);
    },
    jobs,
    onSelfTestFailure: (listener) => failureListeners.push(listener),
  };
}

/** Old result callbacks use the same readiness rule as newly pressed feature controls. */
function readyOperation<Arguments extends unknown[], Result>(
  jobs: RecoveryJobGate,
  operation: (...args: Arguments) => Result,
): (...args: Arguments) => Result {
  return (...args) => {
    jobs.assertReady();
    return operation(...args);
  };
}
