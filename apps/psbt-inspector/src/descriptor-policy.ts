import { analyzeMiniscript } from '@bitcoinerlab/miniscript';
import { CONSENSUS_LIMITS } from './consensus-limits.js';
import { findMatchingClose, splitTopLevelArguments } from './balanced-syntax.js';

export interface DescriptorPathCard {
  readonly title: string;
  readonly availability: string;
  readonly requirement: string;
  readonly keys: readonly string[];
  readonly locks: readonly string[];
  readonly preimages: readonly string[];
}

export interface ExpressionNode {
  readonly name: string;
  readonly wrappers: string;
  readonly args: readonly (ExpressionNode | string)[];
}

const MAX_DESCRIPTOR_PATH_CARDS = 64;

export function miniscriptAnalysis(miniscript: string, tapscript = false): string | null {
  try {
    const analysis = analyzeMiniscript(miniscript, { tapscript });
    if (!analysis.valid) return null;
    return [
      analysis.issane ? 'sane' : 'not sane',
      analysis.nonMalleable ? 'non-malleable satisfactions available' : 'malleability warning',
      analysis.needsSignature ? 'signature required' : 'no signature required',
      analysis.timelockMix ? 'mixed timelock units' : 'compatible timelock units',
      analysis.hasDuplicateKeys ? 'duplicate keys detected' : 'no duplicate keys',
    ].join(' · ');
  } catch {
    return null;
  }
}

export const matchingClose = (text: string, open: number): number =>
  findMatchingClose(text, open, '(', ')', 'Descriptor');
export const splitTopLevel = (text: string): string[] =>
  splitTopLevelArguments(text, { context: 'Descriptor', includeAngles: true });

export function shortenedKey(key: string): string {
  const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
  const fingerprint = origin?.split('/')[0] ?? 'origin not supplied';
  const suffix = key.match(/\/(?:[01]|<[^>]+>)\/\*$/u)?.[0] ?? (key.endsWith('/*') ? '/*' : 'fixed key');
  return `${fingerprint} · ${suffix}`;
}

function describedKey(key: string): string {
  const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
  const fingerprint = origin?.split('/')[0];
  const originPath = origin?.split('/').slice(1).join('/');
  const suffix = key.match(/\/(?:[0-9]+|<[^>]+>|\*)+(?:\/\*)?$/u)?.[0] ?? (key.endsWith('/*') ? '/*' : 'fixed key');
  const parts = [fingerprint === undefined ? 'fingerprint not supplied' : `fingerprint ${fingerprint}`];
  if (originPath !== undefined && originPath.length > 0) parts.push(`origin m/${originPath}`);
  parts.push(`derivation ${suffix}`);
  return parts.join(', ');
}

