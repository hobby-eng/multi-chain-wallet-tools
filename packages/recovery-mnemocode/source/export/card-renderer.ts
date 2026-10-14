// The card renderer of one host: its render platform (export/platform.ts) and the artwork prepared
// with it. A host builds one and passes it to every render: renderCards and renderIndividualCards
// (render.ts), ShareCardSet (sskr-render.ts), CardPreview (card-preview.ts), renderHeirSheet
// (heir-sheet.ts) and the self-tests of cards. No renderer keeps a platform of its own.
//
// Needs from the host: its RenderPlatform, as Node.js supplies it in platform-node.ts.
// Does not: draw cards itself, or keep any card, reference or detail it was asked to draw.

import { BusinessArtwork } from "./business-artwork.js";
import type { QrModules, RenderAsset, RenderPlatform, UniformChoice } from "./platform.js";
import type { CardDrawing } from "./templates.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("export.card-renderer", {
  "card-rendering-host-s-render-platform": {
    kind: "type",
    text: () => "Card rendering needs the host's RenderPlatform.",
  },
});

/**
 * Every service of a RenderPlatform: a record, so that the compiler refuses one left out. A host
 * written in JavaScript may pass an object without them, which the types alone do not stop.
 */
const PLATFORM_SERVICES: Readonly<Record<keyof RenderPlatform, true>> = Object.freeze({
  readAsset: true,
  randomInt: true,
  decodePng: true,
  encodePng: true,
  qrModules: true,
});

/**
 * What the card renderers draw with on one host. A class, because it owns the bundled artwork
 * that it prepares with its platform (BusinessArtwork): read and decoded once for
 * as long as the renderer is kept, and never mixed with that of another platform. It holds only
 * public artwork.
 */
export class CardRenderer implements CardDrawing {
  readonly readAsset: (path: RenderAsset) => Promise<Uint8Array>;
  readonly randomInt: UniformChoice;
  readonly qrModules: (payload: string) => QrModules;
  readonly businessArtwork: BusinessArtwork;

  constructor(platform: RenderPlatform) {
    for (const service of Object.keys(PLATFORM_SERVICES))
      if (typeof platform?.[service as keyof RenderPlatform] !== "function")
        throw ERRORS.create("card-rendering-host-s-render-platform", []);
    // Each service is called on the platform, so that a host's methods keep their `this`, and
    // may be passed on alone, as the renderers pass the random choice.
    this.readAsset = (path) => platform.readAsset(path);
    this.randomInt = (upperExclusive) => platform.randomInt(upperExclusive);
    this.qrModules = (payload) => platform.qrModules(payload);
    this.businessArtwork = new BusinessArtwork(platform);
    Object.freeze(this);
  }
}
