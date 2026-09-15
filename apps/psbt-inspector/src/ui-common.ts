import type { PsbtChain, PsbtNetwork } from './psbt.js';

export function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing required element #${id}.`);
  return element as T;
}

export function textElement(tag: keyof HTMLElementTagNameMap, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export async function copyPlainText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function selectedNetwork(select: HTMLSelectElement, chain: PsbtChain): PsbtNetwork {
  if (chain === 'bitcoin' && select.value === 'regtest') return 'regtest';
  return select.value === 'testnet' ? 'testnet' : 'mainnet';
}

export function syncNetworkChoice(chainControl: HTMLSelectElement, networkControl: HTMLSelectElement): void {
  const regtest = networkControl.querySelector<HTMLOptionElement>('option[value="regtest"]');
  const dash = chainControl.value === 'dash';
  if (regtest !== null) regtest.disabled = dash;
  if (dash && networkControl.value === 'regtest') networkControl.value = 'testnet';
}

export function downloadText(filename: string, value: string, type: string): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
