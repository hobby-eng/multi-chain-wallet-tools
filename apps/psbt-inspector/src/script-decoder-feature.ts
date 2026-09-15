import { decodeDescriptor, type DecodedDescriptor } from './descriptor.js';
import { decodeScript } from './script.js';
import { required, selectedNetwork, textElement } from './ui-common.js';

function detailRows(rows: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = document.createElement('dl');
  list.className = 'detail-list';
  for (const [label, value] of rows) list.append(textElement('dt', '', label), textElement('dd', '', value));
  return list;
}

export function installScriptDecoderFeature(options: { script: boolean; descriptor: boolean }): void {
  const scriptChain = required<HTMLSelectElement>('script-chain');
  const scriptNetwork = required<HTMLSelectElement>('script-network');
  const scriptRole = required<HTMLSelectElement>('script-role');
  const scriptBranch = required<HTMLSelectElement>('script-branch');
  const scriptWildcardIndex = required<HTMLInputElement>('script-wildcard-index');
  const scriptInput = required<HTMLTextAreaElement>('script-input');
  const decodeScriptButton = required<HTMLButtonElement>('decode-script');
  const clearScriptButton = required<HTMLButtonElement>('clear-script');
  const scriptError = required<HTMLDivElement>('script-error');
  const scriptResults = required<HTMLElement>('script-results');
  const scriptPolicy = required<HTMLElement>('script-policy');
  const scriptAsm = required<HTMLElement>('script-asm');
  const scriptClassification = required<HTMLElement>('script-classification');
  const scriptWrappers = required<HTMLElement>('script-wrappers');
  const scriptOperations = required<HTMLElement>('script-operations');
  function inspectScript(): void {
    scriptError.hidden = true;
    scriptResults.hidden = true;
    try {
      const compactInput = scriptInput.value.trim().replaceAll(/\s+/gu, '');
      const looksLikeDescriptor = /[()#]/u.test(compactInput);
      if (looksLikeDescriptor) {
        if (!options.descriptor) throw new Error('Descriptor decoding is not included in this build.');
        const descriptor = decodeDescriptor(scriptInput.value, {
          chain: scriptChain.value === 'dash' ? 'dash' : 'bitcoin',
          network: selectedNetwork(scriptNetwork, scriptChain.value === 'dash' ? 'dash' : 'bitcoin'),
          multipathChoice: scriptBranch.value === '1' ? 1 : 0,
          wildcardIndex: Number(scriptWildcardIndex.value),
        });
        scriptPolicy.textContent =
          descriptor.spendingPaths.length === 0 ? descriptor.summary : descriptor.spendingPaths.join('\n');
        scriptAsm.textContent =
          descriptor.compiledOutput?.asm ??
          'This descriptor is structurally decoded, but concrete compilation is not implemented for this descriptor family.';
        scriptClassification.textContent = `${descriptor.classification} · checksum ${descriptor.checksum} · ${descriptor.ranged ? 'ranged (*)' : 'fixed'}`;
        scriptWrappers.replaceChildren(renderDescriptorVisualization(descriptor));
        scriptOperations.replaceChildren(
          textElement('h3', 'psbt-subheading', 'Descriptor structure'),
          detailRows(descriptor.rows.map((row) => [row.label, row.value] as const)),
        );
        scriptResults.hidden = false;
        return;
      }

      function renderDescriptorVisualization(descriptor: DecodedDescriptor): HTMLElement {
        const root = document.createElement('section');
        root.className = 'descriptor-visualization';
        if (descriptor.compiledOutput !== null) {
          root.append(
            textElement('h3', 'psbt-subheading', 'Compiled descriptor data'),
            detailRows(descriptor.compiledOutput.rows.map((row) => [row.label, row.value] as const)),
          );
        }
        if (descriptor.pathCards.length > 0) {
          root.append(textElement('h3', 'psbt-subheading', 'Policy · spending paths'));
          const cards = document.createElement('div');
          cards.className = 'descriptor-path-cards';
          descriptor.pathCards.forEach((path) => {
            const card = document.createElement('article');
            card.className = 'descriptor-path-card';
            card.append(
              textElement('h4', '', path.title),
              detailRows([
                ['Availability', path.availability],
                ['Requirement', path.requirement],
                ['Keys', path.keys.length === 0 ? 'No direct signing key summarized' : path.keys.join('\n')],
                ['Preimage', path.preimages.length === 0 ? 'Not required' : path.preimages.join('\n')],
                ['Locks', path.locks.length === 0 ? 'None' : path.locks.join('\n')],
              ]),
            );
            cards.append(card);
          });
          root.append(cards);
        }
        if (descriptor.policyTree.length > 0) {
          root.append(
            textElement('h3', 'psbt-subheading', 'Policy tree'),
            textElement('pre', 'policy-tree', descriptor.policyTree.join('\n')),
          );
        }
        root.append(textElement('h3', 'psbt-subheading', 'Technical analysis'));
        return root;
      }
      if (!options.script) throw new Error('Raw Script decoding is not included in this build.');
      const decoded = decodeScript(
        scriptInput.value,
        scriptChain.value === 'dash' ? 'dash' : 'bitcoin',
        selectedNetwork(scriptNetwork, scriptChain.value === 'dash' ? 'dash' : 'bitcoin'),
        scriptRole.value === 'script-pubkey' ? 'script-pubkey' : 'spending',
      );
      scriptPolicy.textContent = decoded.inferredPolicy;
      scriptAsm.textContent = decoded.asm;
      scriptClassification.textContent = `${decoded.classification}${decoded.directAddress === null ? '' : ` · ${decoded.directAddress}`} · ${decoded.byteLength} bytes`;
      scriptWrappers.replaceChildren(
        ...decoded.wrappers.map((wrapper) => {
          const row = document.createElement('div');
          row.className = 'policy-row';
          row.append(
            textElement('span', '', wrapper.label),
            textElement('code', '', `${wrapper.address} · scriptPubKey ${wrapper.scriptPubKey}`),
          );
          return row;
        }),
      );
      const operationRows = decoded.operations.map(
        (operation) =>
          [
            `Byte ${operation.offset}`,
            `${operation.data === null ? operation.name : `${operation.name} · ${operation.data}`} — ${operation.meaning}`,
          ] as const,
      );
      const operationHeading = textElement('h3', 'psbt-subheading', 'Operations');
      scriptOperations.replaceChildren(operationHeading, detailRows(operationRows));
      scriptResults.hidden = false;
    } catch (error) {
      scriptError.textContent = error instanceof Error ? error.message : String(error);
      scriptError.hidden = false;
    }
  }

  decodeScriptButton.addEventListener('click', inspectScript);
  clearScriptButton.addEventListener('click', () => {
    scriptInput.value = '';
    scriptResults.hidden = true;
    scriptError.hidden = true;
  });
}
