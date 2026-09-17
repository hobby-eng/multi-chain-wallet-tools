import { historyFields } from './history.js';
import type { RecoveryFinding, RecoverySection, RecoverySectionId, RecoveryWalletResult } from './types.js';

type RecoveryComponentGroupId = 'core' | 'platform' | 'identity' | 'shielded';

/**
 * Second-level result tabs. Each scanned seed phrase is split by component so
 * Core L1 addresses, Platform payment addresses, Platform identities and the
 * Orchard pool are never mixed in one list. Every Core-compatible P2PKH family
 * (BIP44, legacy mobile, CoinJoin, masternode holdings) is
 * an L1 address set and therefore lives under the Core tab.
 */
const componentGroups: ReadonlyArray<{
  id: RecoveryComponentGroupId;
  label: string;
  sections: readonly RecoverySectionId[];
}> = [
  { id: 'core', label: 'Dash Core · L1', sections: ['core', 'legacyCore', 'coinjoin', 'providerCollateral'] },
  { id: 'platform', label: 'Platform addresses', sections: ['platform'] },
  { id: 'identity', label: 'Platform identities', sections: ['identity'] },
  { id: 'shielded', label: 'Orchard pool', sections: ['shielded'] },
];

function groupSections(result: RecoveryWalletResult, group: (typeof componentGroups)[number]): RecoverySection[] {
  return group.sections
    .map((id) => result.sections.find((section) => section.id === id))
    .filter((section): section is RecoverySection => section !== undefined);
}

function groupSummary(sections: readonly RecoverySection[]): {
  label: string;
  tone: 'skipped' | 'failed' | 'partial' | 'complete';
} {
  if (sections.length === 0 || sections.every(({ state }) => state === 'skipped'))
    return { label: 'skipped', tone: 'skipped' };
  const funded = sections.reduce(
    (sum, section) => sum + section.findings.filter(({ balanceAtomic }) => (balanceAtomic ?? 0n) > 0n).length,
    0,
  );
  const listed = sections.reduce((sum, section) => sum + section.findings.length, 0);
  const count = funded === listed ? `${funded} funded` : `${funded} funded · ${listed} listed`;
  if (sections.some(({ state }) => state === 'failed')) return { label: `${count} · warning`, tone: 'failed' };
  if (sections.some(({ state }) => state === 'partial')) return { label: `${count} · partial`, tone: 'partial' };
  return { label: count, tone: 'complete' };
}

