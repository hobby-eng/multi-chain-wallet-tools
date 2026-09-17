import { formatDashDuffs } from '@ckd/core/dash-units.js';
import { formatPlatformCredits } from '@ckd/dash-network/memo.js';
import type { PlatformAddressHistorySnapshot } from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { PlatformIdentityLookupSnapshot } from '@ckd/dash-network/platform-identity-source.js';
import type { CoreAddressSnapshot } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot } from '@ckd/dash-network/types.js';
import { formatDate, type createActivityRenderers } from './activity-renderers.js';

interface ActivityResultsViewOptions {
  readonly document: Document;
  readonly results: HTMLElement;
  readonly resultsHeading: HTMLHeadingElement;
  readonly resultsDescription: HTMLParagraphElement;
  readonly resultHelp: HTMLElement;
  readonly summary: HTMLDivElement;
  readonly activityList: HTMLDivElement;
  readonly completeness: HTMLParagraphElement;
  readonly ledgerTitle: HTMLElement;
  readonly ledgerOrder: HTMLElement;
  readonly renderers: ReturnType<typeof createActivityRenderers>;
}

export function createActivityResultsView(options: ActivityResultsViewOptions) {
  const {
    document,
    results,
    resultsHeading,
    resultsDescription,
    resultHelp,
    summary,
    activityList,
    completeness,
    ledgerTitle,
    ledgerOrder,
    renderers,
  } = options;
  const {
    stat,
    renderShieldedActivity,
    renderCoreTransaction,
    renderPlatformTransition,
    identityResultHeading,
    renderIdentityTabs,
  } = renderers;
  return {
    renderShielded(snapshot: ActivitySnapshot): void {
      completeness.classList.remove('viewer-completeness-warning');
      results.hidden = false;
      resultsHeading.textContent = 'Recovered shielded activity';
      resultsDescription.textContent = 'A local view reconstructed from the encrypted pool.';
      ledgerTitle.textContent = 'Activity ledger';
      ledgerOrder.textContent = 'Oldest → newest';
      resultHelp.textContent =
        'Results are note-level activity ordered by shielded-pool position. The current DAPI note query does not expose a state-transition hash or exact creation timestamp per encrypted note, so this viewer does not invent transaction IDs or dates. “Sent outputs” exclude notes that also decrypt as this wallet’s own change; protocol fees are not reconstructed here.';
      const unavailable =
        snapshot.keyKind === 'incoming'
          ? 'Unavailable with IVK'
          : snapshot.keyKind === 'outgoing'
            ? 'Unavailable with OVK'
            : 'Unavailable';
      const amount = (value: bigint | null): string => (value === null ? unavailable : formatPlatformCredits(value));
      summary.replaceChildren(
        stat('Spendable balance', amount(snapshot.balance), '◎', true),
        stat('External received', amount(snapshot.receivedExternal), '↓'),
        stat('External sent outputs', amount(snapshot.sentExternal), '↑'),
        stat('Self / change outputs', amount(snapshot.selfOrChange), '↻'),
        stat('Pool actions scanned', snapshot.scannedNotes.toString(), '⌁'),
        stat('Recovered notes', snapshot.records.length.toString(), '◇'),
      );
      if (!snapshot.complete)
        completeness.textContent = 'Partial scan: results are incomplete until the scan reaches the end of the pool.';
      else if (snapshot.keyKind === 'full')
        completeness.textContent = `Complete full-capability scan from pool position 0. Proof response height ${snapshot.proofHeight}; Platform protocol ${snapshot.protocolVersion}.`;
      else if (snapshot.keyKind === 'incoming')
        completeness.textContent = `Complete incoming-only scan. Received notes are visible; outgoing activity, spend state, and balance require the 96-byte FVK. Proof height ${snapshot.proofHeight}.`;
      else
        completeness.textContent = `Complete outgoing-only scan. Sent outputs are visible; incoming activity and balance require the 96-byte FVK. Proof height ${snapshot.proofHeight}.`;
      activityList.replaceChildren(...snapshot.records.map(renderShieldedActivity));
      if (snapshot.records.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = snapshot.complete
          ? `No ${snapshot.keyKind === 'full' ? 'incoming or outgoing' : snapshot.keyKind} notes were recovered by this viewing key.`
          : 'No notes recovered in the scanned portion yet.';
        activityList.append(empty);
      }
    },

    renderCore(snapshot: CoreAddressSnapshot): void {
      completeness.classList.remove('viewer-completeness-warning');
      results.hidden = false;
      resultsHeading.textContent = 'Dash Core address activity';
      resultsDescription.textContent = snapshot.address;
      ledgerTitle.textContent = 'Transaction ledger';
      ledgerOrder.textContent = `Newest ${snapshot.transactions.length.toLocaleString()} of ${snapshot.transactionCount.toLocaleString()}`;
      resultHelp.textContent =
        'Core totals come from the Dash-specific DashScan index after its synchronization status and latest indexed block are checked. “Total sent” is the sum of UTXO inputs spent from this address, while “total received” includes outputs returning as change. Each transaction therefore also shows its net effect on the queried address.';
      summary.replaceChildren(
        stat('Current balance', formatDashDuffs(snapshot.balanceDuffs), '◎', true),
        stat('Total received outputs', formatDashDuffs(snapshot.totalReceivedDuffs), '↓'),
        stat('Total spent inputs', formatDashDuffs(snapshot.totalSentDuffs), '↑'),
        stat('Transactions total', snapshot.transactionCount.toLocaleString(), '≡'),
        stat('Balance vs. confirmed flow', formatDashDuffs(snapshot.unconfirmedDuffs, true), '◌'),
        stat('Transactions loaded', snapshot.transactions.length.toLocaleString(), '◇'),
      );
      completeness.textContent =
        snapshot.transactions.length < snapshot.transactionCount
          ? `Totals cover the full address history. The ledger shows the newest ${snapshot.transactions.length.toLocaleString()} transactions because the display limit is ${snapshot.historyLimit.toLocaleString()}.`
          : 'The complete transaction list reported for this address is displayed.';
      activityList.replaceChildren(...snapshot.transactions.map(renderCoreTransaction));
      if (snapshot.transactions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = 'No Dash Core transactions were reported for this address.';
        activityList.append(empty);
      }
    },

    renderPlatform(snapshot: PlatformAddressSnapshot, history: PlatformAddressHistorySnapshot): void {
      results.hidden = false;
      resultsHeading.textContent = 'Dash Platform address state';
      resultsDescription.textContent =
        history.base58Address === null
          ? snapshot.address
          : `${snapshot.address} · legacy alias ${history.base58Address}`;
      ledgerTitle.textContent = 'Platform transition ledger';
      ledgerOrder.textContent = `Newest ${history.transitions.length.toLocaleString()} of ${history.totalTransitions.toLocaleString()}`;
      resultHelp.textContent =
        'Current balance and nonce come from proof-verified Platform DAPI. Lifetime totals and the address-indexed transition list come from the synchronized Dash Platform Explorer. Explorer does not expose the amount attributable to this address on each individual transition, so per-transition amounts are not invented.';
      summary.replaceChildren(
        stat('Current balance', formatPlatformCredits(snapshot.balanceCredits), '◎', true),
        stat('Lifetime incoming', formatPlatformCredits(history.totalIncomingCredits), '↓'),
        stat('Lifetime outgoing', formatPlatformCredits(history.totalOutgoingCredits), '↑'),
        stat('Address transitions', history.totalTransitions.toLocaleString(), '≡'),
        stat('Outgoing address nonce', snapshot.nonce.toLocaleString(), '↗'),
        stat('Verified Platform height', snapshot.proofHeight.toLocaleString(), '✓'),
      );
      const agrees =
        snapshot.balanceCredits === history.explorerBalanceCredits && snapshot.nonce === BigInt(history.explorerNonce);
      completeness.classList.toggle('viewer-completeness-warning', !agrees);
      const proofText = snapshot.exists
        ? `Address state proof verified at Platform height ${snapshot.proofHeight}; protocol ${snapshot.protocolVersion}; Core ChainLocked height ${snapshot.coreChainLockedHeight}.`
        : `No funded state entry exists at proof-verified Platform height ${snapshot.proofHeight}.`;
      const explorerText = `Explorer index ${history.indexStatus} at height ${history.indexedHeight.toLocaleString()} (${formatDate(history.indexedTimeMs)}); ${history.incomingTransitions.toLocaleString()} incoming and ${history.outgoingTransitions.toLocaleString()} outgoing transitions.`;
      completeness.textContent = agrees
        ? `${proofText} ${explorerText} Explorer balance/nonce agree with the DAPI proof.`
        : `${proofText} ${explorerText} WARNING: Explorer balance or nonce differs from the DAPI proof; the proof-verified values shown above take precedence.`;
      activityList.replaceChildren(...history.transitions.map(renderPlatformTransition));
      if (history.transitions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = 'No Platform address transitions were reported by the synchronized Explorer index.';
        activityList.append(empty);
      }
    },

    renderIdentity(snapshot: PlatformIdentityLookupSnapshot, histories: PlatformIdentityHistoryResult[]): void {
      results.hidden = false;
      resultsHeading.textContent = 'Dash Platform Identity';
      resultsDescription.textContent =
        snapshot.identities.length === 0
          ? `${snapshot.inputLabel} · no registered Identity found`
          : 'Proof-verified state and indexed history';
      ledgerTitle.textContent = 'Identity details';
      ledgerOrder.textContent = `${snapshot.identities.length.toLocaleString()} proof-verified result(s)`;
      resultHelp.textContent =
        'Use the local tabs to switch between overview and names, registered keys, unified activity, documents, contracts, withdrawals, and tokens without making another network request. Identity state, nonce, keys, key roles, key hashes, and DPNS names come from proof-verified DAPI queries. Explorer timestamps and history remain auxiliary indexed data.';
      const allKeys = snapshot.identities.flatMap(({ publicKeys }) => publicKeys);
      const totalBalance = snapshot.identities.reduce((total, { balanceCredits }) => total + balanceCredits, 0n);
      const verifiedNames = snapshot.identities.reduce((total, { dpnsNames }) => total + dpnsNames.length, 0);
      const matchedKeys = allKeys.filter(({ matchesLookup }) => matchesLookup).length;
      const proofHeight = snapshot.proofs.reduce((highest, { height }) => (height > highest ? height : highest), 0n);
      summary.replaceChildren(
        stat('Identities found', snapshot.identities.length.toLocaleString(), '◇', true),
        stat('Combined current balance', formatPlatformCredits(totalBalance), '◎'),
        stat('Registered keys', allKeys.length.toLocaleString(), '⌁'),
        stat('Matched keys', matchedKeys.toLocaleString(), '✓'),
        stat('Verified DPNS names', verifiedNames.toLocaleString(), '@'),
        stat('Highest proof height', proofHeight.toLocaleString(), '↥'),
      );
      const historyWarnings = histories.flatMap(({ history }) => history?.historyWarnings ?? []);
      const failedHistories = histories.filter(({ error }) => error !== null);
      const disagreements = histories.filter(({ identifier, history }) => {
        if (history === null) return false;
        const identity = snapshot.identities.find((item) => item.identifier === identifier);
        return (
          identity !== undefined &&
          (identity.balanceCredits !== history.explorerBalanceCredits ||
            identity.revision !== history.explorerRevision ||
            (identity.nonce !== null && history.explorerNonce !== null && identity.nonce !== history.explorerNonce))
        );
      });
      completeness.classList.toggle(
        'viewer-completeness-warning',
        failedHistories.length > 0 || disagreements.length > 0 || historyWarnings.length > 0,
      );
      const hashText =
        snapshot.publicKeyHashHex === null ? '' : ` Lookup registered-public-key HASH160 ${snapshot.publicKeyHashHex}.`;
      const nameText =
        snapshot.resolvedDpnsName === null
          ? ''
          : snapshot.resolvedDpnsDocumentId === null
            ? ` DPNS ${snapshot.resolvedDpnsName} resolved and reverse-confirmed by proof.`
            : ` DPNS ${snapshot.resolvedDpnsName} resolved with proof document ${snapshot.resolvedDpnsDocumentId}.`;
      const transactionText =
        snapshot.resolvedRegistrationTransactionHash === null
          ? ''
          : ` Registration transition ${snapshot.resolvedRegistrationTransactionHash} was decoded locally and its Identity owner was proof-verified.`;
      completeness.textContent =
        snapshot.identities.length === 0
          ? `No matching registered Identity was present in the proof-verified state.${hashText}${nameText}${transactionText}`
          : failedHistories.length > 0
            ? `DAPI verified ${snapshot.identities.length.toLocaleString()} Identity result(s). Indexed history failed for ${failedHistories.length.toLocaleString()} result(s); proof-verified state remains authoritative.${hashText}${nameText}${transactionText}`
            : disagreements.length > 0
              ? `DAPI verified ${snapshot.identities.length.toLocaleString()} Identity result(s). WARNING: ${disagreements.length.toLocaleString()} Explorer snapshot(s) disagree with current proof values; DAPI values take precedence.${hashText}${nameText}${transactionText}`
              : `DAPI verified ${snapshot.identities.length.toLocaleString()} Identity result(s), and synchronized Explorer balance/revision/nonce values agree where available.${hashText}${nameText}${transactionText}`;
      if (historyWarnings.length > 0) completeness.textContent += ` ${[...new Set(historyWarnings)].join(' ')}`;
      activityList.replaceChildren(
        ...snapshot.identities.flatMap((identity) => [
          identityResultHeading(identity),
          renderIdentityTabs(
            identity,
            histories.find(({ identifier }) => identifier === identity.identifier),
          ),
        ]),
      );
      if (snapshot.identities.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'viewer-empty';
        empty.textContent = 'No Identity matched this public identifier or key fingerprint.';
        activityList.append(empty);
      }
    },
  };
}
