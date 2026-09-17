import type { RecoveryExportFormat } from './export.js';
import type { RecoveryWalletResult } from './types.js';
import type { createDiscoveryRenderers } from './discovery-renderers.js';

export function groupRecoveryResultsByCoin(
  results: readonly RecoveryWalletResult[],
  coinOrder: readonly string[] = [],
) {
  const groups = new Map<string, { id: string; label: string; reports: RecoveryWalletResult[] }>();
  for (const result of results) {
    const group = groups.get(result.coinId) ?? { id: result.coinId, label: result.coinLabel, reports: [] };
    group.reports.push(result);
    groups.set(result.coinId, group);
  }
  return [...groups.values()].sort((left, right) => {
    const leftIndex = coinOrder.indexOf(left.id);
    const rightIndex = coinOrder.indexOf(right.id);
    return (leftIndex < 0 ? coinOrder.length : leftIndex) - (rightIndex < 0 ? coinOrder.length : rightIndex);
  });
}

interface DiscoveryResultsViewOptions {
  readonly document: Document;
  readonly resultList: HTMLElement;
  readonly resultTabs: HTMLElement;
  readonly resultsSection: HTMLElement;
  readonly walletProgressRoot: HTMLElement;
  readonly progressShell: HTMLElement;
  readonly exportCsvButton: HTMLButtonElement;
  readonly exportJsonButton: HTMLButtonElement;
  readonly exportXlsxButton: HTMLButtonElement;
  readonly coinOrder: () => readonly string[];
  readonly renderers: Pick<
    ReturnType<typeof createDiscoveryRenderers>,
    'renderMetric' | 'renderSection' | 'renderComponentTabs' | 'resetComponentGroup'
  >;
}

export function createDiscoveryResultsView(options: DiscoveryResultsViewOptions) {
  const {
    document,
    resultList,
    resultTabs,
    resultsSection,
    walletProgressRoot,
    progressShell,
    exportCsvButton,
    exportJsonButton,
    exportXlsxButton,
    coinOrder,
    renderers,
  } = options;

  return {
    render(
      results: readonly RecoveryWalletResult[],
      selectedCoinId: string | null,
      exportFormats: ReadonlySet<RecoveryExportFormat>,
      selectCoin: (coinId: string) => void,
    ): void {
      resultList.replaceChildren();
      resultTabs.replaceChildren();
      const coinGroups = groupRecoveryResultsByCoin(results, coinOrder());
      const activeCoinId = coinGroups.some(({ id }) => id === selectedCoinId) ? selectedCoinId : coinGroups[0]?.id;
      for (const coin of coinGroups) {
        const reports = coin.reports;
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'recovery-result-tab';
        const active = coin.id === activeCoinId;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-pressed', String(active));
        const failed = reports.some((result) =>
          result.sections.some(({ state }) => state === 'failed' || state === 'partial'),
        );
        tab.textContent = coin.label + (failed ? ' · warning' : '');
        tab.addEventListener('click', () => selectCoin(coin.id));
        resultTabs.append(tab);
      }
      for (const result of results.filter((result) => result.coinId === activeCoinId)) {
        const wallet = document.createElement('article');
        wallet.className = 'wallet-result';
        const head = document.createElement('div');
        head.className = 'wallet-result-head';
        const copy = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = result.label;
        const subtitle = document.createElement('p');
        subtitle.textContent = `${result.coinLabel} · ${result.network} · completed ${new Date(result.completedAt).toLocaleString()}`;
        copy.append(title, subtitle);
        const state = document.createElement('span');
        state.className = 'wallet-state';
        state.textContent = result.sections.some(
          ({ state: sectionState }) => sectionState === 'failed' || sectionState === 'partial',
        )
          ? 'Completed with warnings'
          : 'Scan complete';
        head.append(copy, state);
        wallet.append(head);
        for (const message of result.warnings) {
          const warning = document.createElement('p');
          warning.className = 'section-warning';
          warning.textContent = message;
          wallet.append(warning);
        }
        const overview = document.createElement('section');
        overview.className = 'wallet-overview';
        const overviewTitle = document.createElement('strong');
        overviewTitle.textContent = 'Wallet-wide located balances';
        const overviewNote = document.createElement('p');
        overviewNote.textContent =
          result.coinId === 'dash'
            ? 'This total includes funded Core addresses, Platform payment addresses, identity credits, and spendable Orchard notes from the completed sections below.'
            : `This total includes the ${result.coinLabel} resources found in the completed scan below.`;
        const overviewMetrics = document.createElement('div');
        overviewMetrics.className = 'section-metrics wallet-overview-metrics';
        overviewMetrics.append(
          ...result.overview.map((metric) => renderers.renderMetric(metric.label, metric.value, metric.tone)),
        );
        overview.append(overviewTitle, overviewNote, overviewMetrics);
        wallet.append(overview);
        if (result.coinId === 'dash') {
          wallet.append(renderers.renderComponentTabs(result));
        } else {
          const sections = document.createElement('div');
          sections.className = 'component-results single-component-results';
          sections.append(...result.sections.map((section) => renderers.renderSection(section, result.coinLabel)));
          wallet.append(sections);
        }
        resultList.append(wallet);
      }
      resultTabs.hidden = coinGroups.length < 2;
      resultsSection.hidden = results.length === 0;
      let minimumTabWidth = 96;
      for (const tab of resultTabs.querySelectorAll<HTMLButtonElement>('.recovery-result-tab')) {
        tab.style.width = 'max-content';
        tab.style.whiteSpace = 'nowrap';
        minimumTabWidth = Math.max(minimumTabWidth, Math.ceil(tab.getBoundingClientRect().width));
        tab.style.removeProperty('width');
        tab.style.removeProperty('white-space');
      }
      resultTabs.style.setProperty('--coin-result-tab-min-width', `${minimumTabWidth}px`);
      exportCsvButton.disabled = !exportFormats.has('csv');
      exportJsonButton.disabled = !exportFormats.has('json');
      exportXlsxButton.disabled = !exportFormats.has('json');
    },

    reset(): void {
      renderers.resetComponentGroup();
      resultList.replaceChildren();
      resultTabs.replaceChildren();
      walletProgressRoot.replaceChildren();
      resultsSection.hidden = true;
      progressShell.hidden = true;
      exportCsvButton.disabled = true;
      exportJsonButton.disabled = true;
      exportXlsxButton.disabled = true;
    },
  };
}
