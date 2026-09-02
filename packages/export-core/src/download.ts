/**
 * Starts a download from in-memory data without leaving the object URL alive
 * longer than necessary.
 *
 * Revoking synchronously after `click()` cancels the download that click just
 * started in some browsers, so the URL is released on the next task instead.
 * Every export surface goes through this helper so the lifetime rule cannot
 * drift between applications.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function downloadText(text: string, fileName: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: `${mimeType};charset=utf-8` }), fileName);
}
