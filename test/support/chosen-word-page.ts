import { vi } from "vitest";
import { CompleteIdPage } from "./complete-id-page.js";
import { RecoveryTestElement } from "../../apps/key-derivation/tests/fake-recovery-page.js";

/** Native page/Option boundaries for the actual chosen-word controls, without auto-created IDs. */
export class ChosenWordPage extends CompleteIdPage {
  constructor() {
    super();
    const document = this.asDocument();
    vi.stubGlobal("Option", function (text: string, value = text) {
      return Object.assign(document.createElement("option"), { textContent: text, value });
    });
    vi.stubGlobal(
      "HTMLButtonElement",
      class {
        static [Symbol.hasInstance](value: unknown): boolean {
          return value instanceof RecoveryTestElement && value.tagName === "button";
        }
      },
    );
  }

  override querySelector(selector: string): RecoveryTestElement | null {
    return this.body.querySelector(selector);
  }

  getElementById(id: string): RecoveryTestElement | null {
    return this.body.querySelector(`#${id}`);
  }
}
