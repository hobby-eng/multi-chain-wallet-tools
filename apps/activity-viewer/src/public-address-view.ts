import type { BUILD_INFO } from '@ckd/build-info';
import type { ExternalActivityHostView } from './external-activity.js';

function required<T extends HTMLElement>(document: Document, selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Required Activity Viewer element is missing: ${selector}.`);
  return element;
}

/** Minimal host UI for Bitcoin/Ethereum public-address builds. */
export function createPublicAddressActivityView(
  document: Document,
  buildInfo: typeof BUILD_INFO,
): ExternalActivityHostView {
  const scan = required<HTMLButtonElement>(document, '#scan-button');
  const cancel = required<HTMLButtonElement>(document, '#cancel-button');
  const clear = required<HTMLButtonElement>(document, '#clear-viewer');
  const coin = required<HTMLSelectElement>(document, '#viewer-coin');
  const network = required<HTMLSelectElement>(document, '#viewer-network');
  const single = required<HTMLInputElement>(document, '#full-viewing-key');
  const batch = required<HTMLTextAreaElement>(document, '#viewer-batch-input');
  const singlePanel = required<HTMLElement>(document, '#viewer-single-input-panel');
  const batchPanel = required<HTMLElement>(document, '#viewer-batch-input-panel');
  const queryButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-query-mode]')];
  let running = false;
  required<HTMLElement>(document, '#viewer-history-field').hidden = true;
  scan.disabled = false;

  for (const button of queryButtons) {
    button.addEventListener('click', () => {
      const batchMode = button.dataset.queryMode === 'batch';
      singlePanel.hidden = batchMode;
      batchPanel.hidden = !batchMode;
      for (const candidate of queryButtons) {
        const active = candidate === button;
        candidate.classList.toggle('active', active);
        candidate.setAttribute('aria-pressed', String(active));
      }
    });
  }

  required<HTMLElement>(document, '#viewer-build-version').textContent = buildInfo.version;
  required<HTMLElement>(document, '#viewer-build-date').textContent = buildInfo.releaseDate;
  required<HTMLElement>(document, '#viewer-build-edition').textContent = buildInfo.edition;
  required<HTMLElement>(document, '#viewer-build-profile').textContent = buildInfo.profile;
  required<HTMLElement>(document, '#viewer-build-fingerprint').textContent = buildInfo.fingerprint;
  required<HTMLElement>(document, '#viewer-artifact-checksum-file').textContent = buildInfo.checksumFile;
  required<HTMLElement>(document, '#viewer-build-footer').textContent =
    `v${buildInfo.version} · ${buildInfo.fingerprint.slice(0, 16)}…`;

  return {
    canStartQuery: () => !running,
    isQueryRunning: () => running,
    setExternalRunning(value: boolean): void {
      running = value;
      document.body.classList.toggle('viewer-is-scanning', value);
      scan.disabled = value;
      cancel.disabled = !value;
      clear.disabled = value;
      coin.disabled = value;
      network.disabled = value;
      single.disabled = value;
      batch.disabled = value;
      for (const button of queryButtons) button.disabled = value;
    },
  };
}
