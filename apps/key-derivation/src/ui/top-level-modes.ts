declare const __CKD_HAS_RECOVERY__: boolean;

export function installTopLevelModes(): Readonly<{ setMode(mode: 'derive' | 'recovery'): void }> {
  const deriveTab = document.querySelector<HTMLButtonElement>('#derive-generate-mode');
  const recoveryTab = document.querySelector<HTMLButtonElement>('#recovery-backup-mode');
  const derivePanels = [...document.querySelectorAll<HTMLElement>('.derive-only')];
  const recoveryPanels = [...document.querySelectorAll<HTMLElement>('.recovery-only')];
  if (deriveTab === null || (__CKD_HAS_RECOVERY__ && recoveryTab === null))
    throw new Error('Key Derivation mode tabs are missing.');
  const setMode = (mode: 'derive' | 'recovery'): void => {
    const recovery = mode === 'recovery';
    deriveTab.classList.toggle('active', !recovery);
    recoveryTab?.classList.toggle('active', recovery);
    deriveTab.setAttribute('aria-selected', String(!recovery));
    recoveryTab?.setAttribute('aria-selected', String(recovery));
    for (const element of derivePanels) {
      if (recovery) {
        if (element.dataset.hiddenBeforeRecovery === undefined) {
          element.dataset.hiddenBeforeRecovery = String(element.hidden);
        }
        element.hidden = true;
      } else if (element.dataset.hiddenBeforeRecovery !== undefined) {
        element.hidden = element.dataset.hiddenBeforeRecovery === 'true';
        delete element.dataset.hiddenBeforeRecovery;
      }
    }
    for (const element of recoveryPanels) element.hidden = !recovery;
    document.body.dataset.walletMode = mode;
  };
  setMode('derive');
  deriveTab.addEventListener('click', () => setMode('derive'));
  recoveryTab?.addEventListener('click', () => setMode('recovery'));
  return { setMode };
}
