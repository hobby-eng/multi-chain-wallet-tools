// The speed of the wallet-check draw on this computer, measured before a draw so that the page can
// say how long a phrase takes on average (owner, 2026-11-11): the workers of a real draw run for a
// second with a public passphrase and no chosen word, which changes the speed by less than 2%
// (review of 2026-11-12), so that the person's words never reach a measurement. A measurement
// starts only after the person ticks the option, chooses other threads or ticks TON's, never on
// page load, and after a short pause, so that a burst of changes measures once.
import { WALLET_CHECK_WORDS } from "@ckd/core/bip39-wallet-check.js";
import type { DrawSpeedState } from "./generation-plan.js";
import { WalletCheckDraw } from "./wallet-check-draw.js";

/** What the speed of a draw depends on. */
export interface SpeedWork {
  /** Whether TON's check is drawn too. */
  readonly ton: boolean;
  readonly threads: number;
}

/** How long the workers draw for a measurement. */
const MEASURE_MILLISECONDS = 1000;
/** The pause after a change before measuring, so that a burst of changes measures once. */
const SETTLE_MILLISECONDS = 500;

export class WalletCheckDrawSpeed {
  readonly #onChange: () => void;
  readonly #createDraw: () => WalletCheckDraw;
  /** The work of the state below, as text, to tell a change of the work. */
  #work: string | undefined;
  #state: DrawSpeedState | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #draw: WalletCheckDraw | undefined;

  /** `onChange` is called when a measurement ends; `createDraw` gives the workers (CORE-09). */
  constructor(
    onChange: () => void,
    createDraw: () => WalletCheckDraw = () => new WalletCheckDraw(),
  ) {
    this.#onChange = onChange;
    this.#createDraw = createDraw;
  }

  /** The speed of `work`: the last measurement of the same work, or a new one about to run. */
  of(work: SpeedWork): DrawSpeedState {
    const key = `${work.threads}:${work.ton}`;
    if (key === this.#work && this.#state !== undefined) return this.#state;
    this.stop();
    this.#work = key;
    this.#state = { kind: "measuring", threads: work.threads };
    this.#timer = setTimeout(() => void this.#measure(work, key), SETTLE_MILLISECONDS);
    return this.#state;
  }

  /** Stops a measurement under way, which runs again when asked for; a finished one is kept. */
  pause(): void {
    if (this.#state?.kind === "measuring") this.stop();
  }

  /** Stops measuring and forgets the speed. */
  stop(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#draw?.stop();
    this.#draw = undefined;
    this.#work = undefined;
    this.#state = undefined;
  }

  async #measure(work: SpeedWork, key: string): Promise<void> {
    this.#timer = undefined;
    const draw = this.#createDraw();
    this.#draw = draw;
    let state: DrawSpeedState;
    try {
      const speed = await draw.measure(
        { ...work, wishes: { wordCount: WALLET_CHECK_WORDS, chosen: [], neverUse: [] } },
        MEASURE_MILLISECONDS,
      );
      if (speed === undefined) return;
      state =
        speed.drawsPerSecond > 0
          ? { kind: "measured", threads: work.threads, drawsPerSecond: speed.drawsPerSecond }
          : { kind: "failed" };
    } catch {
      // The page says that the speed could not be measured; the draw itself shows its speed.
      state = { kind: "failed" };
    } finally {
      if (this.#draw === draw) this.#draw = undefined;
    }
    if (this.#work !== key) return;
    this.#state = state;
    this.#onChange();
  }
}
