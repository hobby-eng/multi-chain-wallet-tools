import type { PsbtChain, PsbtNetwork } from "./psbt.js";
import { InspectorNetworkChoice } from "./network-choice.js";

export function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing required element #${id}.`);
  return element as T;
}

export function textElement(
  tag: keyof HTMLElementTagNameMap,
  className: string,
  text: string,
): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export async function copyPlainText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function selectedNetwork(select: HTMLSelectElement, chain: PsbtChain): PsbtNetwork {
  return new InspectorNetworkChoice(chain, select.value).network;
}

export function syncNetworkChoice(
  chainControl: HTMLSelectElement,
  networkControl: HTMLSelectElement,
): void {
  const regtest = networkControl.querySelector<HTMLOptionElement>('option[value="regtest"]');
  const network = InspectorNetworkChoice.transition(chainControl.value, networkControl.value);
  if (regtest !== null)
    regtest.disabled = !InspectorNetworkChoice.offers(chainControl.value, "regtest");
  networkControl.value = network;
}
