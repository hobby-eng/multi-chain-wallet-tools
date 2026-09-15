import { downloadText } from '@ckd/export/download.js';
import type { CoinAdapter } from '@ckd/coins/registry-base.js';
import type { NetworkName, ResultField } from '@ckd/core/types.js';
import { parseMnemonicEntries } from '@ckd/recovery-backup/mnemonic-entries.js';
import type { WalletMatcherTarget } from '@ckd/recovery/matcher-types.js';
import { DerivationCancelledError, DerivationWorkerClient } from '../workers/derive-client.js';
import {
  installNumberedInput,
  installSecretToggle,
  integer,
  lines,
  required,
  updateLineNumbers,
  type RecoveryFeatureContext,
} from './recovery-workspace-shared.js';

interface MatchFinding {
  readonly seedNumber: number;
  readonly addressNumber: number;
  readonly address: string;
  readonly normalizedAddress: string;
  readonly adapterId: string;
  readonly adapter: string;
  readonly account: number;
  readonly branch: number;
  readonly index: number;
  readonly path: string;
}
function adapterBranches(adapter: CoinAdapter): readonly number[] {
  if (adapter.id === 'dash-core-coinjoin') return [0, 1];
  if (adapter.addressBranches !== undefined) return [adapter.addressBranches.receive, adapter.addressBranches.change];
  if (adapter.branchControl?.options !== undefined) return adapter.branchControl.options.map(({ value }) => value);
  return [adapter.defaults.branch];
}
function adapterMetadata(context: RecoveryFeatureContext, id: string): CoinAdapter {
  if (id === 'dash-core-coinjoin')
    return { ...context.registry.getCoinAdapter('dash-core'), id, label: 'Dash Mobile CoinJoin · DIP9' };
  return context.registry.getCoinAdapter(id);
}
export function installWalletMatcher(context: RecoveryFeatureContext): void {
  installSecretToggle(
    '#toggle-matcher-secrets',
    '#matcher-seeds, #matcher-passphrases',
    'Reveal seed and passphrase lists',
    'Hide seed and passphrase lists',
  );
  const seedInput = required<HTMLTextAreaElement>('#matcher-seeds');
  const passphraseInput = required<HTMLTextAreaElement>('#matcher-passphrases');
  const addressInput = required<HTMLTextAreaElement>('#matcher-addresses');
  const seedGutter = required<HTMLElement>('#matcher-seed-lines');
  installNumberedInput(seedInput, seedGutter);
  installNumberedInput(passphraseInput, required('#matcher-passphrase-lines'));
  installNumberedInput(addressInput, required('#matcher-address-lines'));
  const normalizeSeedEntries = (): void => {
    const entries = parseMnemonicEntries(seedInput.value);
    if (entries.length === 0) return;
    seedInput.value = entries.join('\n');
    updateLineNumbers(seedInput, seedGutter);
  };
  seedInput.addEventListener('blur', normalizeSeedEntries);
  seedInput.addEventListener('paste', () => window.setTimeout(normalizeSeedEntries, 0));

  const matcherButton = required<HTMLButtonElement>('#run-wallet-matcher');
  const matcherCancel = required<HTMLButtonElement>('#cancel-wallet-matcher');
  const matcherStatus = required<HTMLElement>('#wallet-matcher-status');
  const matcherResults = required<HTMLElement>('#wallet-matcher-results');
  let matcherRevision = 0;
  let activeWorker: DerivationWorkerClient | null = null;

  matcherCancel.addEventListener('click', () => {
    matcherRevision += 1;
    activeWorker?.terminate(new DerivationCancelledError('Wallet matcher cancelled.'));
    activeWorker = null;
    matcherButton.disabled = false;
    matcherCancel.hidden = true;
    matcherStatus.textContent = 'Search cancelled.';
  });

  matcherButton.addEventListener('click', () => {
    const revision = ++matcherRevision;
    void (async () => {
      matcherButton.disabled = true;
      matcherCancel.hidden = false;
      matcherResults.replaceChildren();
      matcherResults.classList.remove('revealed');
      matcherStatus.textContent = 'Validating recovery inputs…';
      const seeds: Uint8Array[] = [];
      try {
        const linked = context.linkedValue('matcher');
        const mnemonics = linked === null ? parseMnemonicEntries(seedInput.value) : [linked.mnemonic];
        if (mnemonics.length === 0) throw new Error('Enter at least one BIP39 seed phrase, one phrase per line.');
        if (mnemonics.length > 100) throw new Error('Wallet Matcher accepts at most 100 seed phrases per run.');
        const passphrases = linked === null ? lines(passphraseInput.value, true) : [linked.passphrase];
        if (passphrases.slice(mnemonics.length).some((value) => value.length > 0)) {
          throw new Error('A passphrase line has no matching seed phrase line.');
        }
        const network = required<HTMLSelectElement>('#matcher-network').value as NetworkName;
        const targets = context.detectTargets(
          required<HTMLTextAreaElement>('#matcher-addresses').value,
          network,
          required<HTMLInputElement>('#matcher-force-all').checked,
        );
        const accountStart = integer(
          required<HTMLInputElement>('#matcher-account-start'),
          'Account start',
          0,
          2_147_483_647,
        );
        const accountEnd = integer(
          required<HTMLInputElement>('#matcher-account-end'),
          'Account finish',
          accountStart,
          2_147_483_647,
        );
        if (accountEnd - accountStart > 20) throw new Error('Scan at most 21 accounts in one Wallet Matcher run.');
        const indexStart = integer(required<HTMLInputElement>('#matcher-index-start'), 'Index start', 0, 2_147_483_647);
        const indexCount = integer(required<HTMLInputElement>('#matcher-index-count'), 'Indices to scan', 1, 5000);
        for (let index = 0; index < mnemonics.length; index += 1) {
          seeds.push(context.mnemonicToSeed(mnemonics[index]!, passphrases[index] ?? ''));
        }
        const findings: MatchFinding[] = [];
        const jobs = seeds.flatMap((_, seedIndex) => {
          const adapterTargets = new Map<string, WalletMatcherTarget[]>();
          for (const target of targets) {
            for (const adapterId of target.adapterIds) {
              const group = adapterTargets.get(adapterId) ?? [];
              group.push(target);
              adapterTargets.set(adapterId, group);
            }
          }
          return [...adapterTargets].flatMap(([adapterId, compatibleTargets]) => {
            const adapter = adapterMetadata(context, adapterId);
            const accounts =
              adapter.accountControl === false
                ? [adapter.defaults.account]
                : Array.from({ length: accountEnd - accountStart + 1 }, (_, offset) => accountStart + offset);
            return accounts.flatMap((account) =>
              adapterBranches(adapter).map((branch) => ({ seedIndex, adapter, compatibleTargets, account, branch })),
            );
          });
        });
        let completed = 0;
        activeWorker = new DerivationWorkerClient();
        for (const job of jobs) {
          if (revision !== matcherRevision) return;
          const results = await activeWorker.searchMany(
            job.adapter.id,
            { seed: seeds[job.seedIndex]!, network, account: job.account, branch: job.branch },
            job.compatibleTargets.map((target) => ({ id: target.id, address: target.normalized })),
            indexStart,
            indexCount,
          );
          for (const result of results) {
            const target = targets.find(({ id }) => id === result.id)!;
            findings.push({
              seedNumber: job.seedIndex + 1,
              addressNumber: Number(target.id.slice('address-'.length)),
              address: target.input,
              normalizedAddress: target.normalized,
              adapterId: job.adapter.id,
              adapter: job.adapter.label,
              account: job.account,
              branch: job.branch,
              index: result.index,
              path: result.path,
            });
          }
          completed += 1;
          matcherStatus.textContent = `Scanning ${completed}/${jobs.length} wallet structures…`;
        }
        if (revision !== matcherRevision) return;
        if (findings.length === 0) {
          matcherResults.textContent = 'No supplied address was found in the selected account and index ranges.';
        } else {
          const toolbar = document.createElement('div');
          toolbar.className = 'matcher-result-actions';
          const copyPublic = document.createElement('button');
          copyPublic.type = 'button';
          copyPublic.className = 'secondary compact';
          copyPublic.textContent = 'Copy public matches';
          const exportPublic = document.createElement('button');
          exportPublic.type = 'button';
          exportPublic.className = 'secondary compact';
          exportPublic.textContent = 'Download public matches';
          const revealPrivate = document.createElement('button');
          revealPrivate.type = 'button';
          revealPrivate.className = 'danger-outline compact';
          revealPrivate.textContent = 'Reveal matched private keys';
          toolbar.append(copyPublic, exportPublic, revealPrivate);

          const tableWrap = document.createElement('div');
          tableWrap.className = 'matcher-results-table-wrap';
          const table = document.createElement('table');
          table.className = 'matcher-results-table';
          const head = document.createElement('thead');
          const headerRow = document.createElement('tr');
          for (const label of ['Seed', 'Known address', 'Wallet structure', 'Path']) {
            const cell = document.createElement('th');
            cell.textContent = label;
            headerRow.append(cell);
          }
          head.append(headerRow);
          table.append(head);
          const body = document.createElement('tbody');
          const renderedRows: HTMLTableRowElement[] = [];
          for (const finding of findings) {
            const row = document.createElement('tr');
            for (const value of [
              `#${finding.seedNumber}`,
              `#${finding.addressNumber} · ${finding.address}`,
              finding.adapter,
              finding.path,
            ]) {
              const cell = document.createElement('td');
              cell.textContent = value;
              row.append(cell);
            }
            renderedRows.push(row);
            body.append(row);
          }
          table.append(body);
          tableWrap.append(table);
          matcherResults.append(toolbar, tableWrap);

          const publicTsv = [
            ['Seed', 'Known address', 'Wallet structure', 'Path'],
            ...findings.map((finding) => [String(finding.seedNumber), finding.address, finding.adapter, finding.path]),
          ]
            .map((row) => row.join('\t'))
            .join('\n');
          copyPublic.addEventListener('click', () => void context.writeClipboard(publicTsv));
          exportPublic.addEventListener('click', () =>
            downloadText(publicTsv, 'wallet-matcher-public-results.tsv', 'text/tab-separated-values'),
          );

          let privateTsv: string | null = null;
          let privateVisible = false;
          let copyPrivateButton: HTMLButtonElement | null = null;
          let exportPrivateButton: HTMLButtonElement | null = null;
          revealPrivate.addEventListener('click', () => {
            if (privateTsv !== null) {
              privateVisible = !privateVisible;
              matcherResults.classList.toggle('revealed', privateVisible);
              revealPrivate.textContent = privateVisible ? 'Hide matched private keys' : 'Reveal matched private keys';
              if (copyPrivateButton !== null) copyPrivateButton.disabled = !privateVisible;
              if (exportPrivateButton !== null) exportPrivateButton.disabled = !privateVisible;
              return;
            }
            void (async () => {
              revealPrivate.disabled = true;
              revealPrivate.textContent = 'Deriving matched private keys…';
              const privateWorker = new DerivationWorkerClient();
              const privateSeeds: Uint8Array[] = [];
              try {
                const linkedNow = context.linkedValue('matcher');
                const currentMnemonics =
                  linkedNow === null ? parseMnemonicEntries(seedInput.value) : [linkedNow.mnemonic];
                const currentPassphrases =
                  linkedNow === null ? lines(passphraseInput.value, true) : [linkedNow.passphrase];
                const currentNetwork = required<HTMLSelectElement>('#matcher-network').value as NetworkName;
                for (let index = 0; index < currentMnemonics.length; index += 1) {
                  privateSeeds.push(context.mnemonicToSeed(currentMnemonics[index]!, currentPassphrases[index] ?? ''));
                }
                const privateRows: string[][] = [];
                const privateFieldSets: ResultField[][] = [];
                for (let findingIndex = 0; findingIndex < findings.length; findingIndex += 1) {
                  const finding = findings[findingIndex]!;
                  const seed = privateSeeds[finding.seedNumber - 1];
                  if (seed === undefined)
                    throw new Error('The seed list changed after this search. Run Wallet Matcher again.');
                  const derived = await privateWorker.derive(finding.adapterId, {
                    seed,
                    network: currentNetwork,
                    account: finding.account,
                    branch: finding.branch,
                    start: finding.index,
                    count: 1,
                  });
                  const row = derived.rows.find(({ index }) => index === finding.index);
                  if (row === undefined) throw new Error(`Could not reproduce matched path ${finding.path}.`);
                  const fields = [
                    ...row.basic,
                    ...row.advanced,
                    ...(row.groups ?? []).flatMap((group) => [...group.basic, ...group.advanced]),
                  ];
                  const addressMatches = fields.some(
                    (field) =>
                      field.role === 'paymentAddress' &&
                      field.value.toLowerCase() === finding.normalizedAddress.toLowerCase(),
                  );
                  if (!addressMatches) {
                    throw new Error(
                      'Recovery inputs or search settings changed. Run Wallet Matcher again before reveal.',
                    );
                  }
                  const secrets = [
                    ...new Map(fields.filter(({ secret }) => secret).map((field) => [field.value, field])).values(),
                  ];
                  if (secrets.length === 0) throw new Error(`No private key field is available for ${finding.path}.`);
                  privateFieldSets.push(secrets);
                  privateRows.push([
                    String(finding.seedNumber),
                    finding.address,
                    finding.adapter,
                    finding.path,
                    secrets.map((field) => `${field.label}: ${field.value}`).join(' | '),
                  ]);
                }
                const privateHeader = document.createElement('th');
                privateHeader.textContent = 'Matched private keys';
                headerRow.append(privateHeader);
                for (let findingIndex = 0; findingIndex < privateFieldSets.length; findingIndex += 1) {
                  const privateCell = document.createElement('td');
                  privateCell.className = 'matcher-private-fields secret-value';
                  for (const field of privateFieldSets[findingIndex]!) {
                    const line = document.createElement('div');
                    const label = document.createElement('strong');
                    label.textContent = field.label;
                    const value = document.createElement('code');
                    value.textContent = field.value;
                    line.append(label, value);
                    privateCell.append(line);
                  }
                  renderedRows[findingIndex]!.append(privateCell);
                }
                privateTsv = [['Seed', 'Known address', 'Wallet structure', 'Path', 'PRIVATE MATERIAL'], ...privateRows]
                  .map((row) => row.join('\t'))
                  .join('\n');
                copyPrivateButton = document.createElement('button');
                copyPrivateButton.type = 'button';
                copyPrivateButton.className = 'secret-action compact';
                copyPrivateButton.textContent = 'Copy private matches';
                copyPrivateButton.addEventListener('click', () => void context.writeClipboard(privateTsv!));
                exportPrivateButton = document.createElement('button');
                exportPrivateButton.type = 'button';
                exportPrivateButton.className = 'secret-action compact';
                exportPrivateButton.textContent = 'Download private matches';
                exportPrivateButton.addEventListener('click', () =>
                  downloadText(privateTsv!, 'wallet-matcher-PRIVATE-results.tsv', 'text/tab-separated-values'),
                );
                toolbar.append(copyPrivateButton, exportPrivateButton);
                privateVisible = true;
                matcherResults.classList.add('revealed');
                revealPrivate.textContent = 'Hide matched private keys';
              } catch (cause) {
                matcherStatus.textContent =
                  cause instanceof Error ? cause.message : 'Matched private-key derivation failed.';
                revealPrivate.textContent = 'Reveal matched private keys';
              } finally {
                privateWorker.terminate();
                for (const seed of privateSeeds) seed.fill(0);
                revealPrivate.disabled = false;
              }
            })();
          });
        }
        matcherStatus.textContent = `${findings.length} match${findings.length === 1 ? '' : 'es'} found.`;
      } catch (cause) {
        if (revision === matcherRevision)
          matcherStatus.textContent = cause instanceof Error ? cause.message : 'Wallet search failed.';
      } finally {
        activeWorker?.terminate();
        activeWorker = null;
        for (const seed of seeds) seed.fill(0);
        if (revision === matcherRevision) {
          matcherButton.disabled = false;
          matcherCancel.hidden = true;
        }
      }
    })();
  });
}
