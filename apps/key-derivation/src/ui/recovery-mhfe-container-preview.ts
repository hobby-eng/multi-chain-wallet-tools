import type { MhfeContainerFacts } from "@ckd/recovery-mhfe-wasm/core/client.js";
import { MhfeInputLifetime, MhfeInputText } from "@ckd/recovery-backup/mhfe-input-text.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { ContainerField } from "./recovery-mhfe-fields.js";
import { InputRevision } from "./recovery-input-revision.js";
import { describe } from "./recovery-mhfe-status.js";

const PREVIEW_FAILED = "The container could not be read.";

/** Control choices only; the container phrase never reaches a preliminary view's stored state. */
export type MhfeContainerPreviewFacts = Pick<
  MhfeContainerFacts,
  "phraseLengths" | "builtInCheckLengths" | "offersWalletCheck" | "confirmationFor"
>;

/** Adapts one field from real package facts, with revision-scoped managed input and failures. */
export class MhfeContainerPreview {
  readonly #engine: Pick<MhfeEngine, "client">;
  readonly #field: ContainerField;
  readonly #status: HTMLElement;
  readonly #adapt: (facts: MhfeContainerPreviewFacts) => void;
  readonly #inputs: InputRevision;
  readonly #active = new MhfeInputLifetime();
  #failure: string | undefined;

  /** Only reads the field after client/parameters readiness; no raw field string crosses that wait. */
  constructor(
    engine: Pick<MhfeEngine, "client">,
    field: ContainerField,
    status: HTMLElement,
    adapt: (facts: MhfeContainerPreviewFacts) => void,
  ) {
    this.#engine = engine;
    this.#field = field;
    this.#status = status;
    this.#adapt = adapt;
    this.#inputs = new InputRevision(field.textarea, () => {
      this.#active.wipe();
      this.#clearFailure();
    });
    this.#inputs.bindPageLifetime();
    field.textarea.addEventListener("change", () => {
      this.#active.wipe();
      void this.#read(this.#inputs.capture());
    });
  }

  #clearFailure(): void {
    if (this.#failure !== undefined && this.#status.textContent === this.#failure) {
      this.#status.textContent = "";
      this.#status.classList.remove("warning");
    }
    this.#failure = undefined;
  }

  async #read(current: () => boolean): Promise<void> {
    try {
      const client = await this.#engine.client();
      if (!current()) return;
      await this.#active.hold(new MhfeInputText(this.#field.value), async (input) => {
        const facts = await input.use((text) => client.readContainer(text));
        if (current()) {
          this.#clearFailure();
          const { phraseLengths, builtInCheckLengths, offersWalletCheck, confirmationFor } = facts;
          this.#adapt({ phraseLengths, builtInCheckLengths, offersWalletCheck, confirmationFor });
        }
      });
    } catch (cause) {
      // A revoked preview cannot publish either facts or a failure beside replacement fields.
      if (!current()) return;
      this.#failure = describe(cause, PREVIEW_FAILED);
      this.#status.textContent = this.#failure;
      this.#status.classList.add("warning");
    }
  }

  /** Retires a preview before an explicit operation starts, and wipes any pending host input. */
  retire(): void {
    this.#inputs.retire();
  }
}
