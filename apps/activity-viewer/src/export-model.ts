import type { PlatformAddressHistorySnapshot } from '@ckd/dash-network/platform-address-history.js';
import type { PlatformAddressSnapshot } from '@ckd/dash-network/platform-address-source.js';
import type { PlatformIdentityHistoryResult } from '@ckd/dash-network/platform-identity-history.js';
import type { PlatformIdentityLookupSnapshot } from '@ckd/dash-network/platform-identity-source.js';
import type { CoreAddressSnapshot } from '@ckd/dash-network/public-address.js';
import type { ActivitySnapshot, ViewerNetwork } from '@ckd/dash-network/types.js';

export type ViewerSingleExportState =
  | { mode: 'core'; network: ViewerNetwork; snapshot: CoreAddressSnapshot }
  | {
      mode: 'platform';
      network: ViewerNetwork;
      snapshot: PlatformAddressSnapshot;
      history: PlatformAddressHistorySnapshot;
    }
  | {
      mode: 'identity';
      network: ViewerNetwork;
      snapshot: PlatformIdentityLookupSnapshot;
      histories: PlatformIdentityHistoryResult[];
    }
  | { mode: 'shielded'; network: ViewerNetwork; snapshot: ActivitySnapshot };

export interface ViewerBatchExportItem {
  id: string;
  label: string;
  state: ViewerSingleExportState;
}

export interface ViewerBatchExportError {
  id: string;
  label: string;
  message: string;
  mode?: ViewerSingleExportState['mode'];
}

export interface ViewerBatchExportState {
  batch: true;
  mode: ViewerSingleExportState['mode'] | 'mixed';
  network: ViewerNetwork;
  items: ViewerBatchExportItem[];
  errors: ViewerBatchExportError[];
}

export type ViewerExportState = ViewerSingleExportState | ViewerBatchExportState;

export type ViewerTextExportFormat = 'csv' | 'json';
export type ViewerExportFormat = ViewerTextExportFormat | 'xlsx';

export interface ViewerExportFile {
  filename: string;
  mimeType: string;
  text: string;
}

export interface ViewerWorkbookExportFile {
  filename: string;
  mimeType: string;
  blob: Blob;
}
