export interface DescriptorRow { readonly label: string; readonly value: string }
export interface DecodedDescriptor {
  readonly classification: string;
  readonly summary: string;
  readonly checksum: string;
  readonly ranged: boolean;
  readonly spendingPaths: readonly string[];
  readonly pathCards: readonly DescriptorPathCard[];
  readonly policyTree: readonly string[];
  readonly rows: readonly DescriptorRow[];
  readonly compiledOutput: DescriptorCompiledOutput | null;
}

export interface DescriptorCompiledOutput {
  readonly asm: string;
  readonly rows: readonly DescriptorRow[];
}

export interface DescriptorPathCard {
  readonly title: string;
  readonly availability: string;
  readonly requirement: string;
  readonly keys: readonly string[];
  readonly locks: readonly string[];
  readonly preimages: readonly string[];
}

interface ExpressionNode {
  readonly name: string;
  readonly wrappers: string;
  readonly args: readonly (ExpressionNode | string)[];
}

const INPUT_CHARSET = "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];
const MAX_DESCRIPTOR_PATH_CARDS = 64;

function miniscriptAnalysis(miniscript: string, tapscript = false): string | null {
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

function polymod(checksum: bigint, value: number): bigint {
  const top = checksum >> 35n;
  let result = ((checksum & 0x7ffffffffn) << 5n) ^ BigInt(value);
  for (let index = 0; index < GENERATORS.length; index += 1) if (((top >> BigInt(index)) & 1n) !== 0n) result ^= GENERATORS[index]!;
  return result;
}

export function descriptorChecksum(payload: string): string {
  let checksum = 1n;
  let group = 0;
  let count = 0;
  for (const character of payload) {
    const position = INPUT_CHARSET.indexOf(character);
    if (position === -1) throw new Error(`Descriptor contains unsupported character ${JSON.stringify(character)}.`);
    checksum = polymod(checksum, position & 31);
    group = group * 3 + (position >> 5);
    count += 1;
    if (count === 3) { checksum = polymod(checksum, group); group = 0; count = 0; }
  }
  if (count > 0) checksum = polymod(checksum, group);
  for (let index = 0; index < 8; index += 1) checksum = polymod(checksum, 0);
  checksum ^= 1n;
  let result = '';
  for (let index = 0; index < 8; index += 1) result += CHECKSUM_CHARSET[Number((checksum >> BigInt(5 * (7 - index))) & 31n)];
  return result;
}

function matchingClose(text: string, open: number, opening = '(', closing = ')'): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === opening) depth += 1;
    else if (text[index] === closing) { depth -= 1; if (depth === 0) return index; }
  }
  throw new Error(`Descriptor has an unclosed ${opening}.`);
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
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
    else if (character === ',' && round === 0 && square === 0 && curly === 0) { parts.push(text.slice(start, index)); start = index + 1; }
    if (round < 0 || square < 0 || curly < 0) throw new Error('Descriptor delimiters are unbalanced.');
  }
  if (round !== 0 || square !== 0 || curly !== 0) throw new Error('Descriptor delimiters are unbalanced.');
  parts.push(text.slice(start));
  return parts;
}

