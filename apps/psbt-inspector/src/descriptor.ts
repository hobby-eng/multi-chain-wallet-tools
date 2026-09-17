import { descriptorChecksum } from '@ckd/core/descriptor-checksum.js';
import { materializeDescriptorKey, validateDescriptorPublicKey } from '@ckd/core/descriptor-key.js';
import { CONSENSUS_LIMITS } from './consensus-limits.js';
import { analyzeMusigDescriptor } from './musig-descriptor.js';
import { compiledDescriptorOutput, validateDescriptorMiniscript, validateNodeKeys } from './descriptor-compiler.js';
import {
  calls,
  collectKeyExpressions,
  collectWrappers,
  describeAbsolute,
  describeCondition,
  describeTaprootKey,
  descriptorPathCards,
  expression,
  hashAlgorithm,
  matchingClose,
  miniscriptAnalysis,
  policyTree,
  relativeLock,
  shortenedKey,
  splitTopLevel,
  treeLeaves,
  WRAPPER_MEANINGS,
  type DescriptorPathCard,
} from './descriptor-policy.js';
import type { DecodedDescriptor, DescriptorRow } from './descriptor-types.js';
import type { PsbtNetwork } from './psbt-types.js';

export { descriptorChecksum };
export type { DescriptorPathCard } from './descriptor-policy.js';
export type { DecodedDescriptor, DescriptorCompiledOutput, DescriptorRow } from './descriptor-types.js';

