import { encode } from 'uqr';
import type { ResultField } from '@ckd/core/types.js';

export function paymentQrPayload(field: ResultField): string | undefined {
  if (field.role !== 'paymentAddress' || field.secret || field.value.length === 0) return undefined;
  return field.paymentUriScheme === undefined ? field.value : `${field.paymentUriScheme}:${field.value}`;
}

export function paymentQrMatrix(payload: string): boolean[][] {
  if (payload.length === 0 || payload.length > 512) throw new Error('QR payment payload length is invalid.');
  return encode(payload, { ecc: 'M', border: 4 }).data;
}

function renderMatrix(document: Document, payload: string): Element {
  const matrix = paymentQrMatrix(payload);
  const size = matrix.length;
  const svgNamespace = document.documentElement.namespaceURI?.replace('1999/xhtml', '2000/svg');
  if (svgNamespace === undefined) throw new Error('The document has no namespace for inline SVG rendering.');
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code containing the payment payload shown below');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = document.createElementNS(svgNamespace, 'rect');
  background.setAttribute('width', String(size));
  background.setAttribute('height', String(size));
  background.setAttribute('fill', '#fff');
  svg.append(background);
  const path = document.createElementNS(svgNamespace, 'path');
  const commands: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (matrix[row]?.[column] === true) commands.push(`M${column} ${row}h1v1h-1z`);
    }
  }
  path.setAttribute('d', commands.join(''));
  path.setAttribute('fill', '#05070a');
  svg.append(path);
  return svg;
}

export function createPaymentQrAction(document: Document, payload: string, label: string): HTMLElement {
  const root = document.createElement('span');
  root.className = 'payment-qr-action';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy qr-trigger';
  button.textContent = 'QR';
  button.setAttribute('aria-label', `Show QR code for ${label}`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');

  const popover = document.createElement('span');
  popover.className = 'payment-qr-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `${label} QR code`);
  let rendered = false;
  let pinned = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hide(true);
    }
  };
  const onOutsidePointer = (event: PointerEvent): void => {
    if (event.target instanceof Node && !root.contains(event.target)) hide();
  };
  const hide = (restoreFocus = false): void => {
    pinned = false;
    popover.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onOutsidePointer);
    if (restoreFocus) button.focus();
  };
  const show = (pin: boolean): void => {
    if (pin && !pinned) {
      pinned = true;
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('pointerdown', onOutsidePointer);
    }
    if (!rendered) {
      const heading = document.createElement('strong');
      heading.textContent = 'Payment QR';
      const description = document.createElement('span');
      description.className = 'payment-qr-description';
      description.textContent = 'Encoded payload:';
      const payloadText = document.createElement('code');
      payloadText.className = 'payment-qr-payload';
      payloadText.textContent = payload;
      payloadText.tabIndex = 0;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'payment-qr-close';
      close.textContent = 'Close';
      close.setAttribute('aria-label', 'Close payment QR code');
      close.addEventListener('click', () => hide(true));
      popover.append(heading, renderMatrix(document, payload), description, payloadText, close);
      rendered = true;
    }
    popover.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  };
  const previewEnd = (): void => {
    if (!pinned && !root.matches(':hover') && !root.contains(document.activeElement)) hide();
  };

  button.addEventListener('mouseenter', () => show(false));
  button.addEventListener('mouseleave', previewEnd);
  button.addEventListener('focus', () => show(false));
  button.addEventListener('blur', () => queueMicrotask(previewEnd));
  button.addEventListener('click', () => {
    show(true);
    popover.querySelector<HTMLButtonElement>('.payment-qr-close')?.focus();
  });
  root.addEventListener('mouseleave', previewEnd);
  root.append(button, popover);
  return root;
}
