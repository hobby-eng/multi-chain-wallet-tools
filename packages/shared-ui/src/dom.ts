export function requireQueryElement<T extends Element>(
  document: Document,
  selector: string,
  context = 'Application template',
): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`${context} is missing ${selector}.`);
  return element;
}

export function requireIdElement<T extends HTMLElement>(
  document: Document,
  id: string,
  context = 'Application template',
): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`${context} is missing #${id}.`);
  return element as T;
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
        const count = Math.max(1, textarea.value.replaceAll('\r', '').split('\n').length);
        gutter.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join('\n');
        if (source !== undefined && textarea !== source) textarea.scrollTop = source.scrollTop;
        gutter.scrollTop = textarea.scrollTop;
      }
    } finally {
      synchronizing = false;
    }
  };
  for (const { textarea } of inputs) {
    textarea.addEventListener('input', () => update());
    textarea.addEventListener('scroll', () => update(textarea));
  }
  update();
}
