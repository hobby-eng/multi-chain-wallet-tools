import type { DerivationResult } from '@ckd/core/types.js';
import { coreImportCommand } from './descriptor-export.js';

interface AccountExportDependencies {
  document: Document;
  buttons: Readonly<Record<string, HTMLButtonElement>>;
  result(): DerivationResult | null;
  secretsRevealed(): boolean;
  copyText(button: HTMLButtonElement, text: string, containsSecret: boolean): Promise<void>;
  downloadText(text: string, filename: string, mimeType: string): void;
  showError(message: string): void;
  showStatus(message: string): void;
}

export function installAccountExportController(dependencies: AccountExportDependencies): void {
  for (const [action, button] of Object.entries(dependencies.buttons)) {
    button.addEventListener('click', () => {
      const bundle = dependencies.result()?.accountDescriptors;
      if (bundle === undefined) return;
      const privateExport = action === 'privateCopy' || action === 'privateDownload';
      if (privateExport && !dependencies.secretsRevealed()) {
        dependencies.showError('Reveal sensitive values before exporting private descriptors.');
        return;
      }
      const descriptors = privateExport ? bundle.privateText : bundle.publicText;
      const coreFormat =
        dependencies.document.querySelector<HTMLSelectElement>('#account-export-format')!.value === 'core';
      let text = descriptors;
      try {
        if (coreFormat) text = coreImportCommand(descriptors);
      } catch (cause) {
        dependencies.showError(cause instanceof Error ? cause.message : 'Unable to prepare account export.');
        return;
      }
      if (action === 'publicDownload' || action === 'privateDownload') {
        const filename = `${bundle.fileStem}.${privateExport ? 'PRIVATE' : 'public'}.${coreFormat ? 'core-import' : 'descriptors'}.txt`;
        dependencies.downloadText(text, filename, 'text/plain');
        dependencies.showStatus(
          privateExport
            ? `Created ${filename}. Contains unencrypted account private keys.`
            : `Created ${filename}. Public account data; cannot spend.`,
        );
      } else {
        void dependencies.copyText(button, text, privateExport);
      }
    });
  }
}
