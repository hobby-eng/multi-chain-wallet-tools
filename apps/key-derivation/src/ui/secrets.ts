export { clearDerivationResult } from '@ckd/core/secrets.js';

export function clearRenderedSecrets(root: HTMLElement): void {
  for (const element of root.querySelectorAll<HTMLElement>('.secret-value')) {
    // This removes visible references. Browser-managed string memory cannot be securely overwritten.
    element.textContent = '';
  }
  root.replaceChildren();
}
