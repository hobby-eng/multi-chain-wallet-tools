export const RECOVERY_NETWORK_ATTACH = 'ckd-recovery-network-attach-v1';
export const RECOVERY_NETWORK_READY = 'ckd-recovery-network-ready-v1';
export const RECOVERY_NETWORK_FATAL = 'ckd-recovery-network-fatal-v1';

export type NetworkBoundaryResponse<Value = unknown> =
  | { id: string; ok: true; value: Value }
  | { id: string; ok: false; error: string };

interface NetworkBoundaryCancel {
  readonly type: 'cancel';
  readonly id: string;
}

interface NetworkBoundaryInvoke<Request> {
  readonly type: 'invoke';
  readonly request: Request;
}

export type NetworkBoundaryPortMessage<Request> = NetworkBoundaryCancel | NetworkBoundaryInvoke<Request>;
