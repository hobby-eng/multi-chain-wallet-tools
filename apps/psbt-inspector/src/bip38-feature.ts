import { decryptBip38Key } from './bip38-decryptor.js';
import { copyPlainText, required, syncNetworkChoice, textElement } from './ui-common.js';

export function installBip38Feature(): void {
  const chain = required<HTMLSelectElement>('bip38-chain');
  const network = required<HTMLSelectElement>('bip38-network');
  const encryptedKey = required<HTMLTextAreaElement>('bip38-encrypted-key');
  const password = required<HTMLInputElement>('bip38-password');
  const togglePassword = required<HTMLButtonElement>('toggle-bip38-password');
  const decryptButton = required<HTMLButtonElement>('decrypt-bip38');
  const clearButton = required<HTMLButtonElement>('clear-bip38');
  const errorBox = required<HTMLElement>('bip38-error');
  const progress = required<HTMLElement>('bip38-progress');
  const results = required<HTMLElement>('bip38-results');
  const resultList = required<HTMLElement>('bip38-result-list');
  const toggleResult = required<HTMLButtonElement>('toggle-bip38-result');
  let revision = 0;
  let revealed = false;

  const setResultVisibility = (value: boolean): void => {
    revealed = value;
    for (const input of resultList.querySelectorAll<HTMLInputElement>('[data-bip38-secret]'))
      input.type = value ? 'text' : 'password';
    for (const button of resultList.querySelectorAll<HTMLButtonElement>('[data-copy-bip38-secret]'))
      button.disabled = !value;
    toggleResult.textContent = value ? 'Hide private keys' : 'Reveal private keys';
    toggleResult.setAttribute('aria-pressed', String(value));
  };

  const clear = (): void => {
    revision += 1;
    encryptedKey.value = '';
    password.value = '';
    password.type = 'password';
    togglePassword.textContent = 'Show';
    togglePassword.setAttribute('aria-pressed', 'false');
    resultList.replaceChildren();
    setResultVisibility(false);
    toggleResult.disabled = true;
    results.hidden = true;
    errorBox.hidden = true;
    progress.hidden = true;
    decryptButton.disabled = false;
    decryptButton.textContent = 'Decrypt keys';
  };

  const appendSecret = (label: string, value: string, copyLabel: string): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'bip38-secret-output';
    const input = document.createElement('input');
    input.type = revealed ? 'text' : 'password';
    input.readOnly = true;
    input.value = value;
    input.dataset.bip38Secret = 'true';
    const copy = textElement('button', 'secondary compact', copyLabel) as HTMLButtonElement;
    copy.type = 'button';
    copy.disabled = !revealed;
    copy.dataset.copyBip38Secret = 'true';
    copy.addEventListener('click', () => void copyPlainText(value));
    row.append(textElement('label', '', label), input, copy);
    return row;
  };

  const appendSuccess = (position: number, value: Awaited<ReturnType<typeof decryptBip38Key>>): void => {
    const card = document.createElement('article');
    card.className = 'bip38-result-card';
    const addressRow = document.createElement('div');
    addressRow.className = 'policy-row';
    const copyAddress = textElement('button', 'secondary compact', 'Copy') as HTMLButtonElement;
    copyAddress.type = 'button';
    copyAddress.addEventListener('click', () => void copyPlainText(value.address));
    addressRow.append(
      textElement('span', '', 'Verified P2PKH address'),
      textElement('code', '', value.address),
      copyAddress,
    );
    const compression = document.createElement('div');
    compression.className = 'policy-row';
    compression.append(
      textElement('span', '', 'Public-key encoding'),
      textElement('code', '', value.compressed ? 'Compressed public key' : 'Uncompressed public key'),
    );
    card.append(
      textElement('h3', '', `Recovered key #${position}`),
      addressRow,
      compression,
      appendSecret('Private key · WIF', value.wif, 'Copy WIF'),
      appendSecret('Private key · hexadecimal', value.privateKeyHex, 'Copy hex'),
    );
    resultList.append(card);
  };

  const appendFailure = (position: number, cause: unknown): void => {
    const card = document.createElement('article');
    card.className = 'bip38-result-card bip38-result-error';
    card.append(
      textElement('h3', '', `Key #${position} could not be decrypted`),
      textElement('p', '', cause instanceof Error ? cause.message : String(cause)),
    );
    resultList.append(card);
  };

  const decrypt = async (): Promise<void> => {
    errorBox.hidden = true;
    progress.hidden = true;
    resultList.replaceChildren();
    setResultVisibility(false);
    toggleResult.disabled = true;
    const keys = [
      ...new Set(
        encryptedKey.value
          .split(/[\s,;]+/u)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (keys.length === 0 || keys.length > 200 || password.value.length === 0) {
      errorBox.textContent =
        keys.length === 0
          ? 'Enter at least one BIP38 encrypted private key.'
          : keys.length > 200
            ? 'Decrypt at most 200 BIP38 keys in one batch.'
            : 'Enter the BIP38 password.';
      errorBox.hidden = false;
      return;
    }
    decryptButton.disabled = true;
    decryptButton.textContent = 'Decrypting…';
    const current = ++revision;
    const secret = password.value;
    results.hidden = false;
    let succeeded = 0;
    let failed = 0;
    try {
      const selectedChain = chain.value === 'dash' ? 'dash' : 'bitcoin';
      const networkName = network.value === 'mainnet' ? 'mainnet' : 'testnet';
      for (const [index, key] of keys.entries()) {
        if (current !== revision) return;
        progress.textContent = `Decrypting ${index + 1} of ${keys.length}…`;
        progress.hidden = false;
        try {
          appendSuccess(index + 1, await decryptBip38Key(key, secret, selectedChain, networkName));
          succeeded += 1;
          toggleResult.disabled = false;
        } catch (cause) {
          appendFailure(index + 1, cause);
          failed += 1;
        }
      }
      password.value = '';
      password.type = 'password';
      togglePassword.textContent = 'Show';
      togglePassword.setAttribute('aria-pressed', 'false');
      progress.textContent = `Finished ${keys.length} keys · ${succeeded} recovered${failed === 0 ? '' : ` · ${failed} failed`}.`;
    } finally {
      if (current === revision) {
        decryptButton.disabled = false;
        decryptButton.textContent = 'Decrypt keys';
      }
    }
  };

  decryptButton.addEventListener('click', () => void decrypt());
  clearButton.addEventListener('click', clear);
  togglePassword.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    togglePassword.textContent = show ? 'Hide' : 'Show';
    togglePassword.setAttribute('aria-pressed', String(show));
  });
  toggleResult.addEventListener('click', () => setResultVisibility(!revealed));
  chain.addEventListener('change', () => syncNetworkChoice(chain, network));
  syncNetworkChoice(chain, network);
  const conceal = (): void => {
    password.type = 'password';
    togglePassword.textContent = 'Show';
    togglePassword.setAttribute('aria-pressed', 'false');
    setResultVisibility(false);
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && conceal());
  window.addEventListener('blur', conceal);
}
