import { bytesToHex } from '@ckd/core/crypto.js';
import {
  describeScript,
  pairName,
  pairSummary,
  parsePsbt,
  parsedTransactionId,
  transactionId,
  type ParsedPsbt,
  type PsbtChain,
  type PsbtNetwork,
  type SuppliedUtxo,
} from './psbt.js';
import { decodeScript } from './script.js';
import { analyzeInputSigning } from './signing-commitments.js';
import { describeOpReturn, describePreviousScriptSig } from './transaction-display.js';
import { required, selectedNetwork, syncNetworkChoice, textElement } from './ui-common.js';

export function installPsbtDecoderFeature(): void {
  const chainSelect = required<HTMLSelectElement>('psbt-chain');
  const networkSelect = required<HTMLSelectElement>('psbt-network');
  const psbtInput = required<HTMLTextAreaElement>('psbt-input');
  const inspectButton = required<HTMLButtonElement>('inspect-button');
  const clearButton = required<HTMLButtonElement>('clear-inspector');
  const errorBox = required<HTMLDivElement>('psbt-error');
  const results = required<HTMLElement>('psbt-results');
  const summary = required<HTMLDivElement>('psbt-summary');
  const transactionDetails = required<HTMLDivElement>('transaction-details');
  const mapDetails = required<HTMLDivElement>('map-details');

  function chain(): PsbtChain {
    return chainSelect.value === 'dash' ? 'dash' : 'bitcoin';
  }
  function network(): PsbtNetwork {
    return selectedNetwork(networkSelect, chain());
  }

  function detailRows(rows: readonly (readonly [string, string])[]): HTMLDListElement {
    const list = document.createElement('dl');
    list.className = 'psbt-detail-list';
    for (const [label, value] of rows) {
      list.append(textElement('dt', '', label), textElement('dd', '', value));
    }
    return list;
  }

  function stat(label: string, value: string): HTMLElement {
    const element = document.createElement('div');
    element.className = 'psbt-stat';
    element.append(textElement('span', 'psbt-stat-label', label), textElement('code', 'psbt-stat-value', value));
    return element;
  }

  function amount(value: bigint, selectedChain: PsbtChain): string {
    const whole = value / 100_000_000n;
    const fraction = (value % 100_000_000n).toString().padStart(8, '0');
    return `${whole}.${fraction} ${selectedChain === 'dash' ? 'DASH' : 'BTC'} (${value} ${selectedChain === 'dash' ? 'duffs' : 'sat'})`;
  }

  function unsignedFeeRateEstimate(parsed: ParsedPsbt): string {
    if (parsed.fee === null) return 'Unavailable · one or more input values are missing';
    if (parsed.transaction === null) return 'Unavailable · PSBT v2 does not carry one complete unsigned transaction';
    const rate = Number(parsed.fee) / parsed.transaction.raw.length;
    return `${rate.toFixed(2)} ${parsed.chain === 'dash' ? 'duffs' : 'sat'}/vB · not the final transaction fee rate; signatures increase serialized size`;
  }

  function transactionOutputRows(
    output: import('./psbt.js').TransactionOutput,
    chain: PsbtChain,
    selectedNetwork: PsbtNetwork,
  ): [string, string][] {
    const description = describeScript(output.script, chain, selectedNetwork);
    const rows: [string, string][] = [
      ['Amount', amount(output.value, chain)],
      ['Type', description.type],
      ['Address', description.address ?? '—'],
    ];
    const opReturn = describeOpReturn(output.script, chain, selectedNetwork);
    if (opReturn !== null) {
      rows.push(
        ['Payload hex', opReturn.payloadHex.length === 0 ? 'Empty' : opReturn.payloadHex],
        ['Payload size', `${opReturn.payloadSize} byte${opReturn.payloadSize === 1 ? '' : 's'}`],
      );
      if (opReturn.pushCount > 1) rows.push(['Payload pushes', opReturn.pushCount.toString()]);
    }
    rows.push(
      ['scriptPubKey ASM', outputAsm(output.script, chain, selectedNetwork)],
      ['scriptPubKey', bytesToHex(output.script)],
    );
    return rows;
  }

  function referencedOutputDetails(
    vout: number,
    utxo: SuppliedUtxo,
    chain: PsbtChain,
    selectedNetwork: PsbtNetwork,
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'referenced-output-card';
    section.append(
      textElement('h5', '', 'Referenced previous output'),
      detailRows([
        ['vout', vout.toString()],
        ...transactionOutputRows({ value: utxo.value, script: utxo.script }, chain, selectedNetwork),
        ['UTXO binding', '✓ Matches current input prevout'],
      ]),
    );
    return section;
  }

  function previousTransactionDetails(
    transaction: import('./psbt.js').ParsedTransaction,
    chain: PsbtChain,
    selectedNetwork: PsbtNetwork,
    referencedVout: number,
  ): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'previous-transaction-details';
    const heading = document.createElement('summary');
    heading.textContent = 'Complete previous transaction · non-witness UTXO';
    details.append(
      heading,
      detailRows([
        ['Transaction ID', parsedTransactionId(transaction)],
        ['Version', transaction.version.toString()],
        ['Dash transaction type', transaction.dashType === null ? 'Not applicable' : transaction.dashType.toString()],
        ['Serialized size', `${transaction.raw.length} bytes`],
        ['Witness serialization', transaction.hasWitness ? 'Present' : 'Not present'],
        ['Inputs', transaction.inputs.length.toString()],
        ['Outputs', transaction.outputs.length.toString()],
        ['Locktime', transaction.lockTime.toString()],
        ['Special payload', transaction.extraPayload === null ? 'None' : bytesToHex(transaction.extraPayload)],
      ]),
    );
    transaction.inputs.forEach((input, index) => {
      const card = document.createElement('article');
      card.className = 'previous-transaction-item';
      const scriptSig = describePreviousScriptSig(input.scriptSig, chain, selectedNetwork);
      const scriptRows: [string, string][] = [
        ['Previous output', `${input.txid}:${input.vout}`],
        ['Sequence', `0x${input.sequence.toString(16).padStart(8, '0')} (${input.sequence})`],
      ];
      if (scriptSig.signature !== null) {
        scriptRows.push(
          ['Previous transaction signature', scriptSig.signature],
          ['Signature hash', scriptSig.signatureHash ?? 'Unknown'],
          ['Public key', scriptSig.publicKey ?? '—'],
        );
      } else {
        scriptSig.pushes.forEach((push, pushIndex) => scriptRows.push([`Pushed item ${pushIndex + 1}`, push]));
      }
      scriptRows.push(
        ['scriptSig ASM', scriptSig.asm],
        ['Raw scriptSig', scriptSig.raw.length === 0 ? 'Empty' : scriptSig.raw],
      );
      card.append(textElement('h5', '', `Previous transaction input ${index}`), detailRows(scriptRows));
      details.append(card);
    });
    transaction.outputs.forEach((output, index) => {
      const card = document.createElement('article');
      card.className = `previous-transaction-item${index === referencedVout ? ' referenced-previous-output' : ''}`;
      card.append(
        textElement(
          'h5',
          '',
          `Previous transaction output ${index}${index === referencedVout ? ' · referenced by current input' : ''}`,
        ),
        detailRows(transactionOutputRows(output, chain, selectedNetwork)),
      );
      details.append(card);
    });
    details.append(detailRows([['Raw transaction', bytesToHex(transaction.raw)]]));
    return details;
  }

  function v2OutputScript(parsed: ParsedPsbt, index: number): Uint8Array | null {
    if (parsed.transaction !== null) return parsed.transaction.outputs[index]?.script ?? null;
    return parsed.outputs[index]?.find((item) => item.type === 4n && item.keyData.length === 0)?.value ?? null;
  }

  function renderMaps(
    title: string,
    scope: 'global' | 'input' | 'output',
    maps: readonly (readonly import('./psbt.js').PsbtPair[])[],
    chain: PsbtChain,
    selectedNetwork: PsbtNetwork,
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'psbt-map-section';
    section.append(textElement('h3', '', title));
    maps.forEach((map, index) => {
      const details = document.createElement('details');
      if (maps.length === 1) details.open = true;
      const heading = document.createElement('summary');
      heading.textContent =
        scope === 'global'
          ? `${map.length} key-value records`
          : `${scope === 'input' ? 'Input' : 'Output'} ${index} · ${map.length} records`;
      details.append(heading);
      if (map.length === 0) {
        details.append(textElement('p', 'field-note', 'No PSBT metadata supplied.'));
        section.append(details);
        return;
      }
      const table = document.createElement('div');
      table.className = 'psbt-map-table';
      for (const item of map) {
        const valueHex = bytesToHex(item.value);
        const rows: [string, string][] = [
          ['Field', pairName(scope, item.type, chain)],
          ['Type', `0x${item.type.toString(16)}`],
          ['Key data', item.keyData.length === 0 ? '—' : bytesToHex(item.keyData)],
          ['Value', valueHex.length === 0 ? '—' : valueHex],
        ];
        const interpretation = pairSummary(scope, item, chain);
        if (interpretation !== null) rows.splice(2, 0, ['Interpretation', interpretation]);
        const isInputScript = scope === 'input' && (item.type === 0x04n || item.type === 0x05n);
        const isOutputScript = scope === 'output' && (item.type === 0x00n || item.type === 0x01n);
        if (isInputScript || isOutputScript) {
          try {
            const decoded = decodeScript(bytesToHex(item.value), chain, selectedNetwork, 'spending');
            rows.splice(2, 0, ['Recognized script policy', decoded.inferredPolicy], ['Script ASM', decoded.asm]);
          } catch (error) {
            rows.splice(2, 0, ['Script decoding error', error instanceof Error ? error.message : String(error)]);
          }
        }
        table.append(detailRows(rows));
      }
      details.append(table);
      section.append(details);
    });
    return section;
  }

  function verificationMatrix(
    title: string,
    checks: readonly import('./psbt.js').PsbtVerificationCheck[],
  ): HTMLElement {
    const card = document.createElement('article');
    card.className = 'psbt-entry-card verification-card';
    card.append(textElement('h4', '', title));
    const table = document.createElement('div');
    table.className = 'verification-matrix';
    for (const check of checks) {
      const row = document.createElement('div');
      row.className = `verification-row verification-${check.status}`;
      const status =
        check.status === 'not-applicable'
          ? 'N/A'
          : check.status === 'not-verified'
            ? 'Not verified'
            : check.status === 'failed'
              ? 'Failed'
              : 'Internally verified';
      row.append(
        textElement('span', 'verification-relationship', check.relationship),
        textElement('strong', 'verification-status', status),
        textElement('span', 'verification-detail', check.detail),
      );
      table.append(row);
    }
    card.append(table);
    return card;
  }

  function inputMapCount(parsed: ParsedPsbt, types: readonly bigint[]): number {
    return parsed.inputs.filter((map) => map.some((item) => types.includes(item.type))).length;
  }

  function signingState(parsed: ParsedPsbt): string {
    const finalized = inputMapCount(parsed, [0x07n, 0x08n]);
    if (parsed.inputs.length > 0 && finalized === parsed.inputs.length) return 'Final scripts supplied for all inputs';
    const signed = inputMapCount(parsed, [0x02n, 0x07n, 0x08n, 0x13n, 0x14n, 0x1cn]);
    if (signed > 0) return `Signature or final-script data supplied for ${signed}/${parsed.inputs.length} inputs`;
    return 'Unsigned · no signatures or final scripts supplied';
  }

  function utxoState(parsed: ParsedPsbt): string {
    const known = parsed.inputValues.filter((value) => value !== null).length;
    if (known === 0) return `Missing for all ${parsed.inputs.length} inputs`;
    if (known === parsed.inputs.length) return `Supplied for all ${parsed.inputs.length} inputs`;
    return `Supplied for ${known}/${parsed.inputs.length} inputs`;
  }

  function signerMetadata(parsed: ParsedPsbt): string {
    const origins = inputMapCount(parsed, [0x06n, 0x16n]);
    return origins === 0
      ? 'No BIP32 key origins supplied; an external signer may still recognize its keys independently'
      : `BIP32 key origins supplied for ${origins}/${parsed.inputs.length} inputs`;
  }

  function outputAsm(script: Uint8Array, chain: PsbtChain, network: PsbtNetwork): string {
    try {
      return decodeScript(bytesToHex(script), chain, network, 'script-pubkey').asm;
    } catch (error) {
      return `Unable to decode ASM: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function render(parsed: ParsedPsbt): void {
    const selectedNetwork = network();
    const knownInputCount = parsed.inputValues.filter((value) => value !== null).length;
    results.hidden = false;
    summary.replaceChildren(
      stat('Chain parser', parsed.chain === 'dash' ? 'Dash Core' : 'Bitcoin'),
      stat('PSBT version', `v${parsed.version}`),
      stat('Inputs', parsed.inputs.length.toString()),
      stat('Outputs', parsed.outputs.length.toString()),
      stat('Supplied input values', `${knownInputCount}/${parsed.inputs.length}`),
      stat('Signing state', signingState(parsed)),
      stat('UTXO information', utxoState(parsed)),
      stat('Signer metadata', signerMetadata(parsed)),
    );
    const cards: HTMLElement[] = [];
    cards.push(
      textElement('h3', 'psbt-subheading', 'Transaction accounting'),
      textElement(
        'p',
        'field-note',
        'Amounts come from supplied UTXOs. This inspection does not verify blockchain inclusion, every script commitment, or transaction signatures.',
      ),
      detailRows([
        [
          'Supplied input total',
          knownInputCount === parsed.inputs.length
            ? amount(
                parsed.inputValues.reduce<bigint>((total, value) => total + (value ?? 0n), 0n),
                parsed.chain,
              )
            : `Unavailable · values missing for ${parsed.inputs.length - knownInputCount} input(s)`,
        ],
        [
          'Output total',
          amount(
            parsed.outputValues.reduce((total, value) => total + value, 0n),
            parsed.chain,
          ),
        ],
        [
          'Fee from supplied UTXOs (not chain-verified)',
          parsed.fee === null ? 'Unavailable · one or more input values are missing' : amount(parsed.fee, parsed.chain),
        ],
        ['Fee / current unsigned size', unsignedFeeRateEstimate(parsed)],
      ]),
    );
    cards.push(
      textElement('h3', 'psbt-subheading', 'Verification matrix'),
      textElement(
        'p',
        'field-note',
        'Verified means this offline inspector checked the stated relationship against data inside this PSBT. It does not prove blockchain inclusion or validate signatures.',
      ),
      verificationMatrix('Global PSBT checks', parsed.globalVerification),
      ...parsed.inputVerification.map((checks, index) => verificationMatrix(`Input ${index} checks`, checks)),
    );
    cards.push(
      textElement('h3', 'psbt-subheading', 'Signing commitments / transaction mutability'),
      textElement(
        'p',
        'field-note',
        'This explains what each input signature would commit under the requested sighash. It does not verify a signature or predict every node policy.',
      ),
      ...parsed.inputs.map((_map, index) => {
        const analysis = analyzeInputSigning(parsed, index);
        const card = document.createElement('article');
        card.className = 'psbt-entry-card signing-commitment-card';
        card.append(textElement('h4', '', `Input ${index}`));
        if (analysis.sighash.unusual)
          card.append(textElement('p', 'signing-policy-warning', '⚠ Unusual or inconsistent signing policy'));
        card.append(
          detailRows([
            ['Signature', analysis.signature],
            ['Signature protocol', analysis.protocol],
            ['Sighash', analysis.sighash.label],
            ['Current input', analysis.sighash.currentInput],
            ['Other inputs', analysis.sighash.otherInputs],
            ['Other input sequences', analysis.sighash.otherInputSequences],
            ['Outputs', analysis.sighash.outputs],
            ['Current input amount', analysis.sighash.currentInputAmount],
            ['RBF', analysis.rbf],
            ['Locktime', analysis.locktime],
            ['Relative locktime', analysis.relativeLocktime],
          ]),
        );
        return card;
      }),
    );
    if (parsed.transaction !== null) {
      cards.push(textElement('h3', 'psbt-subheading', 'Unsigned transaction'));
      const serializedSize = parsed.transaction.raw.length;
      cards.push(
        detailRows([
          [
            'Transaction ID',
            parsed.chain === 'dash' && parsed.transaction.dashType !== 0
              ? 'Unavailable from the special-transaction PSBT encoding alone'
              : transactionId(parsed.transaction.raw),
          ],
          ['Serialized size', `${serializedSize} bytes`],
          ['Virtual size', `${serializedSize} vB (unsigned transaction has no witness data)`],
          ['Weight', `${serializedSize * 4} WU`],
          ['Transaction version', parsed.transaction.version.toString()],
          [
            'Dash transaction type',
            parsed.transaction.dashType === null ? 'Not applicable' : parsed.transaction.dashType.toString(),
          ],
          ['Witness serialization', parsed.transaction.hasWitness ? 'Present' : 'Not present'],
          ['Locktime', parsed.transaction.lockTime.toString()],
          [
            'Special payload',
            parsed.transaction.extraPayload === null ? 'None' : bytesToHex(parsed.transaction.extraPayload),
          ],
        ]),
      );
      parsed.transaction.inputs.forEach((input, index) => {
        const card = document.createElement('article');
        card.className = 'psbt-entry-card';
        card.append(
          textElement('h4', '', `Input ${index}`),
          detailRows([
            ['Previous output', `${input.txid}:${input.vout}`],
            ['Sequence', `0x${input.sequence.toString(16).padStart(8, '0')} (${input.sequence})`],
            [
              'Input value',
              parsed.inputValues[index] === null || parsed.inputValues[index] === undefined
                ? 'Not supplied'
                : amount(parsed.inputValues[index], parsed.chain),
            ],
          ]),
        );
        const suppliedUtxo = parsed.inputUtxos[index];
        if (suppliedUtxo !== null && suppliedUtxo !== undefined) {
          card.append(referencedOutputDetails(input.vout, suppliedUtxo, parsed.chain, selectedNetwork));
          if (suppliedUtxo.previousTransaction !== null) {
            card.append(
              previousTransactionDetails(suppliedUtxo.previousTransaction, parsed.chain, selectedNetwork, input.vout),
            );
          }
        }
        cards.push(card);
      });
    }
    parsed.outputValues.forEach((value, index) => {
      const script = v2OutputScript(parsed, index);
      const card = document.createElement('article');
      card.className = 'psbt-entry-card psbt-output-card';
      const rows: [string, string][] =
        script === null
          ? [
              ['Amount', amount(value, parsed.chain)],
              ['Type', 'Script not supplied'],
              ['Address', '—'],
              ['scriptPubKey ASM', '—'],
              ['scriptPubKey', '—'],
            ]
          : transactionOutputRows({ value, script }, parsed.chain, selectedNetwork);
      card.append(textElement('h4', '', `Output ${index}`), detailRows(rows));
      cards.push(card);
    });
    transactionDetails.replaceChildren(...cards);
    mapDetails.replaceChildren(
      renderMaps('Global map', 'global', [parsed.global], parsed.chain, selectedNetwork),
      renderMaps('Input maps', 'input', parsed.inputs, parsed.chain, selectedNetwork),
      renderMaps('Output maps', 'output', parsed.outputs, parsed.chain, selectedNetwork),
    );
  }

  function inspect(): void {
    errorBox.hidden = true;
    results.hidden = true;
    try {
      render(parsePsbt(psbtInput.value, chain()));
    } catch (error) {
      errorBox.textContent = error instanceof Error ? error.message : String(error);
      errorBox.hidden = false;
    }
  }

  inspectButton.addEventListener('click', inspect);
  clearButton.addEventListener('click', () => {
    psbtInput.value = '';
    results.hidden = true;
    errorBox.hidden = true;
  });
  chainSelect.addEventListener('change', () => syncNetworkChoice(chainSelect, networkSelect));
  syncNetworkChoice(chainSelect, networkSelect);
}
