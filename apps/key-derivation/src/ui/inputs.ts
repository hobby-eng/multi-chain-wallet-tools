import {
  COIN_FAMILIES,
  getAdapterFamilyId,
  getCoinFamily,
  type CoinAdapter,
  type CoinDerivationInput,
} from '@ckd/coins/registry.js';

export interface DerivationControls {
  coin: HTMLSelectElement;
  protocolTabs: HTMLElement;
  network: HTMLSelectElement;
  networkField: HTMLElement;
  accountField: HTMLElement;
  accountLabel: HTMLLabelElement;
  account: HTMLInputElement;
  branchField: HTMLElement;
  branchLabel: HTMLLabelElement;
  branchInput: HTMLInputElement;
  branchSelect: HTMLSelectElement;
  changeField: HTMLElement;
  includeChange: HTMLInputElement;
  startLabel: HTMLLabelElement;
  start: HTMLInputElement;
  countLabel: HTMLLabelElement;
  count: HTMLInputElement;
  preview: HTMLElement;
}

export type DerivationControlValues = Omit<CoinDerivationInput, 'seed'> & {
  includeChange: boolean;
};

const DEFAULT_INDEX_MAX = 2_147_483_647;

function setNumeric(input: HTMLInputElement, value: number, max = 2_147_483_647): void {
  input.value = String(value);
  input.min = '0';
  input.max = String(max);
  input.step = '1';
}

export function populateCoinSelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  for (const family of COIN_FAMILIES) {
    const option = document.createElement('option');
    option.value = family.id;
    option.textContent = family.label;
    select.append(option);
  }
}

function renderProtocolTabs(adapter: CoinAdapter, controls: DerivationControls): void {
  controls.protocolTabs.replaceChildren();
  const family = getCoinFamily(getAdapterFamilyId(adapter));
  for (const variant of family.adapters) {
    const button = document.createElement('button');
    const selected = variant.id === adapter.id;
    button.type = 'button';
    button.className = `protocol-tab${selected ? ' active' : ''}`;
    button.dataset.adapterId = variant.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.textContent = variant.variantLabel;
    controls.protocolTabs.append(button);
  }
}

export function configureControls(
  adapter: CoinAdapter,
  controls: DerivationControls,
  remembered?: DerivationControlValues,
): void {
  const defaults = adapter.defaults;
  const values: DerivationControlValues = remembered ?? { ...defaults, includeChange: false };
  controls.coin.value = getAdapterFamilyId(adapter);
  renderProtocolTabs(adapter, controls);
  controls.network.replaceChildren();
  for (const network of ['mainnet', 'testnet'] as const) {
    const option = document.createElement('option');
    option.value = network;
    option.textContent = network === 'mainnet' ? 'Mainnet' : 'Testnet';
    controls.network.append(option);
  }
  controls.network.value = values.network;
  controls.network.disabled = !adapter.networkControl;
  controls.networkField.classList.toggle('control-disabled', !adapter.networkControl);
  controls.accountField.hidden = adapter.accountControl === false;
  controls.accountLabel.textContent = adapter.controlLabels?.account ?? 'Account';
  controls.startLabel.textContent = adapter.controlLabels?.start ?? 'Start index';
  controls.countLabel.textContent = adapter.controlLabels?.count ?? 'Number of results';
  setNumeric(controls.account, values.account, adapter.limits?.accountMax ?? DEFAULT_INDEX_MAX);
  setNumeric(controls.start, values.start, adapter.limits?.startMax ?? DEFAULT_INDEX_MAX);
  setNumeric(controls.count, values.count, (adapter.limits?.startMax ?? DEFAULT_INDEX_MAX) + 1);

  const branch = adapter.branchControl;
  controls.branchField.hidden = branch === undefined;
  if (branch !== undefined) {
    controls.branchLabel.textContent = branch.label;
    if (branch.options === undefined) {
      controls.branchSelect.hidden = true;
      controls.branchInput.hidden = false;
      controls.branchLabel.htmlFor = controls.branchInput.id;
      setNumeric(controls.branchInput, values.branch, branch.max);
    } else {
      controls.branchInput.hidden = true;
      controls.branchSelect.hidden = false;
      controls.branchLabel.htmlFor = controls.branchSelect.id;
      controls.branchSelect.replaceChildren();
      for (const item of branch.options) {
        const option = document.createElement('option');
        option.value = String(item.value);
        option.textContent = item.label;
        controls.branchSelect.append(option);
      }
      controls.branchSelect.value = String(values.branch);
    }
  }
  controls.changeField.hidden = adapter.addressBranches === undefined;
  controls.includeChange.checked = adapter.addressBranches !== undefined && values.includeChange;
  updatePathPreview(adapter, controls);
}

function numericValue(input: HTMLInputElement | HTMLSelectElement, label: string, min = 0, max = DEFAULT_INDEX_MAX): number {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

export function readControls(adapter: CoinAdapter, controls: DerivationControls): DerivationControlValues {
  const accountMax = adapter.limits?.accountMax ?? DEFAULT_INDEX_MAX;
  const startMax = adapter.limits?.startMax ?? DEFAULT_INDEX_MAX;
  const branch = adapter.addressBranches?.receive ?? (adapter.branchControl === undefined
    ? adapter.defaults.branch
    : numericValue(
      adapter.branchControl.options === undefined ? controls.branchInput : controls.branchSelect,
      adapter.branchControl.label,
      0,
      adapter.branchControl.max,
    ));
  const start = numericValue(controls.start, 'Start index', 0, startMax);
  const count = numericValue(controls.count, 'Number of results', 1, startMax + 1);
  if (start + count - 1 > startMax) {
    throw new Error(`The requested index range exceeds ${startMax}.`);
  }
  const network = controls.network.value;
  if (network !== 'mainnet' && network !== 'testnet') {
    throw new Error(`Unsupported network: ${network || '(empty)'}.`);
  }
  return {
    network,
    account: numericValue(controls.account, 'Account', 0, accountMax),
    branch,
    start,
    count,
    includeChange: adapter.addressBranches !== undefined && controls.includeChange.checked,
  };
}

export function updatePathPreview(adapter: CoinAdapter, controls: DerivationControls): void {
  try {
    const { includeChange, ...input } = readControls(adapter, controls);
    const receivePath = adapter.pathPreview(input);
    if (!includeChange || adapter.addressBranches === undefined) {
      controls.preview.textContent = receivePath;
      return;
    }
    const changePath = adapter.pathPreview({ ...input, branch: adapter.addressBranches.change });
    controls.preview.textContent = `Receive: ${receivePath} · Change: ${changePath}`;
  } catch {
    controls.preview.textContent = 'Enter valid integer controls to preview the path.';
  }
}
