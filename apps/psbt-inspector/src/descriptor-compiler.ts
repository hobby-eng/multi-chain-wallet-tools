import { descriptorChecksum } from '@ckd/core/descriptor-checksum.js';
import { materializeDescriptorKey, validateDescriptorPublicKey } from '@ckd/core/descriptor-key.js';
import { bytesToHex, hash160, hexToBytes, sha256 } from '@ckd/core/crypto.js';
import { compilePolicyMiniscript, validatePolicyMiniscript } from './miniscript-engine.js';
import { CONSENSUS_LIMITS } from './consensus-limits.js';
import { compileTaprootDescriptor } from './musig-descriptor.js';
import { describeScript } from './psbt-presentation.js';
import { decodeScript } from './script.js';
import { expression, matchingClose, splitTopLevel, treeLeaves, type ExpressionNode } from './descriptor-policy.js';
import type { DescriptorCompiledOutput } from './descriptor-types.js';
import type { PsbtNetwork } from './psbt-types.js';
import { bech32, bech32m, createBase58check } from '@scure/base';

const base58check = createBase58check(sha256);

function selectedAddressScript(address: string, network: PsbtNetwork): Uint8Array {
  if (/^(?:bc|tb|bcrt)1/iu.test(address)) {
    const expectedPrefix = network === 'mainnet' ? 'bc' : network === 'regtest' ? 'bcrt' : 'tb';
    const tentative = bech32.decode(address as `${string}1${string}`, 1000);
    const version = tentative.words[0];
    if (version === undefined || version > 16) throw new Error('Invalid witness address version.');
    const decoded = version === 0 ? tentative : bech32m.decode(address as `${string}1${string}`, 1000);
    if (decoded.prefix !== expectedPrefix) throw new Error(`Address does not belong to ${network}.`);
    const program = (version === 0 ? bech32 : bech32m).fromWords(decoded.words.slice(1));
    if (program.length < 2 || program.length > 40 || (version === 0 && ![20, 32].includes(program.length)))
      throw new Error('Invalid witness program length.');
    return Uint8Array.of(version === 0 ? 0 : 0x50 + version, program.length, ...program);
  }
  const payload = base58check.decode(address);
  if (payload.length !== 21) throw new Error('Invalid Base58 address payload.');
  const p2pkh = network === 'mainnet' ? 0x00 : 0x6f;
  const p2sh = network === 'mainnet' ? 0x05 : 0xc4;
  if (payload[0] === p2pkh) return Uint8Array.of(0x76, 0xa9, 0x14, ...payload.slice(1), 0x88, 0xac);
  if (payload[0] === p2sh) return Uint8Array.of(0xa9, 0x14, ...payload.slice(1), 0x87);
  throw new Error(`Address does not belong to ${network}.`);
}

