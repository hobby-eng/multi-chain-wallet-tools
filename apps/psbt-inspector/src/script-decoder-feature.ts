import { UiEventScope } from "@ckd/ui/ui-event-scope.js";
import type { DecodedDescriptor } from "./descriptor.js";
import { IntegerInputError } from "@ckd/core/validation.js";
import { InspectorNetworkChoiceError } from "./network-choice.js";
import { ScriptDecoder, ScriptDecoderError, type ScriptDecoderFeatures } from "./script-decoder.js";
import { required, syncNetworkChoice, textElement } from "./ui-common.js";

function detailRows(rows: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "detail-list";
  for (const [label, value] of rows)
    list.append(textElement("dt", "", label), textElement("dd", "", value));
  return list;
}

function pathList(values: readonly string[] | null, empty: string, unknown: string): string {
  return values === null ? unknown : values.length === 0 ? empty : values.join("\n");
}

/** Translates native controls and renders library-owned Script/descriptor results. */
export class ScriptDecoderFeature implements Disposable {
  readonly #decoder: ScriptDecoder;
  readonly #events = new UiEventScope((cause) => this.#failure(cause));
  readonly #ui = {
    chain: required<HTMLSelectElement>("script-chain"),
    network: required<HTMLSelectElement>("script-network"),
    role: required<HTMLSelectElement>("script-role"),
    branch: required<HTMLSelectElement>("script-branch"),
    wildcardIndex: required<HTMLInputElement>("script-wildcard-index"),
    input: required<HTMLTextAreaElement>("script-input"),
    decode: required<HTMLButtonElement>("decode-script"),
    clear: required<HTMLButtonElement>("clear-script"),
    error: required<HTMLDivElement>("script-error"),
    results: required<HTMLElement>("script-results"),
    policy: required<HTMLElement>("script-policy"),
    asm: required<HTMLElement>("script-asm"),
    classification: required<HTMLElement>("script-classification"),
    wrappers: required<HTMLElement>("script-wrappers"),
    operations: required<HTMLElement>("script-operations"),
  };

  constructor(features: ScriptDecoderFeatures) {
    this.#decoder = new ScriptDecoder(features);
    this.#events.listen(this.#ui.decode, "click", this.inspect);
    this.#events.listen(this.#ui.clear, "click", this.clear);
    this.#events.listen(this.#ui.chain, "change", () => {
      this.#retire();
      syncNetworkChoice(this.#ui.chain, this.#ui.network);
    });
    for (const field of [this.#ui.network, this.#ui.role, this.#ui.branch, this.#ui.wildcardIndex])
      this.#events.listen(field, "change", () => this.#retire());
    this.#events.listen(this.#ui.input, "input", () => this.#retire());
    if (document.defaultView !== null)
      this.#events.listen(document.defaultView, "pagehide", this.clear);
    syncNetworkChoice(this.#ui.chain, this.#ui.network);
  }

  /** Decodes fresh fields through the bounded library operation. */
  readonly inspect = (): void => {
    this.#retire();
    try {
      const decoded = this.#decoder.decode(this.#ui.input.value, {
        chain: this.#ui.chain.value,
        network: this.#ui.network.value,
        role: this.#ui.role.value,
        branch: this.#ui.branch.value,
        wildcardIndex: this.#ui.wildcardIndex.value,
      });
      if (decoded.kind === "descriptor") this.#descriptor(decoded.value);
      else this.#script(decoded.value);
      this.#ui.results.hidden = false;
    } catch (cause) {
      this.#failure(cause);
    }
  };

  #descriptor(descriptor: DecodedDescriptor): void {
    this.#ui.policy.textContent =
      descriptor.spendingPaths.length === 0
        ? descriptor.summary
        : descriptor.spendingPaths.join("\n");
    this.#ui.asm.textContent =
      descriptor.compiledOutput?.asm ??
      "This descriptor is structurally decoded, but concrete compilation is not implemented for this descriptor family.";
    this.#ui.classification.textContent = `${descriptor.classification} · checksum ${descriptor.checksum} · ${descriptor.ranged ? "ranged (*)" : "fixed"}`;
    this.#ui.wrappers.replaceChildren(this.#descriptorVisualization(descriptor));
    this.#ui.operations.replaceChildren(
      textElement("h3", "psbt-subheading", "Descriptor structure"),
      detailRows(descriptor.rows.map((row) => [row.label, row.value] as const)),
    );
  }

  #descriptorVisualization(descriptor: DecodedDescriptor): HTMLElement {
    const root = document.createElement("section");
    root.className = "descriptor-visualization";
    if (descriptor.compiledOutput !== null)
      root.append(
        textElement("h3", "psbt-subheading", "Compiled descriptor data"),
        detailRows(descriptor.compiledOutput.rows.map((row) => [row.label, row.value] as const)),
      );
    if (descriptor.pathCards.length > 0) {
      root.append(textElement("h3", "psbt-subheading", "Policy · spending paths"));
      const cards = document.createElement("div");
      cards.className = "descriptor-path-cards";
      for (const path of descriptor.pathCards) {
        const card = document.createElement("article");
        card.className = "descriptor-path-card";
        card.append(
          textElement("h4", "", path.title),
          detailRows([
            ["Availability", path.availability],
            ["Requirement", path.requirement],
            ["Keys", pathList(path.keys, "No direct signing key summarized", path.availability)],
            ["Preimage", pathList(path.preimages, "Not required", path.availability)],
            ["Locks", pathList(path.locks, "None", path.availability)],
          ]),
        );
        cards.append(card);
      }
      root.append(cards);
    }
    if (descriptor.policyTree.length > 0)
      root.append(
        textElement("h3", "psbt-subheading", "Policy tree"),
        textElement("pre", "policy-tree", descriptor.policyTree.join("\n")),
      );
    root.append(textElement("h3", "psbt-subheading", "Technical analysis"));
    return root;
  }

  #script(
    decoded: Extract<ReturnType<ScriptDecoder["decode"]>, { kind: "script" }>["value"],
  ): void {
    this.#ui.policy.textContent = decoded.inferredPolicy;
    this.#ui.asm.textContent = decoded.asm;
    this.#ui.classification.textContent = `${decoded.classification}${decoded.directAddress === null ? "" : ` · ${decoded.directAddress}`} · ${decoded.byteLength} bytes`;
    this.#ui.wrappers.replaceChildren(
      ...decoded.wrappers.map((wrapper) => {
        const row = document.createElement("div");
        row.className = "policy-row";
        row.append(
          textElement("span", "", wrapper.label),
          textElement("code", "", `${wrapper.address} · scriptPubKey ${wrapper.scriptPubKey}`),
        );
        return row;
      }),
    );
    const rows = decoded.operations.map(
      (operation) =>
        [
          `Byte ${operation.offset}`,
          `${operation.data === null ? operation.name : `${operation.name} · ${operation.data}`} — ${operation.meaning}`,
        ] as const,
    );
    this.#ui.operations.replaceChildren(
      textElement("h3", "psbt-subheading", "Operations"),
      detailRows(rows),
    );
  }

  #failure(cause: unknown): void {
    this.#retire();
    this.#ui.error.textContent =
      cause instanceof ScriptDecoderError ||
      cause instanceof InspectorNetworkChoiceError ||
      cause instanceof IntegerInputError
        ? cause.message
        : "The decoded result could not be displayed.";
    this.#ui.error.hidden = false;
  }

  #retire(): void {
    this.#ui.results.hidden = true;
    this.#ui.error.hidden = true;
    this.#ui.error.textContent = "";
    for (const output of [this.#ui.policy, this.#ui.asm, this.#ui.classification])
      output.textContent = "";
    this.#ui.wrappers.replaceChildren();
    this.#ui.operations.replaceChildren();
  }

  /** Clears native input and the previous output, including on page exit. */
  readonly clear = (): void => {
    this.#ui.input.value = "";
    this.#retire();
  };

  /** Retires the feature's native listeners and fields. */
  [Symbol.dispose](): void {
    try {
      this.clear();
    } finally {
      this.#events.dispose();
    }
  }
}

/** Compatibility installer for the selected Script and descriptor capabilities. */
export function installScriptDecoderFeature(options: ScriptDecoderFeatures): void {
  new ScriptDecoderFeature(options);
}
