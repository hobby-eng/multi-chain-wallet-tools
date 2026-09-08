import { RECOVERY_VAULT_HEIGHT } from './network-protocol.js';

export function installVaultViewportBridge(): void {
  const reportHeight = (): void => {
    const height = Math.ceil([...document.body.children].reduce((bottom, element) => {
      if (!(element instanceof HTMLElement) || getComputedStyle(element).position === 'fixed') return bottom;
      return Math.max(bottom, element.getBoundingClientRect().bottom + window.scrollY);
    }, 0));
    window.parent.postMessage({ type: RECOVERY_VAULT_HEIGHT, height }, '*');
  };

  const observer = new ResizeObserver(reportHeight);
  observer.observe(document.body);
  window.addEventListener('load', reportHeight);
  reportHeight();
}
