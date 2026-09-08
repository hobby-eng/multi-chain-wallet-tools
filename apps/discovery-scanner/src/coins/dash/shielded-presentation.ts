import type { ShieldedActivity } from '@ckd/dash-network/types.js';
import { formatDashFromCredits } from './util.js';

export function shieldedFindingPresentation(record: ShieldedActivity): {
  balanceAtomic: bigint;
  balanceLabel: string;
  spendState: string;
} {
  if (record.incoming === undefined) {
    return {
      balanceAtomic: 0n,
      balanceLabel: 'Current balance unavailable · outgoing view only',
      spendState: 'Outgoing view only',
    };
  }
  if (record.spent === true) {
    return {
      balanceAtomic: 0n,
      balanceLabel: '0 DASH · already spent',
      spendState: 'Spent',
    };
  }
  if (record.spent === false) {
    return {
      balanceAtomic: record.incoming.value,
      balanceLabel: formatDashFromCredits(record.incoming.value),
      spendState: 'Unspent',
    };
  }
  return {
    balanceAtomic: 0n,
    balanceLabel: 'Current balance unavailable · spend state unknown',
    spendState: 'Unknown · FVK required',
  };
}
