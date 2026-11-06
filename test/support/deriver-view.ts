import { COIN_FAMILIES, getCoinFamily, getAdapterFamilyId } from "@ckd/coins/registry.js";
import { createKeyDerivationView } from "../../apps/key-derivation/src/ui/view.js";
import { CompleteIdPage } from "./complete-id-page.js";

/** Actual Deriver view and registry on the shared native ID-document boundary. */
export class DeriverViewFixture {
  readonly #page = new CompleteIdPage();
  readonly #view = createKeyDerivationView(this.#page.asDocument(), {
    COIN_FAMILIES,
    getCoinFamily,
    getAdapterFamilyId,
  });

  /** Passive native document, without a layout engine or browser work. */
  get page(): CompleteIdPage {
    return this.#page;
  }
  /** Real view implementation; its DOM edges alone are synthetic. */
  get view(): ReturnType<typeof createKeyDerivationView> {
    return this.#view;
  }
}
