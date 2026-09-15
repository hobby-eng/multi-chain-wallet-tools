import { verifySignedMessage } from './message-verifier.js';
import { required, selectedNetwork, syncNetworkChoice } from './ui-common.js';

export function installMessageVerificationFeature(): void {
  const chain = required<HTMLSelectElement>('verify-chain');
  const network = required<HTMLSelectElement>('verify-network');
  const address = required<HTMLInputElement>('verify-address');
  const message = required<HTMLTextAreaElement>('verify-message');
  const signature = required<HTMLTextAreaElement>('verify-signature');
  const verifyButton = required<HTMLButtonElement>('verify-message-button');
  const clearButton = required<HTMLButtonElement>('clear-verifier');
  const errorBox = required<HTMLElement>('verify-error');
  const results = required<HTMLElement>('verify-results');
  const validity = required<HTMLElement>('verify-validity');
  const format = required<HTMLElement>('verify-format');
  const magic = required<HTMLElement>('verify-magic');
  const recoveredAddress = required<HTMLElement>('verify-recovered-address');
  const recoveredKey = required<HTMLElement>('verify-recovered-key');
  const timeConstraints = required<HTMLElement>('verify-time-constraints');
  let revision = 0;

  const invalidate = (): void => {
    revision += 1;
    results.hidden = true;
    errorBox.hidden = true;
  };
  for (const control of [address, message, signature, chain, network]) {
    control.addEventListener('input', invalidate);
    control.addEventListener('change', invalidate);
  }
  verifyButton.addEventListener('click', () => {
    const current = ++revision;
    errorBox.hidden = true;
    results.hidden = true;
    void verifySignedMessage(
      address.value,
      message.value,
      signature.value,
      chain.value === 'dash' ? 'dash' : 'bitcoin',
      selectedNetwork(network, chain.value === 'dash' ? 'dash' : 'bitcoin'),
    )
      .then((verification) => {
        if (current !== revision) return;
        validity.textContent = verification.valid
          ? 'VALID · the signature satisfies the claimed address and exact message'
          : 'INVALID · the signature does not satisfy the claimed address and exact message';
        format.textContent = verification.format;
        magic.textContent = verification.messageMagic;
        recoveredAddress.textContent = verification.recoveredAddress ?? address.value.trim();
        recoveredKey.textContent = verification.recoveredPublicKey ?? 'Not exposed by this BIP-322 proof';
        timeConstraints.textContent = verification.timeConstraints;
        results.hidden = false;
      })
      .catch((cause: unknown) => {
        if (current !== revision) return;
        errorBox.textContent = cause instanceof Error ? cause.message : String(cause);
        errorBox.hidden = false;
      });
  });
  clearButton.addEventListener('click', () => {
    invalidate();
    address.value = '';
    message.value = '';
    signature.value = '';
  });
  chain.addEventListener('change', () => syncNetworkChoice(chain, network));
  syncNetworkChoice(chain, network);
}
