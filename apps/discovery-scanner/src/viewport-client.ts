import { RECOVERY_VAULT_HEIGHT } from './network-protocol.js';

export function installVaultViewportBridge(): void {
  const reportHeight = (): void => {
    const height = Math.ceil([...document.body.children].reduce((bottom, element) => {
      if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) return bottom;
      const position = getComputedStyle(element).position;
      if (position === 'fixed' || position === 'absolute') return bottom;
      return Math.max(bottom, element.getBoundingClientRect().bottom + window.scrollY);
    }, 0));
    window.parent.postMessage({ type: RECOVERY_VAULT_HEIGHT, height }, '*');
  };

  const observer = new ResizeObserver(reportHeight);
  observer.observe(document.body);
  // The body may keep the old iframe height through min-height:100vh when
  // a tab or result collapses. Observe content boxes so shrinking still reports.
  for (const element of document.body.children) {
    if (element instanceof HTMLElement) observer.observe(element);
  }
  window.addEventListener('load', reportHeight);
  window.addEventListener('resize', reportHeight);
  reportHeight();
}
