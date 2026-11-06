import { PassiveQrPage } from "./qr-page.js";
import type { RecoveryTestElement } from "../../apps/key-derivation/tests/fake-recovery-page.js";

/** Native DOM surface for view contracts: ID controls appear on demand, without layout or HTML parsing. */
export class CompleteIdPage extends PassiveQrPage {
  getElementById(id: string): RecoveryTestElement | null {
    return this.querySelector(`#${id}`);
  }

  override querySelector(selector: string): RecoveryTestElement | null {
    const found = super.querySelector(selector);
    if (found !== null || !/^#[\w-]+$/u.test(selector)) return found;
    return this.add(selector.slice(1));
  }

  createDocumentFragment(): RecoveryTestElement {
    return this.createElement("fragment");
  }

  createTextNode(text: string): RecoveryTestElement {
    const node = this.createElement("text");
    node.textContent = text;
    return node;
  }
}