function shortenedKey(key: string): string {
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

function expression(text: string): ExpressionNode | null {
  let body = text;
  let wrappers = '';
  const wrapper = /^([a-z]+):/u.exec(body);
  if (wrapper !== null) { wrappers = wrapper[1]!; body = body.slice(wrapper[0].length); }
  if (body === '0' || body === '1') return { name: body, wrappers, args: [] };
  const match = /^([a-z0-9_]+)\(/u.exec(body);
  if (match === null) return null;
  const open = match[0].length - 1;
  const close = matchingClose(body, open);
  const name = match[1]!;
  const rawArguments = splitTopLevel(body.slice(open + 1, close));
  const numericFirstArgument = ['thresh', 'multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(name);
  if (close !== body.length - 1 && !(name === 'musig' && /^\/(?:[0-9]+|<[^>]+>|\*)(?:\/(?:[0-9]+|<[^>]+>|\*))*$/u.test(body.slice(close + 1)))) return null;
  const args = rawArguments.map((argument, index): ExpressionNode | string => {
    if ((!numericFirstArgument || index !== 0) && (/^(?:[a-z]+:)?[a-z0-9_]+\(/u.test(argument) || /^(?:[a-z]+:)?[01]$/u.test(argument))) {
      return expression(argument) ?? argument;
    }
    return argument;
  });
  return { name, wrappers, args };
}

function nodeText(value: ExpressionNode | string): string {
  return typeof value === 'string' ? value : describeCondition(value);
}

function describeTaprootKey(value: ExpressionNode | string): string {
  if (typeof value !== 'string') return describeCondition(value);
  const parsed = expression(value);
  return parsed === null ? `one signature from ${describedKey(value)}` : describeCondition(parsed);
}

function unwrapWrapper(node: ExpressionNode): ExpressionNode {
  if (['sh', 'wsh'].includes(node.name) && node.args[0] !== undefined && typeof node.args[0] !== 'string') return unwrapWrapper(node.args[0]);
  return node;
}

function describeAbsolute(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return `invalid absolute lock ${value}`;
  if (value < 500_000_000) return `after block height ${value}`;
  const date = new Date(value * 1000);
  return Number.isNaN(date.valueOf()) ? `after Unix time ${value}` : `after approximately ${date.toISOString()} (Unix time ${value}, enforced using median-time-past)`;
}

const WRAPPER_MEANINGS: Readonly<Record<string, string>> = {
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

function collectWrappers(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  return [...value.wrappers, ...value.args.flatMap(collectWrappers)];
}

function describeCondition(node: ExpressionNode): string {
  if (['sh', 'wsh'].includes(node.name)) return `${node.name} wrapper: ${node.args.map(nodeText).join('; ')}`;
  if (['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(node.name)) {
    const required = Number(node.args[0]);
    const keys = node.args.slice(1);
    return `${required}-of-${keys.length} signatures (${keys.map((key) =>
      typeof key === 'string' ? describedKey(key) : describeTaprootKey(key)
    ).join('; ')})`;
  }

  if (node.name === 'musig') {
    const keys = node.args.filter((value): value is string => typeof value === 'string');
    return `MuSig2 aggregate key from ${keys.length} participants (${keys.map(describedKey).join('; ')}); cooperative spend uses one aggregate Schnorr signature`;
  }
  if (['pk', 'pk_k', 'pkh', 'pk_h'].includes(node.name)) return `one signature from ${describedKey(String(node.args[0] ?? 'unknown key'))}`;
  if (node.name === 'older') return `relative timelock ${relativeLock(Number(node.args[0]))} after confirmation of the spent UTXO`;
  if (node.name === 'after') return describeAbsolute(Number(node.args[0]));
  if (['sha256', 'hash256', 'ripemd160', 'hash160'].includes(node.name)) {
    return `reveal an exact 32-byte preimage whose ${hashAlgorithm(node.name)} digest is ${String(node.args[0] ?? '')}`;
  }
  if (['and_v', 'and_b', 'and_n'].includes(node.name)) return node.args.map(nodeText).join(' AND ');
  if (node.name === 'andor' && node.args.length === 3) return `if ${nodeText(node.args[0]!)}, then ${nodeText(node.args[1]!)}, otherwise ${nodeText(node.args[2]!)}`;
  if (['or_b', 'or_c', 'or_d', 'or_i'].includes(node.name)) return node.args.map(nodeText).join(' OR ');
  if (node.name === 'thresh') return `at least ${String(node.args[0])} of these conditions: ${node.args.slice(1).map(nodeText).join('; ')}`;
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
  if (['sha256', 'hash256', 'ripemd160', 'hash160'].includes(node.name)) return `${prefix}hashlock: ${hashAlgorithm(node.name)} ${String(node.args[0] ?? '')}`;
  if (['pk', 'pk_k', 'pkh', 'pk_h'].includes(node.name)) return `${prefix}${node.name}: ${shortenedKey(String(node.args[0] ?? 'unknown key'))}`;
  if (node.name === 'musig') return `${prefix}musig: aggregate ${node.args.length} keys`;
  if (['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(node.name)) {
    return `${prefix}${node.name}: ${String(node.args[0])}-of-${Math.max(0, node.args.length - 1)} keys`;
  }
  if (node.name === 'thresh') return `${prefix}threshold: ${String(node.args[0])} of ${Math.max(0, node.args.length - 1)} conditions`;
  return `${prefix}${node.name}`;
}

function policyTree(node: ExpressionNode, prefix = '', last = true): string[] {
  const line = `${prefix}${prefix.length === 0 ? '' : last ? '└─ ' : '├─ '}${treeLabel(node)}`;
  const children = node.args.filter((argument): argument is ExpressionNode => typeof argument !== 'string');
  const childPrefix = prefix.length === 0 ? '' : `${prefix}${last ? '   ' : '│  '}`;
  return [
    line,
    ...children.flatMap((child, index) => policyTree(child, childPrefix, index === children.length - 1)),
  ];
}

function collectKeys(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct = ['pk', 'pk_k', 'pkh', 'pk_h'].includes(value.name)
    ? [shortenedKey(String(value.args[0] ?? 'unknown key'))]
    : value.name === 'musig'
      ? value.args.filter((argument): argument is string => typeof argument === 'string').map(shortenedKey)
    : ['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(value.name)
      ? value.args.slice(1).filter((argument): argument is string => typeof argument === 'string').map(shortenedKey)
      : [];
  return [...direct, ...value.args.flatMap(collectKeys)];
}

function collectKeyExpressions(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct = ['pk', 'pk_k', 'pkh', 'pk_h', 'wpkh', 'combo', 'rawtr'].includes(value.name)
    ? (typeof value.args[0] === 'string' ? [value.args[0]] : [])
    : value.name === 'tr'
      ? (typeof value.args[0] === 'string' ? [value.args[0]] : [])
      : value.name === 'musig'
        ? value.args.filter((argument): argument is string => typeof argument === 'string')
        : ['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(value.name)
          ? value.args.slice(1).filter((argument): argument is string => typeof argument === 'string')
          : [];
  return [...direct, ...value.args.flatMap(collectKeyExpressions)].filter(Boolean);
}

function collectLocks(value: ExpressionNode | string): string[] {
  if (typeof value === 'string') return [];
  const direct = value.name === 'older'
    ? [`relative ${relativeLock(Number(value.args[0]))}`]
    : value.name === 'after' ? [describeAbsolute(Number(value.args[0]))] : [];
  return [...direct, ...value.args.flatMap(collectLocks)];
}

function hashAlgorithm(name: string): string {
  return name === 'sha256' ? 'SHA-256' : name === 'hash256' ? 'HASH256' : name === 'ripemd160' ? 'RIPEMD-160' : 'HASH160';
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
  return { paths: left.paths.flatMap((leftPath) => right.paths.map((rightPath) => [...leftPath, ...rightPath])), limited: false };
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
    if (primary.limited || fallback.limited || primary.paths.length + fallback.paths.length > MAX_DESCRIPTOR_PATH_CARDS) {
      return { paths: [], limited: true };
    }
    return { paths: [...primary.paths, ...fallback.paths], limited: false };
  }
  if (['and_v', 'and_b', 'and_n'].includes(node.name)) {
    return node.args.reduce<PathEnumeration>((paths, argument) => combinePaths(paths, pathAlternatives(argument)), { paths: [[]], limited: false });
  }
  return { paths: [[node]], limited: false };
}

function descriptorPathCards(node: ExpressionNode): DescriptorPathCard[] {
  const enumerated = pathAlternatives(node);
  if (enumerated.limited) {
    return [{
      title: 'Path summary',
      availability: 'Too many alternatives to enumerate safely',
      requirement: `This descriptor has more than ${MAX_DESCRIPTOR_PATH_CARDS} possible spending-path combinations. Review the symbolic policy tree instead.`,
      keys: [],
      locks: [],
      preimages: [],
    }];
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

function treeLeaves(tree: string): string[] {
  if (tree.startsWith('{') && tree.endsWith('}')) {
    const children = splitTopLevel(tree.slice(1, -1));
    if (children.length !== 2) throw new Error('Taproot tree requires exactly two children per branch.');
    return children.flatMap(treeLeaves);
  }
  return [tree];
}

function calls(text: string, name: string): string[] {
  const results: string[] = [];
  let from = 0;
  while (true) {
    const start = text.indexOf(`${name}(`, from);
    if (start === -1) return results;
    const open = start + name.length;
    const close = matchingClose(text, open);
    results.push(text.slice(open + 1, close));
    from = close + 1;
  }
}

function relativeLock(value: number): string {
  if ((value & 0x80000000) !== 0) return `${value} (disabled flag set; invalid as an active relative lock)`;
  const units = value & 0xffff;
  if ((value & (1 << 22)) !== 0) {
    const seconds = units * 512;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${value} = ${units} × 512 seconds = ${seconds} seconds (${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')})`;
  }
  return `${value} = ${units} blocks`;
}

function validateNodeKeys(node: ExpressionNode, network: PsbtNetwork, tapscript = false, wildcardIndex = 0): void {
  const validate = (value: ExpressionNode | string | undefined, allowXOnly = tapscript): void => {
    if (typeof value !== 'string') throw new Error('Invalid public key: the descriptor key argument is missing or is not a key expression.');
    validateDescriptorPublicKey(value, network, { allowXOnly, wildcardIndex });
  };
  if (['pk', 'pk_k', 'pkh', 'pk_h', 'wpkh', 'combo'].includes(node.name) && typeof node.args[0] === 'string') validate(node.args[0]);
  if (node.name === 'rawtr' && typeof node.args[0] === 'string' && !node.args[0].startsWith('musig(')) validate(node.args[0], true);
  if (node.name === 'tr' && typeof node.args[0] === 'string' && !node.args[0].startsWith('musig(')) validate(node.args[0], true);
  if (['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(node.name)) {
    node.args.slice(1).forEach((key) => {
      if (typeof key === 'string') validate(key, tapscript || node.name.endsWith('_a'));
    });
  }
  node.args.forEach((argument, index) => {
    if (typeof argument === 'string') return;
    validateNodeKeys(argument, network, tapscript || (node.name === 'tr' && index > 0), wildcardIndex);
  });
}

function materializedExpression(
  node: ExpressionNode,
  network: PsbtNetwork,
  multipathChoice: 0 | 1,
  wildcardIndex: number,
): string {
  const keyIndexes = ['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(node.name)
    ? new Set(node.args.slice(1).map((_, index) => index + 1))
    : new Set(['pk', 'pk_k', 'pkh', 'pk_h', 'wpkh', 'combo', 'rawtr'].includes(node.name) ? [0] : []);
  let args = node.args.map((argument, index) => {
    if (typeof argument !== 'string') return materializedExpression(argument, network, multipathChoice, wildcardIndex);
    return keyIndexes.has(index)
      ? materializeDescriptorKey(argument, network, multipathChoice, wildcardIndex)
      : argument;
  });
  const concreteName = node.name === 'sortedmulti' ? 'multi' : node.name === 'sortedmulti_a' ? 'multi_a' : node.name;
  if (node.name === 'sortedmulti' || node.name === 'sortedmulti_a') args = [args[0]!, ...args.slice(1).sort()];
  return `${node.wrappers.length > 0 ? `${node.wrappers}:` : ''}${concreteName}${concreteName === '0' || concreteName === '1' ? '' : `(${args.join(',')})`}`;
}

function compiledDescriptorOutput(
  payload: string,
  type: string,
  chain: 'bitcoin' | 'dash',
  network: PsbtNetwork,
  multipathChoice: 0 | 1,
  wildcardIndex: number,
): DescriptorCompiledOutput | null {
  const open = payload.indexOf('(');
  const close = matchingClose(payload, open);
  const argument = payload.slice(open + 1, close);
  let spendingScript: Uint8Array;
  let scriptPubKey: Uint8Array;
  let asm: string;
  let concretePayload: string;
  let outputType: string;

  if (type === 'tr' || type === 'rawtr') {
    const payment = compileTaprootDescriptor(payload, network, wildcardIndex, multipathChoice);
    return { asm: decodeScript(bytesToHex(payment.script), chain, network, 'script-pubkey').asm, rows: [
      { label: 'scriptPubKey', value: bytesToHex(payment.script) },
      { label: 'Address', value: payment.address },
      { label: 'Output type', value: 'P2TR' },
      { label: 'Witness version', value: '1' },
    ] };
  } else if (type === 'multi' || type === 'sortedmulti') {
    const parsed = expression(payload);
    if (parsed === null) return null;
    const concreteMiniscript = materializedExpression(parsed, network, multipathChoice, wildcardIndex);
    const compiled = compilePolicyMiniscript(concreteMiniscript, { allowUncompressed: true });
    spendingScript = compiled.script;
    scriptPubKey = spendingScript;
    asm = compiled.asm;
    concretePayload = concreteMiniscript;
    outputType = 'Bare multisig';
  } else if (type === 'wsh' || type === 'sh') {
    const parsed = expression(argument);
    if (parsed === null) return null;
    if (type === 'sh' && (parsed.name === 'wsh' || parsed.name === 'wpkh')) {
      const inner = compiledDescriptorOutput(argument, parsed.name, chain, network, multipathChoice, wildcardIndex);
      const redeem = inner?.rows.find(row => row.label === 'scriptPubKey')?.value;
      if (redeem === undefined) return null;
      const script = Uint8Array.of(0xa9, 0x14, ...hash160(hexToBytes(redeem)), 0x87);
      return { asm: inner!.asm, rows: [...inner!.rows.filter(row => !['scriptPubKey', 'Address', 'Output type'].includes(row.label)),
        { label: 'Redeem script', value: redeem }, { label: 'scriptPubKey', value: bytesToHex(script) },
        { label: 'Address', value: describeScript(script, chain, network).address! }, { label: 'Output type', value: 'P2SH' }] };
    }
    if (['wpkh', 'wsh', 'sh', 'tr', 'rawtr', 'addr', 'raw'].includes(parsed.name)) throw new Error('Invalid nested output wrapper.');
    const concreteMiniscript = materializedExpression(parsed, network, multipathChoice, wildcardIndex);
    const compiled = compilePolicyMiniscript(concreteMiniscript, { allowUncompressed: type === 'sh' });
    spendingScript = compiled.script;
    asm = compiled.asm;
    if (spendingScript.length > (type === 'sh' ? 520 : 10_000)) throw new Error('Spending script exceeds the selected wrapper limit.');
    if (type === 'wsh') {
      const witnessProgram = sha256(spendingScript);
      scriptPubKey = Uint8Array.of(0x00, 0x20, ...witnessProgram);
      outputType = 'P2WSH';
    } else {
      scriptPubKey = Uint8Array.of(0xa9, 0x14, ...hash160(spendingScript), 0x87);
      outputType = 'P2SH';
    }
    concretePayload = `${type}(${concreteMiniscript})`;
  } else if (['pk', 'pkh', 'wpkh', 'rawtr'].includes(type)) {
    const concreteKey = type === 'rawtr' && /^[0-9a-fA-F]{64}$/u.test(argument)
      ? argument.toLowerCase()
      : materializeDescriptorKey(argument, network, multipathChoice, wildcardIndex);
    if (type === 'pk') {
      spendingScript = Uint8Array.of(concreteKey.length / 2, ...hexToBytes(concreteKey), 0xac);
      scriptPubKey = spendingScript;
      asm = `<${concreteKey}> OP_CHECKSIG`;
      outputType = 'P2PK';
    } else if (type === 'pkh') {
      const digest = hash160(hexToBytes(concreteKey));
      scriptPubKey = Uint8Array.of(0x76, 0xa9, 0x14, ...digest, 0x88, 0xac);
      spendingScript = scriptPubKey;
      asm = `OP_DUP OP_HASH160 <${bytesToHex(digest)}> OP_EQUALVERIFY OP_CHECKSIG`;
      outputType = 'P2PKH';
    } else if (type === 'wpkh') {
      if (concreteKey.length !== 66) throw new Error('wpkh requires a compressed public key.');
      const digest = hash160(hexToBytes(concreteKey));
      scriptPubKey = Uint8Array.of(0x00, 0x14, ...digest);
      spendingScript = scriptPubKey;
      asm = `OP_0 <${bytesToHex(digest)}>`;
      outputType = 'P2WPKH';
    } else {
      const xOnly = concreteKey.length === 66 ? concreteKey.slice(2) : concreteKey;
      scriptPubKey = Uint8Array.of(0x51, 0x20, ...hexToBytes(xOnly));
      spendingScript = scriptPubKey;
      asm = `OP_1 <${xOnly}>`;
      outputType = 'P2TR';
    }
    concretePayload = `${type}(${concreteKey})`;
  } else if (type === 'raw' && /^(?:[0-9a-fA-F]{2})+$/u.test(argument)) {
    scriptPubKey = hexToBytes(argument);
    const decoded = decodeScript(argument, 'bitcoin', network, 'script-pubkey');
    spendingScript = scriptPubKey;
    asm = decoded.asm;
    concretePayload = `raw(${argument.toLowerCase()})`;
    outputType = decoded.classification;
  } else {
    return null;
  }

  const description = describeScript(scriptPubKey, chain, network);
  const witnessVersion = scriptPubKey[0] === 0x00 ? '0' : scriptPubKey[0] === 0x51 ? '1' : 'Not applicable';
  const witnessProgram = witnessVersion === '0' || witnessVersion === '1'
    ? bytesToHex(scriptPubKey.slice(2))
    : 'Not applicable';
  return {
    asm,
    rows: [
      { label: 'Normalized checksummed descriptor', value: `${concretePayload}#${descriptorChecksum(concretePayload)}` },
      { label: type === 'wsh' ? 'Witness script' : type === 'sh' ? 'Redeem script' : 'Compiled script', value: bytesToHex(spendingScript) },
      { label: type === 'wsh' ? 'Witness script ASM' : 'Script ASM', value: asm },
      { label: 'scriptPubKey', value: bytesToHex(scriptPubKey) },
      { label: 'Output type', value: outputType },
      { label: 'Address', value: description.address ?? 'No standard address encoding' },
      { label: 'Witness version', value: witnessVersion },
      { label: 'Witness program', value: witnessProgram },
      { label: 'Script size', value: `${spendingScript.length} bytes` },
    ],
  };
}

function validateDescriptorMiniscript(payload: string, type: string): void {
  const validateFragment = (fragment: string, tapscript: boolean): void => {
    const parsed = expression(fragment);
    if (parsed === null) throw new Error('Unsupported top-level Miniscript: the fragment is not recognized.');
    if (['sortedmulti', 'sortedmulti_a'].includes(parsed.name)) {
      const threshold = Number(parsed.args[0]);
      if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold >= parsed.args.length) throw new Error('Invalid multisig threshold.');
      return;
    }
    if (['wpkh', 'wsh', 'sh', 'tr', 'rawtr', 'addr', 'raw'].includes(parsed.name)) {
      throw new Error(`Invalid wrapper combination: ${parsed.name}() is an output descriptor, not a Miniscript fragment in this position.`);
    }
    validatePolicyMiniscript(fragment, { tapscript });
  };
  if (type === 'wsh') {
    const open = payload.indexOf('(');
    validateFragment(payload.slice(open + 1, matchingClose(payload, open)), false);
  }
  if (type === 'tr') {
    // Concrete Tapscript validation and compilation are performed together.
    const open = payload.indexOf('(');
    const args = splitTopLevel(payload.slice(open + 1, matchingClose(payload, open)));
    if (args[1] !== undefined) treeLeaves(args[1]);
  }
  if (type === 'multi') validateFragment(payload, false);
  if (type === 'sortedmulti') return;
}

export function decodeDescriptor(input: string, options: { readonly chain?: 'bitcoin' | 'dash'; readonly network?: PsbtNetwork; readonly multipathChoice?: 0 | 1; readonly wildcardIndex?: number } = {}): DecodedDescriptor {
  const normalized = input.trim().replaceAll('\\_', '_').replaceAll('\\*', '*').replaceAll(/\s+/gu, '');
  const separator = normalized.lastIndexOf('#');
  const payload = separator === -1 ? normalized : normalized.slice(0, separator);
  const supplied = separator === -1 ? null : normalized.slice(separator + 1);
  if (payload.length === 0 || payload.length > 100_000) throw new Error('Descriptor is empty or unreasonably large.');
  if (supplied !== null && !/^[a-z0-9]{8}$/u.test(supplied)) throw new Error('Invalid descriptor checksum: the checksum must contain eight characters.');
  const expected = descriptorChecksum(payload);
  if (supplied !== null && supplied !== expected) {
    const restoredWildcards = payload.replaceAll(/\/(?=[,)}])/gu, '/*');
    if (restoredWildcards !== payload && descriptorChecksum(restoredWildcards) === supplied) {
      throw new Error(`Invalid descriptor checksum: a wildcard was removed. One or more derivation paths end with "/"; restore "/*" at those positions and checksum ${supplied} is valid.`);
    }
    throw new Error(`Invalid descriptor checksum: supplied ${supplied}, expected ${expected}. The checksum covers the exact descriptor text, including every derivation wildcard "*".`);
  }
  const type = /^([a-z0-9_]+)\(/u.exec(payload)?.[1];
  if (type === undefined) throw new Error('Input is neither Script hex nor a recognized output descriptor.');
  if (!['tr', 'rawtr', 'sp', 'wsh', 'sh', 'pk', 'pkh', 'wpkh', 'combo', 'addr', 'raw', 'multi', 'sortedmulti'].includes(type)) throw new Error(`Unsupported top-level descriptor ${type}().`);
  if (type === 'raw') {
    const open = payload.indexOf('(');
    const rawScript = payload.slice(open + 1, matchingClose(payload, open));
    if (rawScript.length === 0 || !/^[0-9a-fA-F]+$/u.test(rawScript)) throw new Error('Malformed Script hex in raw(): only non-empty hexadecimal bytes are allowed.');
    if (rawScript.length % 2 !== 0) throw new Error('Malformed Script hex in raw(): odd-length hex is missing one nibble.');
  }
  if (options.chain === 'dash') {
    if (!['pk', 'pkh', 'sh', 'combo', 'addr', 'raw', 'multi', 'sortedmulti'].includes(type) || /(?:^|[,(])(?:wpkh|wsh|tr|rawtr|sp|multi_a|sortedmulti_a|musig)\(/u.test(payload)) {
      throw new Error('Dash Community descriptors are limited to legacy pk(), pkh(), sh(), multi(), sortedmulti(), addr(), raw(), and supported legacy Script/Miniscript fragments. SegWit, Taproot, and MuSig2 are unavailable on Dash.');
    }
  }

  const rows: DescriptorRow[] = [];
  const xpubs = [...payload.matchAll(/(?:\[[0-9a-fA-F]{8}(?:\/[^\]]+)?\])?[xt]pub[1-9A-HJ-NP-Za-km-z]+(?:\/(?:[0-9]+['hH]?|<[^>]+>|\*))*/gu)].map((match) => match[0]);
  rows.push({ label: 'Extended public keys', value: `${xpubs.length} occurrences · ${new Set(xpubs).size} distinct expressions` });
  xpubs.forEach((key, index) => rows.push({ label: `Key expression ${index + 1}`, value: shortenedKey(key) }));

  if (type === 'tr' || type === 'rawtr') {
    const close = matchingClose(payload, payload.indexOf('('));
    const argumentsList = splitTopLevel(payload.slice(payload.indexOf('(') + 1, close));
    rows.unshift({ label: 'Taproot key path', value: argumentsList[0] === undefined ? 'Missing' : shortenedKey(argumentsList[0]) });
    if (argumentsList[1] !== undefined) {
      treeLeaves(argumentsList[1]).forEach((leaf, index) => {
        const analysis = miniscriptAnalysis(leaf, true);
        if (analysis !== null) rows.push({ label: `Tapscript analysis ${index + 1}`, value: analysis });
      });
    }
  } else if (type === 'wsh' || type === 'sh') {
    const open = payload.indexOf('(');
    const inner = payload.slice(open + 1, matchingClose(payload, open));
    const analysis = miniscriptAnalysis(inner);
    if (analysis !== null) rows.push({ label: 'Miniscript analysis', value: analysis });
  }
  const parsedDescriptor = expression(payload);
  if (parsedDescriptor === null) throw new Error('Unsupported top-level Miniscript or malformed descriptor expression.');
  if (type === 'tr' ? parsedDescriptor.args.length < 1 || parsedDescriptor.args.length > 2 : !['multi', 'sortedmulti', 'sp'].includes(type) && parsedDescriptor.args.length !== 1) throw new Error('Invalid output descriptor arity.');
  if (type === 'combo' && typeof parsedDescriptor.args[0] !== 'string') throw new Error('combo() requires one public key expression.');
  if (type === 'sp') {
    if (parsedDescriptor.args.length !== 2) throw new Error('Silent Payments descriptors require scan and spend keys.');
    for (const key of parsedDescriptor.args) {
      if (typeof key === 'string') validateDescriptorPublicKey(key, options.network ?? 'mainnet', { wildcardIndex: options.wildcardIndex ?? 0 });
      else if (key.name !== 'musig') throw new Error('Invalid Silent Payments key expression.');
    }
  }
  validateNodeKeys(parsedDescriptor, options.network ?? 'mainnet', type === 'tr', options.wildcardIndex ?? 0);
  validateDescriptorMiniscript(payload, type);
  const musigs = calls(payload, 'musig');
  if (musigs.length > 0 && options.chain === 'dash') throw new Error('BIP-390 MuSig2 descriptors are supported for Bitcoin Taproot only.');
  const musigAnalysis = analyzeMusigDescriptor(payload, options.network ?? 'mainnet', options.wildcardIndex ?? 0, options.multipathChoice ?? 0);
  const keyExpressions = [...new Set(collectKeyExpressions(parsedDescriptor))];
  keyExpressions.forEach((key, index) => {
    const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
    const extendedKey = /([xt]pub[1-9A-HJ-NP-Za-km-z]+)/u.exec(key)?.[1];
    const bareKey = key.replace(/^\[[^\]]+\]/u, '');
    const suffix = extendedKey === undefined ? 'fixed key' : key.slice(key.indexOf(extendedKey) + extendedKey.length) || 'none';
    rows.push(
      { label: `Key ${index + 1} · master fingerprint`, value: origin?.split('/')[0] ?? 'Not supplied' },
      { label: `Key ${index + 1} · origin path`, value: origin?.includes('/') === true ? `m/${origin.split('/').slice(1).join('/')}` : 'Not supplied' },
      { label: `Key ${index + 1} · ${extendedKey === undefined ? 'public key' : 'extended key'}`, value: extendedKey ?? bareKey },
      { label: `Key ${index + 1} · descriptor suffix`, value: suffix },
      { label: `Key ${index + 1} · selected branch / index`, value: `${options.multipathChoice ?? 0} / ${options.wildcardIndex ?? 0}` },
      { label: `Key ${index + 1} · derived public key`, value: /^[0-9a-fA-F]{64}$/u.test(bareKey) ? bareKey.toLowerCase() : materializeDescriptorKey(key, options.network ?? 'mainnet', options.multipathChoice ?? 0, options.wildcardIndex ?? 0) },
    );
  });
  if (parsedDescriptor !== null) {
    [...new Set(collectWrappers(parsedDescriptor))].forEach((wrapper) => {
      rows.push({
        label: `Wrapper ${wrapper}:`,
        value: WRAPPER_MEANINGS[wrapper] ?? 'recognized wrapper; inspect the compiled operations for its exact stack transformation',
      });
    });
  }
  const multisigs = calls(payload, 'multi_a');
  musigAnalysis?.keys.forEach((key, index) => {
    rows.push(
      { label: `MuSig2 aggregate ${index + 1}`, value: `${key.participantCount} participants · ${key.aggregateCompressedKey}` },
      { label: `MuSig2 derivation ${index + 1}`, value: key.derivation },
      { label: `MuSig2 sorted participants ${index + 1}`, value: key.sortedParticipantKeys.join(' · ') },
    );
    if (key.syntheticXpub !== null) rows.push({ label: `BIP-328 synthetic xpub ${index + 1}`, value: key.syntheticXpub });
  });
  if (musigAnalysis?.outputScript !== null && musigAnalysis?.outputScript !== undefined) rows.push({ label: 'Derived output script', value: musigAnalysis.outputScript });
  if (musigAnalysis?.address !== null && musigAnalysis?.address !== undefined) rows.push({ label: 'Derived address', value: musigAnalysis.address });
  const compiledOutput = compiledDescriptorOutput(
    payload,
    type,
    options.chain ?? 'bitcoin',
    options.network ?? 'mainnet',
    options.multipathChoice ?? 0,
    options.wildcardIndex ?? 0,
  );
  const classicMultisigs = [
    ...calls(payload, 'multi').map((body) => ({ body, sorted: false })),
    ...calls(payload, 'sortedmulti').map((body) => ({ body, sorted: true })),
  ];
  classicMultisigs.forEach(({ body, sorted }, index) => {
    const argumentsList = splitTopLevel(body);
    rows.push(
      { label: `Multisig ${index + 1} · threshold`, value: `${String(argumentsList[0])}-of-${Math.max(0, argumentsList.length - 1)}` },
      { label: `Multisig ${index + 1} · key order`, value: sorted ? 'BIP67 lexicographic sort · sortedmulti()' : 'Supplied order preserved · multi()' },
    );
  });
  multisigs.forEach((body, index) => {
    const argumentsList = splitTopLevel(body);
    const threshold = Number(argumentsList[0]);
    rows.push({ label: `Tapscript multisig ${index + 1}`, value: `${threshold}-of-${Math.max(0, argumentsList.length - 1)} · key order preserved` });
  });
  const locks = calls(payload, 'older');
  locks.forEach((body, index) => {
    const value = Number(body);
    if (!Number.isSafeInteger(value) || value < 1 || value >= 0x80000000) throw new Error(`older() value ${body} is invalid.`);
    const timeBased = (value & (1 << 22)) !== 0;
    const units = value & 0xffff;
    const approximateSeconds = timeBased ? units * 512 : units * 600;
    rows.push(
      { label: `Relative lock ${index + 1}`, value: relativeLock(value) },
      { label: `Timelock ${index + 1} · type`, value: 'Relative' },
      { label: `Timelock ${index + 1} · opcode`, value: 'OP_CHECKSEQUENCEVERIFY' },
      { label: `Timelock ${index + 1} · BIPs`, value: 'BIP68 / BIP112' },
      { label: `Timelock ${index + 1} · value`, value: relativeLock(value) },
      { label: `Timelock ${index + 1} · starts from`, value: 'Confirmation of the spent UTXO' },
      { label: `Timelock ${index + 1} · approximate duration`, value: `~${Math.round(approximateSeconds / 3600)} hours${timeBased ? ' (512-second units)' : ' (assuming ~10-minute blocks)'}` },
    );
  });
  const absoluteLocks = calls(payload, 'after');
  absoluteLocks.forEach((body, index) => {
    const value = Number(body);
    if (!Number.isSafeInteger(value) || value < 1 || value >= 0x80000000) throw new Error(`Invalid timelock: after() value ${body} is outside the supported nLockTime range.`);
    rows.push(
      { label: `Absolute timelock ${index + 1} · type`, value: value < 500_000_000 ? 'Absolute block height' : 'Absolute median-time-past' },
      { label: `Absolute timelock ${index + 1} · opcode`, value: 'OP_CHECKLOCKTIMEVERIFY' },
      { label: `Absolute timelock ${index + 1} · BIP`, value: 'BIP65' },
      { label: `Absolute timelock ${index + 1} · value`, value: describeAbsolute(value) },
    );
  });
  const hashlocks = ['sha256', 'hash256', 'ripemd160', 'hash160'].flatMap((name) =>
    calls(payload, name).map((digest) => ({ name, digest })),
  );
  hashlocks.forEach(({ name, digest }, index) => {
    const expectedLength = name === 'sha256' || name === 'hash256' ? 64 : 40;
    if (!new RegExp(`^[0-9a-fA-F]{${expectedLength}}$`, 'u').test(digest)) {
      throw new Error(`${name}() requires exactly ${expectedLength / 2} digest bytes encoded as hexadecimal.`);
    }
    rows.push({
      label: `Hashlock ${index + 1}`,
      value: `${hashAlgorithm(name)} digest ${digest.toLowerCase()} · spending requires the exact 32-byte preimage`,
    });
  });
  const summaryParts = [type === 'tr' ? 'Taproot descriptor with key-path spending' : type === 'rawtr' ? 'Raw Taproot output descriptor' : type === 'sp' ? 'Silent Payments descriptor' : `${type} output descriptor`];
  if (multisigs.length > 0) summaryParts.push(`${multisigs.length} multi_a script-path ${multisigs.length === 1 ? 'branch' : 'branches'}`);
  if (locks.length > 0) summaryParts.push(`${locks.length} relative timelock ${locks.length === 1 ? 'condition' : 'conditions'}`);
  if (musigs.length > 0) summaryParts.push(`${musigs.length} MuSig2 aggregate ${musigs.length === 1 ? 'key' : 'keys'}`);
  if (hashlocks.length > 0) summaryParts.push(`${hashlocks.length} preimage/hashlock ${hashlocks.length === 1 ? 'condition' : 'conditions'}`);
  const spendingPaths: string[] = [];
  let cards: DescriptorPathCard[] = [];
  let tree: string[] = [];
  if (type === 'tr') {
    const close = matchingClose(payload, payload.indexOf('('));
    const argumentsList = splitTopLevel(payload.slice(payload.indexOf('(') + 1, close));
    if (argumentsList[0] !== undefined) {
      spendingPaths.push(`Taproot key path: ${describeTaprootKey(argumentsList[0])}; available without a script timelock if the corresponding private key is spendable.`);
    }
    if (argumentsList[1] !== undefined) treeLeaves(argumentsList[1]).forEach((leaf, index) => {
      const parsed = expression(leaf);
      const condition = parsed === null ? `unrecognized leaf ${leaf}` : describeCondition(parsed);
      const hasTimelock = /(?:older|after)\(/u.test(leaf);
      spendingPaths.push(`Tapscript path ${index + 1}: ${condition}${hasTimelock ? '.' : '; available immediately without a timelock.'}`);
    });
    const outer = expression(payload);
    if (outer !== null) {
      cards = descriptorPathCards(outer);
      tree = policyTree(outer);
    }
  } else {
    const outer = expression(payload);
    if (outer !== null) {
      spendingPaths.push(`Script path: ${describeCondition(outer)}.`);
      cards = descriptorPathCards(outer);
      tree = policyTree(outer);
    }
    const hasHtlcShape = cards.some((card) => card.preimages.length > 0 && card.locks.length === 0)
      && cards.some((card) => card.preimages.length === 0 && card.locks.length > 0);
    if (hasHtlcShape) {
      rows.push({
        label: 'HTLC-like structure',
        value: 'One branch spends with a 32-byte hash preimage; an alternative branch spends after a timelock. Required signatures are listed separately for each path.',
      });
    }
  }
  rows.unshift(...spendingPaths.map((path, index) => ({ label: `Spending alternative ${index + 1}`, value: path })));
  return {
    classification: type === 'tr' ? 'BIP-386 Taproot output descriptor + Tapscript Miniscript' : type === 'rawtr' ? 'Bitcoin Core raw Taproot descriptor (referenced by BIP-390)' : type === 'sp' ? 'BIP-352 Silent Payments descriptor' : `${type} output descriptor`,
    summary: summaryParts.join(' · '), checksum: supplied === null ? `not supplied (calculated ${expected})` : `valid · ${supplied}`,
    ranged: payload.includes('*'), spendingPaths, pathCards: cards, policyTree: tree, rows, compiledOutput,
  };
}
import { analyzeMiniscript } from '@bitcoinerlab/miniscript';
import { materializeDescriptorKey, validateDescriptorPublicKey } from './descriptor-key.js';
import { compilePolicyMiniscript, validatePolicyMiniscript } from './miniscript-engine.js';
import { analyzeMusigDescriptor, compileTaprootDescriptor } from './musig-descriptor.js';
import { describeScript, type PsbtNetwork } from './psbt.js';
import { bytesToHex, hash160, hexToBytes, sha256 } from '@ckd/core/crypto.js';
import { decodeScript } from './script.js';
