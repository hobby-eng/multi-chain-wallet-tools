// Shared English list punctuation for both runtime and tooling messages.

export function englishList(
  values: readonly (string | number)[],
  conjunction: "and" | "or" = "and",
): string {
  const texts = values.map(String);
  if (texts.length < 2) return texts[0] ?? "";
  if (texts.length === 2) return `${texts[0]} ${conjunction} ${texts[1]}`;
  return `${texts.slice(0, -1).join(", ")}, ${conjunction} ${texts.at(-1)}`;
}

/** `values` joined with commas and a final "or". */
export function orList(values: readonly (string | number)[]): string {
  return englishList(values, "or");
}
