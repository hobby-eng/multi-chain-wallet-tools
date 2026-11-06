/** What a text field says of a QR code whose bytes are not UTF-8, as MnemoCode's QR input does. */
export const QR_NOT_UTF8 = "The QR code is not valid UTF-8 text.";

/**
 * The text of a QR code for a text field, refused where a byte segment is not UTF-8: a byte
 * replaced by U+FFFD would turn a passphrase or a share into another one without a word
 * (MnemoCode's AUD-014-API002). A binary payload, such as a CompactSeedQR, reads its bytes instead.
 */
export function qrText(decoded: { readonly text: string; readonly utf8: boolean }): string {
  if (!decoded.utf8) throw new Error(QR_NOT_UTF8);
  return decoded.text;
}