export function decodeDescriptor(
  input: string,
  options: {
    readonly chain?: 'bitcoin' | 'dash';
    readonly network?: PsbtNetwork;
    readonly multipathChoice?: 0 | 1;
    readonly wildcardIndex?: number;
  } = {},
): DecodedDescriptor {
  const normalized = input.trim().replaceAll('\\_', '_').replaceAll('\\*', '*');
  const separator = normalized.lastIndexOf('#');
  const payload = separator === -1 ? normalized : normalized.slice(0, separator);
  const supplied = separator === -1 ? null : normalized.slice(separator + 1);
  if (payload.length === 0 || payload.length > 100_000) throw new Error('Descriptor is empty or unreasonably large.');
  if (supplied !== null && !/^[a-z0-9]{8}$/u.test(supplied))
    throw new Error('Invalid descriptor checksum: the checksum must contain eight characters.');
  const expected = descriptorChecksum(payload);
  if (supplied !== null && supplied !== expected) {
    const restoredWildcards = payload.replaceAll(/\/(?=[,)}])/gu, '/*');
    if (restoredWildcards !== payload && descriptorChecksum(restoredWildcards) === supplied) {
      throw new Error(
        `Invalid descriptor checksum: a wildcard was removed. One or more derivation paths end with "/"; restore "/*" at those positions and checksum ${supplied} is valid.`,
      );
    }
    throw new Error(
      `Invalid descriptor checksum: supplied ${supplied}, expected ${expected}. The checksum covers the exact descriptor text, including every derivation wildcard "*" and any spaces.`,
    );
  }
  if (/\s/u.test(payload))
    throw new Error(
      'Whitespace is not permitted inside a descriptor expression; its checksum covers the exact spaced text.',
    );
  const type = /^([a-z0-9_]+)\(/u.exec(payload)?.[1];
  if (type === undefined) throw new Error('Input is neither Script hex nor a recognized output descriptor.');
  if (
    !['tr', 'rawtr', 'sp', 'wsh', 'sh', 'pk', 'pkh', 'wpkh', 'combo', 'addr', 'raw', 'multi', 'sortedmulti'].includes(
      type,
    )
  )
    throw new Error(`Unsupported top-level descriptor ${type}().`);
  if (type === 'raw') {
    const open = payload.indexOf('(');
    const rawScript = payload.slice(open + 1, matchingClose(payload, open));
    if (rawScript.length === 0 || !/^[0-9a-fA-F]+$/u.test(rawScript))
      throw new Error('Malformed Script hex in raw(): only non-empty hexadecimal bytes are allowed.');
    if (rawScript.length % 2 !== 0)
      throw new Error('Malformed Script hex in raw(): odd-length hex is missing one nibble.');
  }
  if (options.chain === 'dash') {
    if (
      !['pk', 'pkh', 'sh', 'combo', 'addr', 'raw', 'multi', 'sortedmulti'].includes(type) ||
      /(?:^|[,(])(?:wpkh|wsh|tr|rawtr|sp|multi_a|sortedmulti_a|musig)\(/u.test(payload)
    ) {
      throw new Error(
        'Dash Community descriptors are limited to legacy pk(), pkh(), sh(), multi(), sortedmulti(), addr(), raw(), and supported legacy Script/Miniscript fragments. SegWit, Taproot, and MuSig2 are unavailable on Dash.',
      );
    }
  }

  const rows: DescriptorRow[] = [];
  const xpubs = [
    ...payload.matchAll(
      /(?:\[[0-9a-fA-F]{8}(?:\/[^\]]+)?\])?[xt]pub[1-9A-HJ-NP-Za-km-z]+(?:\/(?:[0-9]+['hH]?|<[^>]+>|\*))*/gu,
    ),
  ].map((match) => match[0]);
  rows.push({
    label: 'Extended public keys',
    value: `${xpubs.length} occurrences · ${new Set(xpubs).size} distinct expressions`,
  });
  xpubs.forEach((key, index) => rows.push({ label: `Key expression ${index + 1}`, value: shortenedKey(key) }));

  if (type === 'tr' || type === 'rawtr') {
    const close = matchingClose(payload, payload.indexOf('('));
    const argumentsList = splitTopLevel(payload.slice(payload.indexOf('(') + 1, close));
    rows.unshift({
      label: 'Taproot key path',
      value: argumentsList[0] === undefined ? 'Missing' : shortenedKey(argumentsList[0]),
    });
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
  if (parsedDescriptor === null)
    throw new Error('Unsupported top-level Miniscript or malformed descriptor expression.');
  if (
    type === 'tr'
      ? parsedDescriptor.args.length < 1 || parsedDescriptor.args.length > 2
      : !['multi', 'sortedmulti', 'sp'].includes(type) && parsedDescriptor.args.length !== 1
  )
    throw new Error('Invalid output descriptor arity.');
  if (type === 'combo' && typeof parsedDescriptor.args[0] !== 'string')
    throw new Error('combo() requires one public key expression.');
  if (type === 'sp') {
    if (parsedDescriptor.args.length !== 2) throw new Error('Silent Payments descriptors require scan and spend keys.');
    for (const key of parsedDescriptor.args) {
      if (typeof key === 'string')
        validateDescriptorPublicKey(key, options.network ?? 'mainnet', { wildcardIndex: options.wildcardIndex ?? 0 });
      else if (key.name !== 'musig') throw new Error('Invalid Silent Payments key expression.');
    }
  }
  validateNodeKeys(parsedDescriptor, options.network ?? 'mainnet', type === 'tr', options.wildcardIndex ?? 0);
  validateDescriptorMiniscript(payload, type);
  const musigs = calls(payload, 'musig');
  if (musigs.length > 0 && options.chain === 'dash')
    throw new Error('BIP-390 MuSig2 descriptors are supported for Bitcoin Taproot only.');
  const musigAnalysis = analyzeMusigDescriptor(
    payload,
    options.network ?? 'mainnet',
    options.wildcardIndex ?? 0,
    options.multipathChoice ?? 0,
  );
  const keyExpressions = [...new Set(collectKeyExpressions(parsedDescriptor))];
  keyExpressions.forEach((key, index) => {
    const origin = /^\[([^\]]+)\]/u.exec(key)?.[1];
    const extendedKey = /([xt]pub[1-9A-HJ-NP-Za-km-z]+)/u.exec(key)?.[1];
    const bareKey = key.replace(/^\[[^\]]+\]/u, '');
    const suffix =
      extendedKey === undefined ? 'fixed key' : key.slice(key.indexOf(extendedKey) + extendedKey.length) || 'none';
    rows.push(
      { label: `Key ${index + 1} · master fingerprint`, value: origin?.split('/')[0] ?? 'Not supplied' },
      {
        label: `Key ${index + 1} · origin path`,
        value: origin?.includes('/') === true ? `m/${origin.split('/').slice(1).join('/')}` : 'Not supplied',
      },
      {
        label: `Key ${index + 1} · ${extendedKey === undefined ? 'public key' : 'extended key'}`,
        value: extendedKey ?? bareKey,
      },
      { label: `Key ${index + 1} · descriptor suffix`, value: suffix },
      {
        label: `Key ${index + 1} · selected branch / index`,
        value: `${options.multipathChoice ?? 0} / ${options.wildcardIndex ?? 0}`,
      },
      {
        label: `Key ${index + 1} · derived public key`,
        value: /^[0-9a-fA-F]{64}$/u.test(bareKey)
          ? bareKey.toLowerCase()
          : materializeDescriptorKey(
              key,
              options.network ?? 'mainnet',
              options.multipathChoice ?? 0,
              options.wildcardIndex ?? 0,
            ),
      },
    );
  });
  if (parsedDescriptor !== null) {
    [...new Set(collectWrappers(parsedDescriptor))].forEach((wrapper) => {
      rows.push({
        label: `Wrapper ${wrapper}:`,
        value:
          WRAPPER_MEANINGS[wrapper] ??
          'recognized wrapper; inspect the compiled operations for its exact stack transformation',
      });
    });
  }
  const multisigs = [
    ...calls(payload, 'multi_a').map((body) => ({ body, sorted: false })),
    ...calls(payload, 'sortedmulti_a').map((body) => ({ body, sorted: true })),
  ];
  musigAnalysis?.keys.forEach((key, index) => {
    rows.push(
      {
        label: `MuSig2 aggregate ${index + 1}`,
        value: `${key.participantCount} participants · ${key.aggregateCompressedKey}`,
      },
      { label: `MuSig2 derivation ${index + 1}`, value: key.derivation },
      { label: `MuSig2 sorted participants ${index + 1}`, value: key.sortedParticipantKeys.join(' · ') },
    );
    if (key.syntheticXpub !== null)
      rows.push({ label: `BIP-328 synthetic xpub ${index + 1}`, value: key.syntheticXpub });
  });
  if (musigAnalysis?.outputScript !== null && musigAnalysis?.outputScript !== undefined)
    rows.push({ label: 'Derived output script', value: musigAnalysis.outputScript });
  if (musigAnalysis?.address !== null && musigAnalysis?.address !== undefined)
    rows.push({ label: 'Derived address', value: musigAnalysis.address });
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
      {
        label: `Multisig ${index + 1} · threshold`,
        value: `${String(argumentsList[0])}-of-${Math.max(0, argumentsList.length - 1)}`,
      },
      {
        label: `Multisig ${index + 1} · key order`,
        value: sorted ? 'BIP67 lexicographic sort · sortedmulti()' : 'Supplied order preserved · multi()',
      },
    );
  });
  multisigs.forEach(({ body, sorted }, index) => {
    const argumentsList = splitTopLevel(body);
    const threshold = Number(argumentsList[0]);
    rows.push({
      label: `Tapscript multisig ${index + 1}`,
      value: `${threshold}-of-${Math.max(0, argumentsList.length - 1)} · ${sorted ? 'lexicographic x-only key sort · sortedmulti_a()' : 'supplied key order · multi_a()'}`,
    });
  });
  const locks = calls(payload, 'older');
  locks.forEach((body, index) => {
    const value = Number(body);
    if (!Number.isSafeInteger(value) || value < 1 || value >= CONSENSUS_LIMITS.bip68DisableFlag)
      throw new Error(`older() value ${body} is invalid.`);
    const timeBased = (value & CONSENSUS_LIMITS.bip68TypeFlag) !== 0;
    const units = value & CONSENSUS_LIMITS.bip68SequenceMask;
    const approximateSeconds = timeBased ? units * 512 : units * 600;
    rows.push(
      { label: `Relative lock ${index + 1}`, value: relativeLock(value) },
      ...(units === 0
        ? [
            {
              label: `Timelock ${index + 1} · effective constraint`,
              value: 'None · BIP68 masks this value to a zero delay; reserved bits do not add a lock.',
            },
          ]
        : []),
      { label: `Timelock ${index + 1} · type`, value: 'Relative' },
      { label: `Timelock ${index + 1} · opcode`, value: 'OP_CHECKSEQUENCEVERIFY' },
      { label: `Timelock ${index + 1} · BIPs`, value: 'BIP68 / BIP112' },
      { label: `Timelock ${index + 1} · value`, value: relativeLock(value) },
      { label: `Timelock ${index + 1} · starts from`, value: 'Confirmation of the spent UTXO' },
      {
        label: `Timelock ${index + 1} · approximate duration`,
        value: `~${Math.round(approximateSeconds / 3600)} hours${timeBased ? ' (512-second units)' : ' (assuming ~10-minute blocks)'}`,
      },
    );
  });
  const absoluteLocks = calls(payload, 'after');
  absoluteLocks.forEach((body, index) => {
    const value = Number(body);
    if (!Number.isSafeInteger(value) || value < 1 || value >= CONSENSUS_LIMITS.bip68DisableFlag)
      throw new Error(`Invalid timelock: after() value ${body} is outside the supported nLockTime range.`);
    rows.push(
      {
        label: `Absolute timelock ${index + 1} · type`,
        value:
          value < CONSENSUS_LIMITS.absoluteLockTimeThreshold ? 'Absolute block height' : 'Absolute median-time-past',
      },
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
  const summaryParts = [
    type === 'tr'
      ? 'Taproot descriptor with key-path spending'
      : type === 'rawtr'
        ? 'Raw Taproot output descriptor'
        : type === 'sp'
          ? 'Silent Payments descriptor'
          : `${type} output descriptor`,
  ];
  if (multisigs.length > 0)
    summaryParts.push(`${multisigs.length} multi_a script-path ${multisigs.length === 1 ? 'branch' : 'branches'}`);
  if (locks.length > 0)
    summaryParts.push(`${locks.length} relative timelock ${locks.length === 1 ? 'condition' : 'conditions'}`);
  if (musigs.length > 0) summaryParts.push(`${musigs.length} MuSig2 aggregate ${musigs.length === 1 ? 'key' : 'keys'}`);
  if (hashlocks.length > 0)
    summaryParts.push(`${hashlocks.length} preimage/hashlock ${hashlocks.length === 1 ? 'condition' : 'conditions'}`);
  const spendingPaths: string[] = [];
  let cards: DescriptorPathCard[] = [];
  let tree: string[] = [];
  if (type === 'tr') {
    const close = matchingClose(payload, payload.indexOf('('));
    const argumentsList = splitTopLevel(payload.slice(payload.indexOf('(') + 1, close));
    if (argumentsList[0] !== undefined) {
      spendingPaths.push(
        `Taproot key path: ${describeTaprootKey(argumentsList[0])}; available without a script timelock if the corresponding private key is spendable.`,
      );
    }
    if (argumentsList[1] !== undefined)
      treeLeaves(argumentsList[1]).forEach((leaf, index) => {
        const parsed = expression(leaf);
        const condition = parsed === null ? `unrecognized leaf ${leaf}` : describeCondition(parsed);
        const hasTimelock = /(?:older|after)\(/u.test(leaf);
        spendingPaths.push(
          `Tapscript path ${index + 1}: ${condition}${hasTimelock ? '.' : '; available immediately without a timelock.'}`,
        );
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
    const hasHtlcShape =
      cards.some((card) => card.preimages.length > 0 && card.locks.length === 0) &&
      cards.some((card) => card.preimages.length === 0 && card.locks.length > 0);
    if (hasHtlcShape) {
      rows.push({
        label: 'HTLC-like structure',
        value:
          'One branch spends with a 32-byte hash preimage; an alternative branch spends after a timelock. Required signatures are listed separately for each path.',
      });
    }
  }
  rows.unshift(...spendingPaths.map((path, index) => ({ label: `Spending alternative ${index + 1}`, value: path })));
  return {
    classification:
      type === 'tr'
        ? 'BIP-386 Taproot output descriptor + Tapscript Miniscript'
        : type === 'rawtr'
          ? 'Bitcoin Core raw Taproot descriptor (referenced by BIP-390)'
          : type === 'sp'
            ? 'BIP-352 Silent Payments descriptor'
            : `${type} output descriptor`,
    summary: summaryParts.join(' · '),
    checksum: supplied === null ? `not supplied (calculated ${expected})` : `valid · ${supplied}`,
    ranged: payload.includes('*'),
    spendingPaths,
    pathCards: cards,
    policyTree: tree,
    rows,
    compiledOutput,
  };
}
