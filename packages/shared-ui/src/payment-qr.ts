import { encode } from "uqr";
import type { ResultField } from "@ckd/core/types.js";
import { downloadBlob } from "@ckd/export/download.js";
import { QrActionLifecycle } from "./qr-action-lifecycle.js";

export function paymentQrPayload(field: ResultField): string | undefined {
  if (field.role !== "paymentAddress" || field.secret || field.value.length === 0) return undefined;
  return field.paymentUriScheme === undefined
    ? field.value
    : `${field.paymentUriScheme}:${field.value}`;
}

type QrPayload = string | Readonly<Array<number>>;
type QrEcc = "L" | "M" | "Q" | "H";
const SAVE_PNG = "Save as PNG";
const PNG_RESET_DELAY_MS = 1400;

export function qrMatrix(payload: QrPayload, ecc: QrEcc = "M"): boolean[][] {
  if (payload.length === 0 || payload.length > 4096)
    throw new Error("QR payload length is invalid.");
  return encode(payload, { ecc, border: 4 }).data;
}

function qrFileStem(label: string): string {
  const normalized = label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized === "" ? "qr-code" : normalized;
}

function clearQrMatrix(matrix: boolean[][]): void {
  for (const row of matrix) row.fill(false);
  matrix.length = 0;
}

/** Owns one PNG export through asynchronous encoding and checks permission before publication. */
export class QrPngExport {
  readonly #document: Document;

  constructor(document: Document) {
    this.#document = document;
  }

  /** False means permission was revoked; it never reports a cancelled export as saved. */
  async save(
    payload: QrPayload,
    ecc: QrEcc,
    label: string,
    current: () => boolean = () => true,
  ): Promise<boolean> {
    if (!current()) return false;
    const matrix = qrMatrix(payload, ecc);
    let canvas: HTMLCanvasElement | undefined;
    try {
      const scale = Math.max(4, Math.min(12, Math.floor(1024 / matrix.length)));
      canvas = this.#document.createElement("canvas");
      canvas.width = matrix.length * scale;
      canvas.height = matrix.length * scale;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Canvas rendering is unavailable in this browser.");
      context.imageSmoothingEnabled = false;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#05070a";
      for (let row = 0; row < matrix.length; row += 1) {
        for (let column = 0; column < matrix.length; column += 1) {
          if (matrix[row]?.[column] === true)
            context.fillRect(column * scale, row * scale, scale, scale);
        }
      }
      const pngCanvas = canvas;
      const blob = await new Promise<Blob>((resolve, reject) => {
        pngCanvas.toBlob((value) => {
          if (value === null)
            reject(new Error("The browser could not encode the QR image as PNG."));
          else resolve(value);
        }, "image/png");
      });
      // toBlob is asynchronous: edits, concealment or a lost gate may revoke this image meanwhile.
      if (!current()) return false;
      downloadBlob(blob, `${qrFileStem(label)}-qr.png`);
      return true;
    } finally {
      try {
        if (canvas !== undefined) {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        clearQrMatrix(matrix);
      }
    }
  }
}

/** The asynchronous Save control borrows the widget's permission and payload until retirement. */
interface QrPngPort {
  payload(): QrPayload;
  current(): boolean;
  cancelled(): void;
}

class QrPngButton implements Disposable {
  readonly #button: HTMLButtonElement;
  readonly #export: QrPngExport;
  readonly #label: string;
  readonly #ecc: QrEcc;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #port: QrPngPort | undefined;

  constructor(document: Document, label: string, ecc: QrEcc, port: QrPngPort) {
    this.#port = port;
    this.#label = label;
    this.#ecc = ecc;
    this.#export = new QrPngExport(document);
    this.#button = document.createElement("button");
    this.#button.type = "button";
    this.#button.className = "payment-qr-save";
    this.#button.textContent = SAVE_PNG;
    this.#button.setAttribute("aria-label", `Save ${label} QR code as PNG`);
    this.#button.addEventListener("click", () => void this.#save());
  }

  get element(): HTMLButtonElement {
    return this.#button;
  }

  #cancel(port: QrPngPort): void {
    this.#button.textContent = SAVE_PNG;
    this.#button.removeAttribute("title");
    port.cancelled();
  }

  async #save(): Promise<void> {
    const port = this.#port;
    if (port === undefined) return;
    const current = (): boolean => this.#port === port && port.current();
    if (!current()) {
      this.#cancel(port);
      return;
    }
    this.#button.disabled = true;
    this.#button.textContent = "Saving…";
    try {
      const saved = await this.#export.save(port.payload(), this.#ecc, this.#label, current);
      if (!saved || !current()) {
        this.#cancel(port);
        return;
      }
      this.#button.textContent = "Saved PNG";
      this.#button.removeAttribute("title");
    } catch (cause) {
      if (!current()) {
        this.#cancel(port);
        return;
      }
      this.#button.textContent = "Save failed";
      this.#button.title = cause instanceof Error ? cause.message : "QR PNG export failed.";
    } finally {
      if (this.#port === port) {
        if (this.#timer !== undefined) clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
          this.#timer = undefined;
          this.#button.disabled = false;
          this.#button.textContent = SAVE_PNG;
        }, PNG_RESET_DELAY_MS);
      }
    }
  }

  wipe(): void {
    this.#port = undefined;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#button.disabled = true;
    this.#button.textContent = SAVE_PNG;
  }
  [Symbol.dispose](): void {
    this.wipe();
  }
}

