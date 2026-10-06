// One progress line for every long job of Recover & Back Up:
// "{stage} · {position} · {elapsed} elapsed · about {left} left".

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** Measures one job from its start and estimates the time left from the steps finished so far. */
export class JobClock {
  readonly #started: number;
  readonly #now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
    this.#started = now();
  }

  elapsed(): number {
    return this.#now() - this.#started;
  }

  /** Undefined until the first step has finished, when there is nothing to estimate from. */
  left(finished: number, total: number): number | undefined {
    return finished > 0 ? (this.elapsed() / finished) * (total - finished) : undefined;
  }

  /** The status line for a job at `position` (such as "round 3 of 12") after `finished` of `total` steps. */
  line(stage: string, position: string, finished: number, total: number): string {
    const left = this.left(finished, total);
    const leftText = left === undefined ? "" : ` · about ${formatDuration(left)} left`;
    return `${stage} · ${position} · ${formatDuration(this.elapsed())} elapsed${leftText}`;
  }
}
