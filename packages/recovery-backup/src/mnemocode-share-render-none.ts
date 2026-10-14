// A build without the SSKR library prints no share cards and has no share tabs; the build puts
// this module in place of mnemocode-share-render.ts. Its page offers no share cards, so these are
// never reached; a call that reaches them anyway is refused.
import type { ShareFormat } from "../../recovery-mnemocode/source/sskr/transport.js";
import type { CardPageSize } from "../../recovery-mnemocode/source/export/card-settings.js";
import type { SskrCardLayout } from "../../recovery-mnemocode/source/export/sskr-content.js";

const NO_SSKR = "Share cards need the SSKR library, which this build leaves out.";

export class ShareCardSet {
  constructor() {
    throw new Error(NO_SSKR);
  }
}

export const Share = {
  read(): never {
    throw new Error(NO_SSKR);
  },
};

export function ownShareCards(_record: string, _format: ShareFormat): never {
  throw new Error(NO_SSKR);
}

export function resolveSskrLayout(
  _requested: SskrCardLayout | undefined,
  _pageSize: CardPageSize | undefined,
): SskrCardLayout {
  throw new Error(NO_SSKR);
}
