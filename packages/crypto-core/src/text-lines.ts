// The lines of text a person pasted, the same way in every tool: Windows line ends are read as
// Unix ones.

/** Every line of `text`, empty ones too, so that a line keeps its number. */
export function textLines(text: string): string[] {
  return text.replaceAll("\r", "").split("\n");
}

/** The lines of `text` that hold something, each without its surrounding white space. */
export function nonEmptyLines(text: string): string[] {
  return textLines(text)
    .map((line) => line.trim())
    .filter(Boolean);
}
