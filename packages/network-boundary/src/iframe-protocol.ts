export const RECOVERY_VAULT_CHANNEL = 'ckd-recovery-vault-channel-v1';
export const RECOVERY_EXPORT_REQUEST = 'ckd-recovery-export-request-v1';
export const RECOVERY_EXPORT_RESULT = 'ckd-recovery-export-result-v1';
export const RECOVERY_VAULT_HEIGHT = 'ckd-recovery-vault-height-v1';

export type RecoveryExportBrokerFormat = 'csv' | 'json' | 'xlsx';
export interface RecoveryExportBrokerRequest {
  type: typeof RECOVERY_EXPORT_REQUEST;
  id: string;
  format: RecoveryExportBrokerFormat;
  text: string;
}
export interface RecoveryExportBrokerResult {
  type: typeof RECOVERY_EXPORT_RESULT;
  id: string;
  ok: boolean;
  filename?: string;
  error?: string;
}
export interface RecoveryVaultHeight {
  type: typeof RECOVERY_VAULT_HEIGHT;
  height: number;
}
