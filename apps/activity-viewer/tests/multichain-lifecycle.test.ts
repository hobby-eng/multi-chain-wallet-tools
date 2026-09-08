import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActivityViewerView } from '../src/view.js';
import { installMultiChainActivity } from '../src/multichain-activity.js';
import { emptyHistory } from '../../discovery-scanner/src/history.js';

const network = vi.hoisted(() => ({ addressHistory: vi.fn(), utxoAddresses: vi.fn(), evmAccounts: vi.fn() }));
vi.mock('../../discovery-scanner/src/network-service-multichain.js', () => ({
  MultiChainRecoveryNetworkService: class {
    addressHistory = network.addressHistory;
    utxoAddresses = network.utxoAddresses;
    evmAccounts = network.evmAccounts;
  },
}));

class Control extends EventTarget {
  value = '';
  disabled = false;
  hidden = false;
  textContent = '';
  lastChild = { textContent: '' };
  previousElementSibling = { textContent: '' };
  options = [{ textContent: '' }, { textContent: '' }];
  classList = { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() };
  append = vi.fn();
  replaceChildren = vi.fn();
  click(): void { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
function fixture(batchMode = false) {
  const controls = new Map<string, Control>();
  const element = (id: string): Control => {
    if (!controls.has(id)) controls.set(id, new Control());
    return controls.get(id)!;
  };
  const document = {
    getElementById: element,
    querySelector: (selector: string) => selector === '[data-query-mode="batch"].active' ? (batchMode ? element('batch-active') : null) : element(selector.replace(/^#/u, '')),
    querySelectorAll: (selector: string) => [element(selector)],
    body: element('body'),
    createElement: () => new Control(),
  } as unknown as Document;
  element('viewer-coin').value = 'bitcoin';
  element('viewer-network').value = 'mainnet';
  const view = createActivityViewerView(document, { fingerprint: 'test' } as Parameters<typeof createActivityViewerView>[1]);
  installMultiChainActivity(document, view);
  view.setRunning(false, true, 'core');
  return { element, view };
}
const settle = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)); };
afterEach(() => vi.clearAllMocks());

describe('shared Activity Viewer query ownership', () => {
  it('locks Coin during Dash queries and lets Clear/Cancel reach the Dash owner even after a scripted coin change', async () => {
    const { element, view } = fixture();
    await settle();
    element('viewer-coin').value = 'dash';
    view.setRunning(true, true, 'core');
    expect(element('viewer-coin').disabled).toBe(true);
    element('viewer-coin').value = 'bitcoin';
    const clear = vi.fn(), cancel = vi.fn();
    element('clear-viewer').addEventListener('click', clear);
    element('cancel-button').addEventListener('click', cancel);
    element('clear-viewer').click();
    element('cancel-button').click();
    expect(clear).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    view.setRunning(false, true, 'core');
    expect(element('viewer-coin').disabled).toBe(false);
  });

  for (const action of ['clear-viewer', 'cancel-button']) {
    it(`discards a late successful Bitcoin response after ${action}`, async () => {
      const { element, view } = fixture();
      await settle();
      let resolveHistory: (value: ReturnType<typeof emptyHistory>) => void = () => {};
      network.addressHistory.mockImplementation(() => new Promise(resolve => { resolveHistory = resolve; }));
      network.utxoAddresses.mockResolvedValue([{ balance: '1' }]);
      element('full-viewing-key').value = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
      element('viewer-form').dispatchEvent(new Event('submit', { cancelable: true }));
      expect(view.isQueryRunning()).toBe(true);
      for (const id of ['viewer-coin', 'viewer-network', 'full-viewing-key', 'viewer-batch-input', '[data-query-mode]']) {
        expect(element(id).disabled).toBe(true);
      }
      const signal = network.addressHistory.mock.calls[0]![3] as AbortSignal;
      // Even a programmatic coin change must not redirect cancellation to Dash.
      element('viewer-coin').value = 'dash';
      element(action).click();
      expect(signal.aborted).toBe(true);
      resolveHistory({ ...emptyHistory('BTC', 'satoshi', 8), status: 'complete' });
      await settle();
      expect(element('viewer-results').hidden).toBe(true);
      expect(element('viewer-summary').replaceChildren).not.toHaveBeenCalled();
      expect(view.isQueryRunning()).toBe(false);
      if (action === 'clear-viewer') {
        expect(element('viewer-status').hidden).toBe(true);
        expect(element('full-viewing-key').value).toBe('');
      } else expect(element('viewer-status').textContent).toBe('Query cancelled.');
    });
  }

  it('renders a successful external query and restores shared controls', async () => {
    const { element, view } = fixture();
    await settle();
    network.addressHistory.mockResolvedValue({ ...emptyHistory('BTC', 'satoshi', 8), status: 'complete' });
    network.utxoAddresses.mockResolvedValue([{ balance: '1' }]);
    element('full-viewing-key').value = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    element('viewer-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(element('viewer-results').hidden).toBe(false);
    expect(element('viewer-summary').replaceChildren).toHaveBeenCalledOnce();
    expect(view.canStartQuery()).toBe(true);
    expect(element('viewer-coin').disabled).toBe(false);
    expect(element('cancel-button').disabled).toBe(true);
  });

  it('cannot bypass the startup self-test through an external-coin submit event', async () => {
    const { element, view } = fixture();
    await settle();
    view.setRunning(false, false, 'core');
    element('full-viewing-key').value = '1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
    element('viewer-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(network.addressHistory).not.toHaveBeenCalled();
    expect(element('scan-button').disabled).toBe(true);
  });
});

it('counts Ethereum addresses once regardless of casing, while keeping distinct accounts', async () => {
  const { element } = fixture(true);
  await settle();
  element('viewer-coin').value = 'ethereum';
  const address = '0x52908400098527886E0F7030069857D2E4169EE7';
  const other = '0xde709f2102306220921060314715629080e2fb77';
  element('viewer-batch-input').value = [address, address.toLowerCase(), other].join('\n');
  network.addressHistory.mockResolvedValue({ ...emptyHistory('ETH', 'wei', 18), status: 'complete' });
  network.evmAccounts.mockImplementation(async (_network, addresses) => ({
    blockNumber: '1', entries: addresses.map((address: string) => ({ address, balance: '1000000000000000000', nonce: '0' })),
  }));
  element('viewer-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
  expect(network.evmAccounts).toHaveBeenCalledTimes(2);
  expect(element('viewer-results-description').textContent).toBe('2 public addresses');
  const cards = element('viewer-summary').replaceChildren.mock.calls[0]! as Control[];
  expect(cards[0]!.append.mock.calls[0]![2].textContent).toBe('2 ETH');
});

for (const input of [
  '1BoatSLRHtKNngkdXEeobR76b53LETtpyT\n1BoatSLRHtKNngkdXEeobR76b53LETtpyU',
  '1BoatSLRHtKNngkdXEeobR76b53LETtpyT\n' + 'abandon '.repeat(11) + 'about',
]) it('preflights the entire batch before any network call and erases detected secrets', async () => {
  const { element } = fixture(true);
  await settle();
  element('viewer-batch-input').value = input;
  element('full-viewing-key').value = 'stale input';
  element('viewer-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
  expect(network.addressHistory).not.toHaveBeenCalled();
  expect(network.utxoAddresses).not.toHaveBeenCalled();
  expect(element('viewer-error').hidden).toBe(false);
  if (input.includes('abandon')) {
    expect(element('viewer-batch-input').value).toBe('');
    expect(element('full-viewing-key').value).toBe('');
  }
});
