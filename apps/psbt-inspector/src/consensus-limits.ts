export const CONSENSUS_LIMITS = Object.freeze({
  absoluteLockTimeThreshold: 500_000_000,
  bip68SequenceMask: 0x0000ffff,
  bip68TypeFlag: 1 << 22,
  bip68DisableFlag: 0x80000000,
  maximumBareMultisigKeys: 3,
  maximumCheckMultisigKeys: 20,
  maximumCheckSigAddKeys: 999,
  maximumScriptElementBytes: 520,
  maximumScriptBytes: 10_000,
  maximumTaprootTreeDepth: 128,
  maximumBitcoinMoney: 21_000_000n * 100_000_000n,
  maximumDashMoney: 21_000_000n * 100_000_000n,
});

export type ScriptPolicyContext = 'bare' | 'p2sh' | 'p2wsh' | 'tapscript';

function matchingClose(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Miniscript expression contains an unclosed parenthesis.');
}

function splitTopLevel(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '(') round += 1;
    else if (character === ')') round -= 1;
    else if (character === '[') square += 1;
    else if (character === ']') square -= 1;
    else if (character === '{') curly += 1;
    else if (character === '}') curly -= 1;
    else if (character === ',' && round === 0 && square === 0 && curly === 0) {
      result.push(text.slice(start, index));
      start = index + 1;
    }
    if (round < 0 || square < 0 || curly < 0) throw new Error('Miniscript expression has unbalanced delimiters.');
  }
  if (round !== 0 || square !== 0 || curly !== 0) throw new Error('Miniscript expression has unbalanced delimiters.');
  result.push(text.slice(start));
  return result;
}

function fragmentBodies(text: string, name: string): string[] {
  const results: string[] = [];
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(`${name}(`, from);
    if (start === -1) break;
    const previous = start === 0 ? '' : text[start - 1]!;
    if (/[a-z0-9_]/u.test(previous)) {
      from = start + name.length;
      continue;
    }
    const open = start + name.length;
    const close = matchingClose(text, open);
    results.push(text.slice(open + 1, close));
    from = close + 1;
  }
  return results;
}

export function validateMultisigConsensusLimits(source: string, context: ScriptPolicyContext): void {
  for (const name of ['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'] as const) {
    for (const body of fragmentBodies(source, name)) {
      const argumentsList = splitTopLevel(body);
      const threshold = Number(argumentsList[0]);
      const keyCount = Math.max(0, argumentsList.length - 1);
      if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > keyCount) {
        throw new Error(`${name}() threshold must satisfy 1 <= threshold <= ${keyCount}.`);
      }
      const tapscriptMultisig = name.endsWith('_a');
      if (tapscriptMultisig && context !== 'tapscript') {
        throw new Error(`${name}() is permitted only inside a Taproot script tree.`);
      }
      if (!tapscriptMultisig && context === 'tapscript') {
        throw new Error(`${name}() is not permitted in Tapscript; use multi_a() or sortedmulti_a().`);
      }
      const maximum = tapscriptMultisig
        ? CONSENSUS_LIMITS.maximumCheckSigAddKeys
        : context === 'bare'
          ? CONSENSUS_LIMITS.maximumBareMultisigKeys
          : CONSENSUS_LIMITS.maximumCheckMultisigKeys;
      if (keyCount > maximum) {
        throw new Error(`${name}() contains ${keyCount} keys; the ${context} limit is ${maximum}.`);
      }
    }
  }
}
