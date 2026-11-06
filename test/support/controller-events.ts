/** Passive native control edge for controller contracts; no application behaviour runs here. */
export class ControllerTestControl extends EventTarget {
  /** Native disabled state. */
  disabled = false;
  /** Native visibility state. */
  hidden = false;
  /** Native checkbox state. */
  checked = false;
  /** Native input text, using public synthetic fixtures only. */
  value = "";
  /** Native output text. */
  textContent = "";
  /** Number of installed native listeners of each event type. */
  readonly listeners = new Map<string, number>();

  /** Observe registration while retaining actual EventTarget dispatch semantics. */
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    this.listeners.set(type, (this.listeners.get(type) ?? 0) + 1);
    super.addEventListener(type, callback, options);
  }

  /** Dispatch the native click boundary without layout or application logic. */
  click(): void {
    this.dispatchEvent(new Event("click"));
  }

  /** This native control fixture contains no protocol-tab children. */
  querySelectorAll(): never[] {
    return [];
  }
}

/** Native form submission boundary used by the same controller fixtures. */
export class ControllerTestForm extends ControllerTestControl {
  /** Dispatch a cancellable native form event. */
  submit(): void {
    this.dispatchEvent(new Event("submit", { cancelable: true }));
  }
}
