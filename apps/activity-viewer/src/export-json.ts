import type { PlatformIdentityLookupSnapshot } from '@ckd/dash-network/platform-identity-source.js';
import type { ViewerSingleExportState } from './export-model.js';

function groupedIdentityProofs(snapshot: PlatformIdentityLookupSnapshot): unknown[] {
  const grouped = new Map<string, { proof: PlatformIdentityLookupSnapshot['proofs'][number]; responseCount: number }>();
  for (const proof of snapshot.proofs) {
    const key = [proof.height, proof.coreChainLockedHeight, proof.protocolVersion, proof.responseTimeMs].join(':');
    const existing = grouped.get(key);
    if (existing === undefined) grouped.set(key, { proof, responseCount: 1 });
    else existing.responseCount += 1;
  }
  return [...grouped.values()].map(({ proof, responseCount }) => ({ ...proof, responseCount }));
}

function identityJsonData(state: Extract<ViewerSingleExportState, { mode: 'identity' }>): unknown {
  const { snapshot } = state;
  return {
    query: {
      kind: snapshot.inputKind,
      label: snapshot.inputLabel,
      publicKeyHashHex: snapshot.publicKeyHashHex,
      resolvedDpnsName: snapshot.resolvedDpnsName,
      resolvedDpnsDocumentId: snapshot.resolvedDpnsDocumentId,
      resolvedRegistrationTransactionHash: snapshot.resolvedRegistrationTransactionHash,
      requests: snapshot.requests,
      proofs: groupedIdentityProofs(snapshot),
    },
    identities: snapshot.identities.map((identity) => {
      const result = state.histories.find(({ identifier }) => identifier === identity.identifier);
      const history = result?.history ?? null;
      if (history === null) {
        return {
          identifier: identity.identifier,
          identifierHex: identity.identifierHex,
          names: identity.dpnsNames,
          state: {
            balanceCredits: identity.balanceCredits,
            revision: identity.revision,
            nonce: identity.nonce,
          },
          keys: identity.publicKeys,
          history: null,
          historyError: result?.error ?? null,
        };
      }
      return {
        identifier: identity.identifier,
        identifierHex: identity.identifierHex,
        names: identity.dpnsNames,
        state: {
          balanceCredits: identity.balanceCredits,
          revision: identity.revision,
          nonce: identity.nonce,
        },
        keys: identity.publicKeys,
        history: {
          source: {
            provider: history.provider,
            endpoint: history.endpoint,
            indexStatus: history.indexStatus,
            indexedHeight: history.indexedHeight,
            indexedTimeMs: history.indexedTimeMs,
            requests: history.requests,
          },
          explorerState: {
            owner: history.owner,
            balanceCredits: history.explorerBalanceCredits,
            revision: history.explorerRevision,
            nonce: history.explorerNonce,
            systemIdentity: history.systemIdentity,
          },
          registration: {
            timestampMs: history.registeredAtMs,
            type: history.registrationType,
            transactionHash: history.registrationTransactionHash,
            fundingSource: history.registrationFundingSource,
            coreTransactionHash: history.fundingCoreTransactionHash,
            coreTransactionOutputIndex: history.fundingCoreTransactionOutputIndex,
            coreTransactionError: history.fundingCoreTransactionError,
          },
          totals: {
            transactions: history.totalTransactions,
            transfers: history.totalTransfers,
            documents: history.totalDocuments,
            dataContracts: history.totalDataContracts,
            gasSpentCredits: history.totalGasSpentCredits,
            averageGasSpentCredits: history.averageGasSpentCredits,
            explorerReportedTopUps: history.totalTopUps,
            explorerReportedTopUpCredits: history.totalTopUpsCredits,
            withdrawals: history.totalWithdrawals,
            withdrawalCredits: history.totalWithdrawalsCredits,
            lastWithdrawalHash: history.lastWithdrawalHash,
            lastWithdrawalTimestampMs: history.lastWithdrawalTimestampMs,
          },
          aliases: history.aliases,
          activity: history.activity,
          documents: history.documents,
          dataContracts: history.dataContracts,
          withdrawals: history.withdrawals,
          tokens: history.tokens,
          historyLimit: history.historyLimit,
        },
        historyError: result?.error ?? null,
      };
    }),
  };
}

export function viewerJsonData(state: ViewerSingleExportState): unknown {
  if (state.mode === 'identity') return identityJsonData(state);
  if (state.mode === 'platform') {
    const { snapshot, history } = state;
    return {
      address: snapshot.address,
      state: {
        exists: snapshot.exists,
        balanceCredits: snapshot.balanceCredits,
        nonce: snapshot.nonce,
        proofHeight: snapshot.proofHeight,
        coreChainLockedHeight: snapshot.coreChainLockedHeight,
        protocolVersion: snapshot.protocolVersion,
        responseTimeMs: snapshot.responseTimeMs,
      },
      history: {
        provider: history.provider,
        endpoint: history.endpoint,
        base58Address: history.base58Address,
        totals: {
          transitions: history.totalTransitions,
          incomingTransitions: history.incomingTransitions,
          outgoingTransitions: history.outgoingTransitions,
          incomingCredits: history.totalIncomingCredits,
          outgoingCredits: history.totalOutgoingCredits,
        },
        explorerState: {
          balanceCredits: history.explorerBalanceCredits,
          nonce: history.explorerNonce,
        },
        transitions: history.transitions,
        historyLimit: history.historyLimit,
        indexStatus: history.indexStatus,
        indexedHeight: history.indexedHeight,
        indexedTimeMs: history.indexedTimeMs,
        requests: history.requests,
      },
    };
  }
  if (state.mode === 'core') {
    const { snapshot } = state;
    return {
      address: snapshot.address,
      provider: snapshot.provider,
      endpoint: snapshot.endpoint,
      balance: {
        confirmedDuffs: snapshot.balanceDuffs,
        unconfirmedDuffs: snapshot.unconfirmedDuffs,
        totalReceivedDuffs: snapshot.totalReceivedDuffs,
        totalSentDuffs: snapshot.totalSentDuffs,
      },
      transactionCount: snapshot.transactionCount,
      transactions: snapshot.transactions,
      historyLimit: snapshot.historyLimit,
      indexStatus: snapshot.indexStatus,
      indexedHeight: snapshot.indexedHeight,
      indexedTimeMs: snapshot.indexedTimeMs,
      requests: snapshot.requests,
    };
  }
  return {
    keyCapability: state.snapshot.keyKind,
    complete: state.snapshot.complete,
    summary: {
      scannedNotes: state.snapshot.scannedNotes,
      proofHeight: state.snapshot.proofHeight,
      protocolVersion: state.snapshot.protocolVersion,
      balanceCredits: state.snapshot.balance,
      externalReceivedCredits: state.snapshot.receivedExternal,
      externalSentCredits: state.snapshot.sentExternal,
      selfChangeCredits: state.snapshot.selfOrChange,
    },
    notes: state.snapshot.records,
  };
}