function renderMatrix(document: Document, payload: QrPayload, ecc: QrEcc): Element {
  const matrix = qrMatrix(payload, ecc);
  try {
    const size = matrix.length;
    const svgNamespace = document.documentElement.namespaceURI?.replace("1999/xhtml", "2000/svg");
    if (svgNamespace === undefined)
      throw new Error("The document has no namespace for inline SVG rendering.");
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR code containing the payload shown below");
    svg.setAttribute("shape-rendering", "crispEdges");
    const background = document.createElementNS(svgNamespace, "rect");
    background.setAttribute("width", String(size));
    background.setAttribute("height", String(size));
    background.setAttribute("fill", "#fff");
    svg.append(background);
    const path = document.createElementNS(svgNamespace, "path");
    const commands: string[] = [];
    for (let row = 0; row < size; row += 1)
      for (let column = 0; column < size; column += 1)
        if (matrix[row]?.[column] === true) commands.push(`M${column} ${row}h1v1h-1z`);
    path.setAttribute("d", commands.join(""));
    path.setAttribute("fill", "#05070a");
    svg.append(path);
    return svg;
  } finally {
    clearQrMatrix(matrix);
  }
}

export function createQrAction(
  document: Document,
  payload: QrPayload,
  label: string,
  displayedPayload: string,
  options: Readonly<{
    heading?: string;
    description?: string;
    ecc?: QrEcc;
    current?: () => boolean;
  }> = {},
): HTMLElement {
  const root = document.createElement("span");
  root.className = "payment-qr-action";
  let active = true;
  const current = (): boolean => active && root.isConnected && (options.current?.() ?? true);
  let pngButton: QrPngButton | undefined;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy qr-trigger";
  button.textContent = "QR";
  button.setAttribute("aria-label", `Show QR code for ${label}`);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const popover = document.createElement("span");
  popover.className = "payment-qr-popover";
  popover.setAttribute("popover", "manual");
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `${label} QR code`);
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
  const hide = (restoreFocus = false): void => {
    pinned = false;
    if (popover.matches(":popover-open")) popover.hidePopover();
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
    delete root.dataset.qrOpen;
    if (restoreFocus) {
      suppressFocusPreview = true;
      button.focus({ preventScroll: true });
      suppressFocusPreview = false;
    }
  };
  const unregister = QrActionLifecycle.register(root, {
    hide,
    position(target) {
      if (!(target instanceof Node) || !popover.contains(target)) positionPopover();
    },
    outside(target) {
      if (target instanceof Node && !root.contains(target)) hide();
    },
    dispose() {
      active = false;
      pngButton?.wipe();
      hide();
      payload = "";
      displayedPayload = "";
      options = {};
      popover.replaceChildren();
      unregister();
    },
  });
  const show = (pin: boolean): void => {
    if (!current()) {
      hide();
      return;
    }
    if (pin && !pinned) {
      pinned = true;
    }
    if (!rendered) {
      const heading = document.createElement("strong");
      heading.textContent = options.heading ?? "QR code";
      const description = document.createElement("span");
      description.className = "payment-qr-description";
      description.textContent = options.description ?? "Encoded payload:";
      const payloadText = document.createElement("code");
      payloadText.className = "payment-qr-payload";
      payloadText.textContent = displayedPayload;
      payloadText.tabIndex = 0;
      pngButton = new QrPngButton(document, label, options.ecc ?? "M", {
        payload: () => payload,
        current,
        cancelled: () => hide(),
      });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "payment-qr-close";
      close.textContent = "Close";
      close.setAttribute("aria-label", `Close ${label} QR code`);
      close.addEventListener("click", () => hide(true));
      popover.append(
        heading,
        renderMatrix(document, payload, options.ecc ?? "M"),
        description,
        payloadText,
        pngButton.element,
        close,
      );
      rendered = true;
    }
    popover.style.pointerEvents = pinned ? "auto" : "none";
    popover.hidden = false;
    if (!popover.matches(":popover-open")) popover.showPopover();
    positionPopover();
    root.dataset.qrOpen = "";
    button.setAttribute("aria-expanded", "true");
  };
  const previewEnd = (): void => {
    if (!pinned && !root.matches(":hover") && !root.contains(document.activeElement)) hide();
  };
  button.addEventListener("mouseenter", () => show(false));
  button.addEventListener("mouseleave", previewEnd);
  button.addEventListener("focus", () => {
    if (!suppressFocusPreview) show(false);
  });
  button.addEventListener("blur", () => queueMicrotask(previewEnd));
  button.addEventListener("click", () => {
    if (pinned) {
      hide(true);
      return;
    }
    show(true);
    if (!popover.hidden)
      popover.querySelector<HTMLButtonElement>(".payment-qr-close")?.focus({ preventScroll: true });
  });
  root.addEventListener("mouseleave", previewEnd);
  root.append(button, popover);
  return root;
}

export function createPaymentQrAction(
  document: Document,
  payload: string,
  label: string,
): HTMLElement {
  if (payload.length > 512) throw new Error("QR payment payload length is invalid.");
  return createQrAction(document, payload, label, payload, {
    heading: "Payment QR",
    description: "Encoded payload:",
    ecc: "M",
  });
}
