interface BalancedSyntaxOptions {
  readonly context: string;
  readonly includeAngles?: boolean;
}

export function findMatchingClose(
  text: string,
  open: number,
  opening = '(',
  closing = ')',
  context = 'Expression',
): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === opening) depth += 1;
    else if (text[index] === closing) {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) break;
    }
  }
  throw new Error(`${context} contains an unclosed ${opening}${closing} pair.`);
}

export function splitTopLevelArguments(text: string, options: BalancedSyntaxOptions): string[] {
  const result: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let angle = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (options.includeAngles && character === '<') angle += 1;
    else if (options.includeAngles && character === '>') angle -= 1;
    else if (character === ',' && round === 0 && square === 0 && curly === 0 && angle === 0) {
      result.push(text.slice(start, index));
      start = index + 1;
    }
    if (round < 0 || square < 0 || curly < 0 || angle < 0) {
      throw new Error(`${options.context} contains unbalanced delimiters.`);
    }
  }
  if (round !== 0 || square !== 0 || curly !== 0 || angle !== 0) {
    throw new Error(`${options.context} contains unbalanced delimiters.`);
  }
  result.push(text.slice(start));
  return result;
}
