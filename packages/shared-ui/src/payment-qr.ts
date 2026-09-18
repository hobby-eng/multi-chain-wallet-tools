import { encode } from 'uqr';
import type { ResultField } from '@ckd/core/types.js';
import { downloadBlob } from '@ckd/export/download.js';

export function paymentQrPayload(field: ResultField): string | undefined {
  if (field.role !== 'paymentAddress' || field.secret || field.value.length === 0) return undefined;
  return field.paymentUriScheme === undefined ? field.value : `${field.paymentUriScheme}:${field.value}`;
}

type QrPayload = string | Readonly<Array<number>>;

export function qrMatrix(payload: QrPayload, ecc: 'L' | 'M' | 'Q' | 'H' = 'M'): boolean[][] {
  if (payload.length === 0 || payload.length > 4096) throw new Error('QR payload length is invalid.');
  return encode(payload, { ecc, border: 4 }).data;
}

function qrFileStem(label: string): string {
  const normalized = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  return normalized === '' ? 'qr-code' : normalized;
}

async function saveQrPng(
  document: Document,
  payload: QrPayload,
  ecc: 'L' | 'M' | 'Q' | 'H',
  label: string,
): Promise<void> {
  const matrix = qrMatrix(payload, ecc);
  const scale = Math.max(4, Math.min(12, Math.floor(1024 / matrix.length)));
  const canvas = document.createElement('canvas');
  canvas.width = matrix.length * scale;
  canvas.height = matrix.length * scale;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Canvas rendering is unavailable in this browser.');
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#05070a';
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix.length; column += 1) {
      if (matrix[row]?.[column] === true) context.fillRect(column * scale, row * scale, scale, scale);
    }
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value === null) reject(new Error('The browser could not encode the QR image as PNG.'));
      else resolve(value);
    }, 'image/png');
  });
  downloadBlob(blob, `${qrFileStem(label)}-qr.png`);
}

function renderMatrix(document: Document, payload: QrPayload, ecc: 'L' | 'M' | 'Q' | 'H'): Element {
  const matrix = qrMatrix(payload, ecc);
  const size = matrix.length;
  const svgNamespace = document.documentElement.namespaceURI?.replace('1999/xhtml', '2000/svg');
  if (svgNamespace === undefined) throw new Error('The document has no namespace for inline SVG rendering.');
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code containing the payload shown below');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const background = document.createElementNS(svgNamespace, 'rect');
  background.setAttribute('width', String(size));
  background.setAttribute('height', String(size));
  background.setAttribute('fill', '#fff');
  svg.append(background);
  const path = document.createElementNS(svgNamespace, 'path');
  const commands: string[] = [];
  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1)
      if (matrix[row]?.[column] === true) commands.push(`M${column} ${row}h1v1h-1z`);
  path.setAttribute('d', commands.join(''));
  path.setAttribute('fill', '#05070a');
  svg.append(path);
  return svg;
}