export function expression(text: string): ExpressionNode | null {
  let body = text;
  let wrappers = '';
  const wrapper = /^([a-z]+):/u.exec(body);
  if (wrapper !== null) {
    wrappers = wrapper[1]!;
    body = body.slice(wrapper[0].length);
  }
  if (body === '0' || body === '1') return { name: body, wrappers, args: [] };
  const match = /^([a-z0-9_]+)\(/u.exec(body);
  if (match === null) return null;
  const open = match[0].length - 1;
  const close = matchingClose(body, open);
  const name = match[1]!;
  const rawArguments = splitTopLevel(body.slice(open + 1, close));
  const numericFirstArgument = ['thresh', 'multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(name);
  if (
    close !== body.length - 1 &&
    !(name === 'musig' && /^\/(?:[0-9]+|<[^>]+>|\*)(?:\/(?:[0-9]+|<[^>]+>|\*))*$/u.test(body.slice(close + 1)))
  )
    return null;
  const args = rawArguments.map((argument, index): ExpressionNode | string => {
    if (
      (!numericFirstArgument || index !== 0) &&
      (/^(?:[a-z]+:)?[a-z0-9_]+\(/u.test(argument) || /^(?:[a-z]+:)?[01]$/u.test(argument))
    ) {
      return expression(argument) ?? argument;
    }
    return argument;
  });
  return { name, wrappers, args };
}

function nodeText(value: ExpressionNode | string): string {
  return typeof value === 'string' ? value : describeCondition(value);
}

export function describeTaprootKey(value: ExpressionNode | string): string {
  if (typeof value !== 'string') return describeCondition(value);
  const parsed = expression(value);
  return parsed === null ? `one signature from ${describedKey(value)}` : describeCondition(parsed);
}

function unwrapWrapper(node: ExpressionNode): ExpressionNode {
  if (['sh', 'wsh'].includes(node.name) && node.args[0] !== undefined && typeof node.args[0] !== 'string')
    return unwrapWrapper(node.args[0]);
  return node;
}

export function describeAbsolute(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return `invalid absolute lock ${value}`;
  if (value < CONSENSUS_LIMITS.absoluteLockTimeThreshold) return `after block height ${value}`;
  const date = new Date(value * 1000);
  return Number.isNaN(date.valueOf())
    ? `after Unix time ${value}`
    : `after approximately ${date.toISOString()} (Unix time ${value}, enforced using median-time-past)`;
}

export const WRAPPER_MEANINGS: Readonly<Record<string, string>> = {
  a: 'move the input through the alternate stack (TOALTSTACK … FROMALTSTACK)',
  s: 'swap the top two stack values before evaluating the fragment',
  c: 'apply CHECKSIG to a public-key fragment',
  t: 'append true after a VERIFY-type fragment',
  d: 'duplicate the top value and conditionally evaluate the fragment',
  v: 'convert the fragment to VERIFY form so failure aborts the script',
  j: 'evaluate the fragment only when the top stack item is non-empty',
  n: 'normalize the result to canonical true or false',
  l: 'provide the fragment as the false-selected branch of IF/ELSE',
  u: 'provide the fragment as the true-selected branch of IF/ELSE',
};

export function collectWrappers(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  return [...value.wrappers, ...value.args.flatMap(collectWrappers)];
}

export function describeCondition(node: ExpressionNode): string {
  if (['sh', 'wsh'].includes(node.name)) return `${node.name} wrapper: ${node.args.map(nodeText).join('; ')}`;
  if (['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(node.name)) {
    const required = Number(node.args[0]);
    const keys = node.args.slice(1);
    return `${required}-of-${keys.length} signatures (${keys
      .map((key) => (typeof key === 'string' ? describedKey(key) : describeTaprootKey(key)))
      .join('; ')})`;
  }

  if (node.name === 'musig') {
    const keys = node.args.filter((value): value is string => typeof value === 'string');
    return `MuSig2 aggregate key from ${keys.length} participants (${keys.map(describedKey).join('; ')}); cooperative spend uses one aggregate Schnorr signature`;
  }
  if (['pk', 'pk_k', 'pkh', 'pk_h'].includes(node.name))
    return `one signature from ${describedKey(String(node.args[0] ?? 'unknown key'))}`;
  if (node.name === 'older')
    return `relative timelock ${relativeLock(Number(node.args[0]))} after confirmation of the spent UTXO`;
  if (node.name === 'after') return describeAbsolute(Number(node.args[0]));
  if (['sha256', 'hash256', 'ripemd160', 'hash160'].includes(node.name)) {
    return `reveal an exact 32-byte preimage whose ${hashAlgorithm(node.name)} digest is ${String(node.args[0] ?? '')}`;
  }
  if (['and_v', 'and_b', 'and_n'].includes(node.name)) return node.args.map(nodeText).join(' AND ');
  if (node.name === 'andor' && node.args.length === 3)
    return `if ${nodeText(node.args[0]!)}, then ${nodeText(node.args[1]!)}, otherwise ${nodeText(node.args[2]!)}`;
  if (['or_b', 'or_c', 'or_d', 'or_i'].includes(node.name)) return node.args.map(nodeText).join(' OR ');
  if (node.name === 'thresh')
    return `at least ${String(node.args[0])} of these conditions: ${node.args.slice(1).map(nodeText).join('; ')}`;
  if (node.name === '0') return 'an impossible branch';
  if (node.name === '1') return 'no additional condition';
  return `${node.wrappers.length > 0 ? `${node.wrappers}:` : ''}${node.name}(…) — standard fragment not yet translated; inspect it manually`;
}

function treeLabel(node: ExpressionNode): string {
  const prefix = node.wrappers.length > 0 ? `${node.wrappers}:` : '';
  if (node.name === '0') return `${prefix}false / impossible condition`;
  if (node.name === '1') return `${prefix}true / no additional condition`;
  if (['sh', 'wsh'].includes(node.name)) return `${node.name} wrapper`;
  if (['or_b', 'or_c', 'or_d', 'or_i'].includes(node.name)) return `${prefix}OR (${node.name})`;
  if (['and_v', 'and_b', 'and_n'].includes(node.name)) return `${prefix}AND (${node.name})`;
  if (node.name === 'older') return `relative lock: ${relativeLock(Number(node.args[0]))}`;
  if (node.name === 'after') return `absolute lock: ${describeAbsolute(Number(node.args[0]))}`;
  if (['sha256', 'hash256', 'ripemd160', 'hash160'].includes(node.name))
    return `${prefix}hashlock: ${hashAlgorithm(node.name)} ${String(node.args[0] ?? '')}`;
  if (['pk', 'pk_k', 'pkh', 'pk_h'].includes(node.name))
    return `${prefix}${node.name}: ${shortenedKey(String(node.args[0] ?? 'unknown key'))}`;
  if (node.name === 'musig') return `${prefix}musig: aggregate ${node.args.length} keys`;
  if (['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(node.name)) {
    return `${prefix}${node.name}: ${String(node.args[0])}-of-${Math.max(0, node.args.length - 1)} keys`;
  }
  if (node.name === 'thresh')
    return `${prefix}threshold: ${String(node.args[0])} of ${Math.max(0, node.args.length - 1)} conditions`;
  return `${prefix}${node.name}`;
}

export function policyTree(node: ExpressionNode, prefix = '', last = true): string[] {
  const line = `${prefix}${prefix.length === 0 ? '' : last ? '└─ ' : '├─ '}${treeLabel(node)}`;
  const children = node.args.filter((argument): argument is ExpressionNode => typeof argument !== 'string');
  const childPrefix = prefix.length === 0 ? '' : `${prefix}${last ? '   ' : '│  '}`;
  return [line, ...children.flatMap((child, index) => policyTree(child, childPrefix, index === children.length - 1))];
}

function collectKeys(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct = ['pk', 'pk_k', 'pkh', 'pk_h'].includes(value.name)
    ? [shortenedKey(String(value.args[0] ?? 'unknown key'))]
    : value.name === 'musig'
      ? value.args.filter((argument): argument is string => typeof argument === 'string').map(shortenedKey)
      : ['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(value.name)
        ? value.args
            .slice(1)
            .filter((argument): argument is string => typeof argument === 'string')
            .map(shortenedKey)
        : [];
  return [...direct, ...value.args.flatMap(collectKeys)];
}

export function collectKeyExpressions(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct = ['pk', 'pk_k', 'pkh', 'pk_h', 'wpkh', 'combo', 'rawtr'].includes(value.name)
    ? typeof value.args[0] === 'string'
      ? [value.args[0]]
      : []
    : value.name === 'tr'
      ? typeof value.args[0] === 'string'
        ? [value.args[0]]
        : []
      : value.name === 'musig'
        ? value.args.filter((argument): argument is string => typeof argument === 'string')
        : ['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(value.name)
          ? value.args.slice(1).filter((argument): argument is string => typeof argument === 'string')
          : [];
  return [...direct, ...value.args.flatMap(collectKeyExpressions)].filter(Boolean);
}

function collectLocks(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct =
    value.name === 'older'
      ? [`relative ${relativeLock(Number(value.args[0]))}`]
      : value.name === 'after'
        ? [describeAbsolute(Number(value.args[0]))]
        : [];
  return [...direct, ...value.args.flatMap(collectLocks)];
}

export function hashAlgorithm(name: string): string {
  return name === 'sha256'
    ? 'SHA-256'
    : name === 'hash256'
      ? 'HASH256'
      : name === 'ripemd160'
        ? 'RIPEMD-160'
        : 'HASH160';
}

function collectPreimages(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct = ['sha256', 'hash256', 'ripemd160', 'hash160'].includes(value.name)
    ? [`32-byte preimage for ${hashAlgorithm(value.name)} digest ${String(value.args[0] ?? '')}`]
    : [];
  return [...direct, ...value.args.flatMap(collectPreimages)];
}

interface PathEnumeration {
  readonly paths: ExpressionNode[][];
  readonly limited: boolean;
}

function combinePaths(left: PathEnumeration, right: PathEnumeration): PathEnumeration {
  if (left.limited || right.limited || left.paths.length * right.paths.length > MAX_DESCRIPTOR_PATH_CARDS) {
    return { paths: [], limited: true };
  }
  return {
    paths: left.paths.flatMap((leftPath) => right.paths.map((rightPath) => [...leftPath, ...rightPath])),
    limited: false,
  };
}

function pathAlternatives(value: ExpressionNode | string): PathEnumeration {
  if (typeof value === 'string') return { paths: [], limited: false };
  const node = unwrapWrapper(value);
  if (['or_b', 'or_c', 'or_d', 'or_i'].includes(node.name)) {
    const children = node.args.map(pathAlternatives);
    if (children.some(({ limited }) => limited)) return { paths: [], limited: true };
    const paths = children.flatMap(({ paths }) => paths);
    return paths.length > MAX_DESCRIPTOR_PATH_CARDS ? { paths: [], limited: true } : { paths, limited: false };
  }
  if (node.name === 'andor' && node.args.length === 3) {
    const condition = pathAlternatives(node.args[0]!);
    const success = pathAlternatives(node.args[1]!);
    const fallback = pathAlternatives(node.args[2]!);
    const primary = combinePaths(condition, success);
    if (
      primary.limited ||
      fallback.limited ||
      primary.paths.length + fallback.paths.length > MAX_DESCRIPTOR_PATH_CARDS
    ) {
      return { paths: [], limited: true };
    }
    return { paths: [...primary.paths, ...fallback.paths], limited: false };
  }
  if (['and_v', 'and_b', 'and_n'].includes(node.name)) {
    return node.args.reduce<PathEnumeration>((paths, argument) => combinePaths(paths, pathAlternatives(argument)), {
      paths: [[]],
      limited: false,
    });
  }
  return { paths: [[node]], limited: false };
}

export function descriptorPathCards(node: ExpressionNode): DescriptorPathCard[] {
  const enumerated = pathAlternatives(node);
  if (enumerated.limited) {
    return [
      {
        title: 'Path summary',
        availability: 'Too many alternatives to enumerate safely',
        requirement: `This descriptor has more than ${MAX_DESCRIPTOR_PATH_CARDS} possible spending-path combinations. Review the symbolic policy tree instead.`,
        keys: [],
        locks: [],
        preimages: [],
      },
    ];
  }
  return enumerated.paths.map((alternative, index) => {
    const locks = alternative.flatMap(collectLocks);
    const keys = [...new Set(alternative.flatMap(collectKeys))];
    const preimages = [...new Set(alternative.flatMap(collectPreimages))];
    return {
      title: `Path ${index + 1}`,
      availability: locks.length === 0 ? 'Immediate' : `After ${locks.join(' and ')}`,
      requirement: alternative.map(describeCondition).join(' AND '),
      keys,
      locks,
      preimages,
    };
  });
}

export function treeLeaves(tree: string): string[] {
  if (tree.startsWith('{') && tree.endsWith('}')) {
    const children = splitTopLevel(tree.slice(1, -1));
    if (children.length !== 2) throw new Error('Taproot tree requires exactly two children per branch.');
    return children.flatMap(treeLeaves);
  }
  return [tree];
}

export function calls(text: string, name: string): string[] {
  const results: string[] = [];
  let from = 0;
  while (true) {
    const start = text.indexOf(`${name}(`, from);
    if (start === -1) return results;
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
}

export function relativeLock(value: number): string {
  if ((value & CONSENSUS_LIMITS.bip68DisableFlag) !== 0)
    return `${value} (disabled flag set; invalid as an active relative lock)`;
  const units = value & CONSENSUS_LIMITS.bip68SequenceMask;
  if ((value & CONSENSUS_LIMITS.bip68TypeFlag) !== 0) {
    const seconds = units * 512;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${value} = ${units} × 512 seconds = ${seconds} seconds (${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')})`;
  }
  return `${value} = ${units} blocks`;
}