export function createDiscoveryRenderers(
  document: Document,
  writeClipboard: typeof import('@ckd/export/clipboard.js').writeClipboard,
  showError: (message: string) => void,
) {
  function copyButton(value: string, label = 'Copy'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      void writeClipboard(value)
        .then(() => {
          button.textContent = 'Copied';
          setTimeout(() => {
            button.textContent = label;
          }, 1100);
        })
        .catch((cause: unknown) => showError(cause instanceof Error ? cause.message : String(cause)));
    });
    return button;
  }

  function findingCard(finding: RecoveryFinding, compact = false): HTMLElement {
    const card = document.createElement('article');
    card.className = 'finding-card';
    const head = document.createElement('div');
    head.className = 'finding-head';
    const identity = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = finding.title;
    const subtitle = document.createElement('small');
    subtitle.textContent = finding.subtitle;
    identity.append(title, subtitle);
    const balance = document.createElement('div');
    balance.className = 'finding-balance';
    balance.textContent = finding.balanceLabel;
    const titleCopy = copyButton(finding.title);
    titleCopy.className = 'compact-copy';
    balance.append(document.createElement('br'), titleCopy);
    head.append(identity, balance);
    card.append(head);
    if (!compact) {
      const fields = document.createElement('dl');
      fields.className = 'finding-fields';
      for (const field of [
        ...finding.fields.filter(
          (field) =>
            finding.history === undefined ||
            !['Lifetime received', 'Lifetime sent', 'Lifetime fees spent', 'First seen', 'Last seen'].includes(
              field.label,
            ),
        ),
        ...(finding.history ? historyFields(finding.history) : []),
      ]) {
        const term = document.createElement('dt');
        term.textContent = field.label;
        const description = document.createElement('dd');
        description.textContent = field.value;
        fields.append(term, description);
        if (field.copyable === true) fields.append(copyButton(field.value));
        else fields.append(document.createElement('span'));
      }
      card.append(fields);
    }
    return card;
  }

  function renderMetric(label: string, value: string, tone = 'neutral'): HTMLElement {
    const metric = document.createElement('div');
    metric.className = `section-metric ${tone}`;
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = value;
    metric.append(name, amount);
    return metric;
  }

  function renderSection(section: RecoverySection, coinLabel = 'Dash'): HTMLElement {
    const article = document.createElement('section');
    article.className = `scan-section ${section.state}`;
    const head = document.createElement('div');
    head.className = 'scan-section-head';
    const copy = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = section.title;
    const description = document.createElement('p');
    description.textContent = section.description;
    copy.append(title, description);
    const state = document.createElement('span');
    state.className = `section-state ${section.state}`;
    state.textContent = section.state;
    head.append(copy, state);
    const metrics = document.createElement('div');
    metrics.className = 'section-metrics';
    metrics.append(...section.metrics.map((metric) => renderMetric(metric.label, metric.value, metric.tone)));
    const proof = document.createElement('p');
    proof.className = 'section-proof';
    proof.textContent = `${section.proof} · source: ${section.source}`;
    article.append(head, metrics, proof);
    if (section.warning !== undefined) {
      const warning = document.createElement('p');
      warning.className = 'section-warning';
      warning.textContent = section.warning;
      article.append(warning);
    }
    const findings = document.createElement('div');
    findings.className = 'finding-list';
    if (section.findings.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'finding-empty';
      const emptyMessages: Record<RecoverySectionId, string> = {
        core: 'No funded Dash Core L1 address was found in this section and scanned range.',
        legacyCore: 'No funded legacy mobile Core address was found in this section and scanned range.',
        coinjoin: 'No funded Dash Mobile CoinJoin · DIP9 address was found in this section and scanned range.',
        providerCollateral:
          'No funded provider collateral/holdings address was found in this section and scanned range.',
        platform: 'No funded Dash Platform payment address was found in this section and scanned range.',
        identity: 'No funded Dash Platform identity was found in this section and scanned range.',
        shielded: 'No spendable Dash Orchard note was found in this section of the complete pool scan.',
      };
      empty.textContent =
        section.state === 'complete'
          ? coinLabel === 'Dash'
            ? emptyMessages[section.id]
            : `No funded ${coinLabel} address was found in this section and scanned range.`
          : 'No authoritative findings are available for this section.';
      findings.append(empty);
    } else {
      findings.append(...section.findings.map((finding) => findingCard(finding)));
    }
    article.append(findings);
    return article;
  }

  let activeComponentGroup: RecoveryComponentGroupId = 'core';

  function renderComponentTabs(result: RecoveryWalletResult): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'component-results component-results-tabbed';
    const heading = document.createElement('header');
    heading.className = 'component-results-head';
    const title = document.createElement('h4');
    title.textContent = 'Detailed results by recovery type';
    const note = document.createElement('p');
    note.textContent = 'Select a tab to inspect its balances, derivation paths, activity, and recovery details.';
    heading.append(title, note);
    const tabs = document.createElement('div');
    tabs.className = 'component-result-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Scan components for this result');
    const panel = document.createElement('div');
    panel.className = 'component-result-panel';
    panel.setAttribute('role', 'tabpanel');
    const available = componentGroups.filter((group) => groupSections(result, group).length > 0);
    if (!available.some(({ id }) => id === activeComponentGroup)) activeComponentGroup = available[0]?.id ?? 'core';

    const renderPanel = (): void => {
      const group = available.find(({ id }) => id === activeComponentGroup) ?? available[0];
      panel.replaceChildren();
      if (group === undefined) return;
      panel.id = `component-panel-${result.inputId}-${group.id}`;
      panel.setAttribute('aria-label', group.label);
      panel.append(...groupSections(result, group).map((section) => renderSection(section)));
      for (const button of tabs.querySelectorAll<HTMLButtonElement>('[data-component-group]')) {
        const active = button.dataset.componentGroup === group.id;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      }
    };

    available.forEach((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'component-result-tab';
      button.dataset.componentGroup = group.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `component-panel-${result.inputId}-${group.id}`);
      const name = document.createElement('strong');
      name.textContent = group.label;
      const summary = groupSummary(groupSections(result, group));
      const detail = document.createElement('small');
      detail.className = summary.tone;
      detail.textContent = summary.label;
      button.append(name, detail);
      button.addEventListener('click', () => {
        activeComponentGroup = group.id;
        renderPanel();
      });
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const index = available.findIndex(({ id }) => id === activeComponentGroup);
        const next = available[(index + (event.key === 'ArrowRight' ? 1 : available.length - 1)) % available.length];
        if (next === undefined) return;
        activeComponentGroup = next.id;
        renderPanel();
        tabs.querySelector<HTMLButtonElement>(`[data-component-group="${next.id}"]`)?.focus();
      });
      tabs.append(button);
    });
    renderPanel();
    wrapper.append(heading, tabs, panel);
    return wrapper;
  }

  return {
    findingCard,
    renderMetric,
    renderSection,
    renderComponentTabs,
    resetComponentGroup(): void {
      activeComponentGroup = 'core';
    },
  };
}
