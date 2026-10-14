import { textLines } from "@ckd/core/text-lines.js";
export function requireQueryElement<T extends Element>(
  document: Document,
  selector: string,
  context = "Application template",
): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`${context} is missing ${selector}.`);
  return element;
}

export function requireIdElement<T extends HTMLElement>(
  document: Document,
  id: string,
  context = "Application template",
): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`${context} is missing #${id}.`);
  return element as T;
}

/** Numbers the lines of `textarea` in `gutter`, one number a line, scrolled with the text. */
export function updateLineNumbers(textarea: HTMLTextAreaElement, gutter: HTMLElement): void {
  const count = Math.max(1, textLines(textarea.value).length);
  gutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join("\n");
  gutter.scrollTop = textarea.scrollTop;
}

/** Keeps the line numbers of `textarea` in `gutter` as it is typed in and scrolled. */
export function installNumberedInput(textarea: HTMLTextAreaElement, gutter: HTMLElement): void {
  const update = (): void => updateLineNumbers(textarea, gutter);
  textarea.addEventListener("input", update);
  textarea.addEventListener("scroll", update);
  update();
}

export function installSynchronizedNumberedInputs(
  inputs: ReadonlyArray<{ textarea: HTMLTextAreaElement; gutter: HTMLElement }>,
): void {
  let synchronizing = false;
  const update = (source?: HTMLTextAreaElement): void => {
    if (synchronizing) return;
    synchronizing = true;
    try {
      for (const { textarea, gutter } of inputs) {
        if (source !== undefined && textarea !== source) textarea.scrollTop = source.scrollTop;
        updateLineNumbers(textarea, gutter);
      }
    } finally {
      synchronizing = false;
    }
  };
  for (const { textarea } of inputs) {
    textarea.addEventListener("input", () => update());
    textarea.addEventListener("scroll", () => update(textarea));
  }
  update();
}
