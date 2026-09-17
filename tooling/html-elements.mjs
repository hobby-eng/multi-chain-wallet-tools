/** Replace one balanced HTML element selected by its opening-tag expression. */
export function replaceBalancedElement(source, openingPattern, replacement = '', context = 'HTML template') {
  const opening = openingPattern.exec(source);
  if (opening === null) return source;
  const tag = /^<([a-z][a-z0-9-]*)\b/iu.exec(opening[0])?.[1];
  if (tag === undefined) throw new Error(`${context} selector did not start at an HTML element.`);
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'giu');
  token.lastIndex = opening.index;
  let depth = 0;
  for (let match = token.exec(source); match !== null; match = token.exec(source)) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(0, opening.index) + replacement + source.slice(token.lastIndex);
  }
  throw new Error(`${context} is missing the closing <${tag}> element.`);
}
