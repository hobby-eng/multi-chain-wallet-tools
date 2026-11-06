/** A browser event-loop turn that also runs in a background tab, where paint callbacks stop. */
export class BrowserTurn {
  /** Let queued input/cancellation events run between bounded worker batches. */
  static async yield(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