export function createQrAction(
  document: Document,
  payload: QrPayload,
  label: string,
  displayedPayload: string,
  options: Readonly<{ heading?: string; description?: string; ecc?: 'L' | 'M' | 'Q' | 'H' }> = {},
): HTMLElement {
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
  popover.setAttribute('popover', 'manual');
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', `${label} QR code`);
  let rendered = false;
  let pinned = false;
  let suppressFocusPreview = false;
  const positionPopover = (): void => {
    const viewport = document.defaultView;
    if (viewport === null || popover.hidden) return;
    const margin = 16;
    popover.style.maxHeight = `${Math.max(0, viewport.innerHeight - margin * 2)}px`;
    const anchor = button.getBoundingClientRect();
    const bounds = popover.getBoundingClientRect();
    const mobile = viewport.innerWidth <= 640;
    const left = mobile ? (viewport.innerWidth - bounds.width) / 2 : anchor.right - bounds.width;
    const below = anchor.bottom + 8;
    const top = mobile
      ? (viewport.innerHeight - bounds.height) / 2
      : below + bounds.height <= viewport.innerHeight - margin
        ? below
        : anchor.top - bounds.height - 8;
    popover.style.left = `${Math.max(margin, Math.min(left, viewport.innerWidth - bounds.width - margin))}px`;
    popover.style.top = `${Math.max(margin, Math.min(top, viewport.innerHeight - bounds.height - margin))}px`;
  };
  const onScroll = (event: Event): void => {
    if (event.target instanceof Node && popover.contains(event.target)) return;
    positionPopover();
  };
  const hide = (restoreFocus = false): void => {
    pinned = false;
    if (popover.matches(':popover-open')) popover.hidePopover();
    popover.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onOutsidePointer);
    document.removeEventListener('scroll', onScroll, true);
    document.defaultView?.removeEventListener('resize', positionPopover);
    if (restoreFocus) {
      suppressFocusPreview = true;
      button.focus({ preventScroll: true });
      suppressFocusPreview = false;
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hide(true);
    }
  };
  const onOutsidePointer = (event: PointerEvent): void => {
    if (event.target instanceof Node && !root.contains(event.target)) hide();
  };
  const show = (pin: boolean): void => {
    if (pin && !pinned) {
      pinned = true;
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('pointerdown', onOutsidePointer);
    }
    if (!rendered) {
      const heading = document.createElement('strong');
      heading.textContent = options.heading ?? 'QR code';
      const description = document.createElement('span');
      description.className = 'payment-qr-description';
      description.textContent = options.description ?? 'Encoded payload:';
      const payloadText = document.createElement('code');
      payloadText.className = 'payment-qr-payload';
      payloadText.textContent = displayedPayload;
      payloadText.tabIndex = 0;
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'payment-qr-save';
      save.textContent = 'Save QR as PNG';
      save.setAttribute('aria-label', `Save ${label} QR code as PNG`);
      save.addEventListener('click', () => {
        void (async () => {
          save.disabled = true;
          save.textContent = 'Saving…';
          try {
            await saveQrPng(document, payload, options.ecc ?? 'M', label);
            save.textContent = 'Saved PNG';
            save.removeAttribute('title');
          } catch (cause) {
            save.textContent = 'Save failed';
            save.title = cause instanceof Error ? cause.message : 'QR PNG export failed.';
          } finally {
            globalThis.setTimeout(() => {
              save.disabled = false;
              save.textContent = 'Save QR as PNG';
            }, 1400);
          }
        })();
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'payment-qr-close';
      close.textContent = 'Close';
      close.setAttribute('aria-label', `Close ${label} QR code`);
      close.addEventListener('click', () => hide(true));
      popover.append(
        heading,
        renderMatrix(document, payload, options.ecc ?? 'M'),
        description,
        payloadText,
        save,
        close,
      );
      rendered = true;
    }
    popover.style.pointerEvents = pinned ? 'auto' : 'none';
    popover.hidden = false;
    if (!popover.matches(':popover-open')) popover.showPopover();
    positionPopover();
    document.addEventListener('scroll', onScroll, true);
    document.defaultView?.addEventListener('resize', positionPopover);
    button.setAttribute('aria-expanded', 'true');
  };
  const previewEnd = (): void => {
    if (!pinned && !root.matches(':hover') && !root.contains(document.activeElement)) hide();
  };
  button.addEventListener('mouseenter', () => show(false));
  button.addEventListener('mouseleave', previewEnd);
  button.addEventListener('focus', () => {
    if (!suppressFocusPreview) show(false);
  });
  button.addEventListener('blur', () => queueMicrotask(previewEnd));
  button.addEventListener('click', () => {
    if (pinned) {
      hide(true);
      return;
    }
    show(true);
    popover.querySelector<HTMLButtonElement>('.payment-qr-close')?.focus({ preventScroll: true });
  });
  root.addEventListener('mouseleave', previewEnd);
  root.append(button, popover);
  return root;
}

export function createPaymentQrAction(document: Document, payload: string, label: string): HTMLElement {
  if (payload.length > 512) throw new Error('QR payment payload length is invalid.');
  return createQrAction(document, payload, label, payload, {
    heading: 'Payment QR',
    description: 'Encoded payload:',
    ecc: 'M',
  });
}
