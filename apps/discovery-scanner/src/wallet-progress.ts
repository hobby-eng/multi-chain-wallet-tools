import type { RecoveryProgress } from './types.js';
import type { DiscoveryScannerView, WalletProgressView } from './view.js';

export class WalletProgressTracker {
  readonly entries = new Map<string, WalletProgressView>();

  constructor(
    private readonly view: Pick<
      DiscoveryScannerView,
      'progressSectionLabel' | 'renderWalletProgress' | 'setStatus' | 'showProgress'
    >,
  ) {}

  initialize(inputs: readonly { id: string; label: string }[]): void {
    this.entries.clear();
    for (const input of inputs) {
      this.entries.set(input.id, {
        label: input.label,
        state: 'queued',
        stage: 'Queued',
        message: 'Waiting for a scan slot',
        sections: new Map(),
      });
    }
    this.render();
  }

  finish(inputId: string, failed = false): void {
    const progress = this.entries.get(inputId);
    if (progress === undefined) return;
    progress.state = failed ? 'failed' : 'complete';
    progress.stage = failed ? 'Stopped' : 'Complete';
    progress.message = failed
      ? 'This wallet did not produce a complete report'
      : 'All requested scan sections finished';
    if (!failed) (progress.sections as Map<RecoveryProgress['section'], string>).clear();
    this.render();
  }

  update(progress: RecoveryProgress): void {
    this.view.showProgress();
    const wallet = this.entries.get(progress.inputId);
    if (wallet !== undefined) {
      wallet.state = 'running';
      wallet.stage = this.view.progressSectionLabel(progress.section);
      wallet.message = progress.message;
      (wallet.sections as Map<RecoveryProgress['section'], string>).set(progress.section, progress.message);
    }
    this.render();
    this.view.setStatus(`${wallet?.label ?? progress.inputId}: ${progress.message}`);
  }

  failPending(stage: string, message: string): void {
    for (const progress of this.entries.values()) {
      if (progress.state === 'complete' || progress.state === 'failed') continue;
      progress.state = 'failed';
      progress.stage = stage;
      progress.message = message;
    }
    this.render();
  }

  clear(): void {
    this.entries.clear();
  }

  render(): void {
    this.view.renderWalletProgress(this.entries);
  }
}
