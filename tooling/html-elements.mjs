/**
 * Where the balanced HTML element selected by its opening-tag expression starts and ends in
 * `source`, as `{ start, end }`, or null when no opening tag matches.
 */
function balancedElementRange(source, openingPattern, context) {
  const opening = openingPattern.exec(source);
  if (opening === null) return null;
  const tag = /^<([a-z][a-z0-9-]*)\b/iu.exec(opening[0])?.[1];
  if (tag === undefined) throw new Error(`${context} selector did not start at an HTML element.`);
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "giu");
  token.lastIndex = opening.index;
  let depth = 0;
  for (let match = token.exec(source); match !== null; match = token.exec(source)) {
    if (match[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return { start: opening.index, end: token.lastIndex };
  }
  throw new Error(`${context} is missing the closing <${tag}> element.`);
}

/** The opening tag of the element whose id is `id`. */
const idOpeningPattern = (id) =>
  new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, "iu");

/** Replace one balanced HTML element selected by its opening-tag expression. */
export function replaceBalancedElement(
  source,
  openingPattern,
  replacement = "",
  context = "HTML template",
) {
  const range = balancedElementRange(source, openingPattern, context);
  if (range === null) return source;
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

/** Removes the balanced HTML element whose id is `id`; a template without it stays as it is. */
export function removeElementById(source, id, context = "HTML template") {
  return replaceBalancedElement(source, idOpeningPattern(id), "", context);
}

/** The balanced HTML element whose id is `id`, opening and closing tags included, or undefined. */
export function elementById(source, id, context = "HTML template") {
  const range = balancedElementRange(source, idOpeningPattern(id), context);
  return range === null ? undefined : source.slice(range.start, range.end);
}
