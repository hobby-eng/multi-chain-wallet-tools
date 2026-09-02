/** Writes only user-requested text. No clipboard contents are ever read. */
export async function writeClipboard(value: string): Promise<void> {
  if (value.length === 0) throw new Error('There is nothing to copy.');
  try {
    if (navigator.clipboard?.writeText === undefined) throw new Error('Clipboard API unavailable.');
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const temporary = document.createElement('textarea');
    temporary.value = value;
    temporary.readOnly = true;
    temporary.tabIndex = -1;
    temporary.style.position = 'fixed';
    temporary.style.inset = '0 auto auto -9999px';
    temporary.style.opacity = '0';
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand('copy');
    // JavaScript strings are immutable; clearing only releases this DOM reference.
    temporary.value = '';
    temporary.remove();
    if (!copied) throw new Error('Clipboard access was denied by this browser.');
  }
}