export function validateNodeKeys(
  node: ExpressionNode,
  network: PsbtNetwork,
  tapscript = false,
  wildcardIndex = 0,
): void {
  const validate = (value: ExpressionNode | string | undefined, allowXOnly = tapscript): void => {
    if (typeof value !== 'string')
      throw new Error('Invalid public key: the descriptor key argument is missing or is not a key expression.');
    validateDescriptorPublicKey(value, network, { allowXOnly, wildcardIndex });
  };
  if (['pk', 'pk_k', 'pkh', 'pk_h', 'wpkh', 'combo'].includes(node.name) && typeof node.args[0] === 'string')
    validate(node.args[0]);
  if (node.name === 'rawtr' && typeof node.args[0] === 'string' && !node.args[0].startsWith('musig('))
    validate(node.args[0], true);
  if (node.name === 'tr' && typeof node.args[0] === 'string' && !node.args[0].startsWith('musig('))
    validate(node.args[0], true);
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

export function compiledDescriptorOutput(
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
    return {
      asm: decodeScript(bytesToHex(payment.script), chain, network, 'script-pubkey').asm,
      rows: [
        { label: 'scriptPubKey', value: bytesToHex(payment.script) },
        { label: 'Address', value: payment.address },
        { label: 'Output type', value: 'P2TR' },
        { label: 'Witness version', value: '1' },
      ],
    };
  } else if (type === 'multi' || type === 'sortedmulti') {
    const parsed = expression(payload);
    if (parsed === null) return null;
    const concreteMiniscript = materializedExpression(parsed, network, multipathChoice, wildcardIndex);
    const compiled = compilePolicyMiniscript(concreteMiniscript, { allowUncompressed: true, context: 'bare' });
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
      const redeem = inner?.rows.find((row) => row.label === 'scriptPubKey')?.value;
      if (redeem === undefined) return null;
      const script = Uint8Array.of(0xa9, 0x14, ...hash160(hexToBytes(redeem)), 0x87);
      return {
        asm: inner!.asm,
        rows: [
          ...inner!.rows.filter((row) => !['scriptPubKey', 'Address', 'Output type'].includes(row.label)),
          { label: 'Redeem script', value: redeem },
          { label: 'scriptPubKey', value: bytesToHex(script) },
          { label: 'Address', value: describeScript(script, chain, network).address! },
          { label: 'Output type', value: 'P2SH' },
        ],
      };
    }
    if (['wpkh', 'wsh', 'sh', 'tr', 'rawtr', 'addr', 'raw'].includes(parsed.name))
      throw new Error('Invalid nested output wrapper.');
    const concreteMiniscript = materializedExpression(parsed, network, multipathChoice, wildcardIndex);
    const compiled = compilePolicyMiniscript(concreteMiniscript, {
      allowUncompressed: type === 'sh',
      context: type === 'sh' ? 'p2sh' : 'p2wsh',
    });
    spendingScript = compiled.script;
    asm = compiled.asm;
    if (
      spendingScript.length >
      (type === 'sh' ? CONSENSUS_LIMITS.maximumScriptElementBytes : CONSENSUS_LIMITS.maximumScriptBytes)
    )
      throw new Error('Spending script exceeds the selected wrapper limit.');
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
    const concreteKey =
      type === 'rawtr' && /^[0-9a-fA-F]{64}$/u.test(argument)
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
  } else if (type === 'addr' && chain === 'bitcoin') {
    scriptPubKey = selectedAddressScript(argument, network);
    spendingScript = scriptPubKey;
    asm = decodeScript(bytesToHex(scriptPubKey), chain, network, 'script-pubkey').asm;
    concretePayload = `addr(${argument})`;
    outputType = describeScript(scriptPubKey, chain, network).type;
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
  const witnessProgram =
    witnessVersion === '0' || witnessVersion === '1' ? bytesToHex(scriptPubKey.slice(2)) : 'Not applicable';
  return {
    asm,
    rows: [
      {
        label: 'Normalized checksummed descriptor',
        value: `${concretePayload}#${descriptorChecksum(concretePayload)}`,
      },
      {
        label: type === 'wsh' ? 'Witness script' : type === 'sh' ? 'Redeem script' : 'Compiled script',
        value: bytesToHex(spendingScript),
      },
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

export function validateDescriptorMiniscript(payload: string, type: string): void {
  const validateFragment = (fragment: string, tapscript: boolean): void => {
    const parsed = expression(fragment);
    if (parsed === null) throw new Error('Unsupported top-level Miniscript: the fragment is not recognized.');
    if (['multi', 'sortedmulti', 'multi_a', 'sortedmulti_a'].includes(parsed.name)) {
      const thresholdText = parsed.args[0];
      const threshold = typeof thresholdText === 'string' ? Number(thresholdText) : Number.NaN;
      if (
        typeof thresholdText !== 'string' ||
        !/^[1-9][0-9]*$/u.test(thresholdText) ||
        !Number.isSafeInteger(threshold) ||
        threshold >= parsed.args.length
      )
        throw new Error('Invalid multisig threshold.');
      if (parsed.name === 'sortedmulti' || parsed.name === 'sortedmulti_a') return;
    }
    if (['wpkh', 'wsh', 'sh', 'tr', 'rawtr', 'addr', 'raw'].includes(parsed.name)) {
      throw new Error(
        `Invalid wrapper combination: ${parsed.name}() is an output descriptor, not a Miniscript fragment in this position.`,
      );
    }
    validatePolicyMiniscript(fragment, { tapscript });
  };
  if (type === 'wsh' || type === 'sh') {
    const open = payload.indexOf('(');
    const fragment = payload.slice(open + 1, matchingClose(payload, open));
    const parsed = expression(fragment);
    if (type === 'sh' && parsed !== null && (parsed.name === 'wpkh' || parsed.name === 'wsh')) return;
    validateFragment(fragment, false);
  }
  if (type === 'tr') {
    // Concrete Tapscript validation and compilation are performed together.
    const open = payload.indexOf('(');
    const args = splitTopLevel(payload.slice(open + 1, matchingClose(payload, open)));
    if (args[1] !== undefined) treeLeaves(args[1]);
  }
  if (type === 'multi' || type === 'sortedmulti') validateFragment(payload, false);
}
