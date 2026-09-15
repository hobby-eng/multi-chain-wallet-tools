import decodeQr from 'qr/decode.js';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DECODE_DIMENSION = 4096;

export interface DecodedQrImage {
  readonly text: string;
  /** Present when the QR contains one byte-mode segment, including embedded NUL/CR/LF bytes. */
  readonly binaryData?: Uint8Array;
}

export function decodeQrPixels(
  image: Readonly<{ width: number; height: number; data: Uint8ClampedArray }>,
): DecodedQrImage {
  const byteSegments: Uint8Array[] = [];
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  const text = decodeQr(image, {
    effort: 3,
    timeLimit: 1500,
    textDecoder(bytes) {
      byteSegments.push(bytes.slice());
      return textDecoder.decode(bytes);
    },
  });
  if (byteSegments.length === 1) return { text, binaryData: byteSegments[0]! };
  return { text };
}

export async function decodeQrImage(file: File): Promise<DecodedQrImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, WebP, or other browser-readable image.');
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error('QR image must be between 1 byte and 20 MiB.');

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('Canvas image decoding is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return decodeQrPixels(image);
  } finally {
    bitmap.close();
  }
}

export function installQrImageImport(
  document: Document,
  target: HTMLTextAreaElement,
  options: Readonly<{
    label?: string;
    multiple?: boolean;
    onDecoded?(decoded: DecodedQrImage): string;
    onError?(message: string): void;
  }> = {},
): void {
  const label = document.createElement('label');
  label.className = 'secondary compact qr-image-import';
  label.textContent = options.label ?? 'Read QR image';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
  input.multiple = options.multiple === true;
  input.hidden = true;
  label.append(input);
  target.after(label);
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    void (async () => {
      try {
        const values: string[] = [];
        for (const file of files) {
          const decoded = await decodeQrImage(file);
          values.push(options.onDecoded?.(decoded) ?? decoded.text);
        }
        const incoming = values.filter((value) => value.length > 0).join('\n');
        target.value =
          options.multiple === true && target.value.trim() !== '' ? `${target.value.trim()}\n${incoming}` : incoming;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (cause) {
        options.onError?.(cause instanceof Error ? cause.message : 'The QR image could not be decoded.');
      }
    })();
  });
}
