// MnemoCode's share card renderer and its reader of a share, which only a build with the SSKR
// library uses: the build puts mnemocode-share-render-none.ts in place of this module otherwise
// (tooling/key-derivation-composition.mjs), so that such a build carries none of their code.
export { ShareCardSet, ownShareCards } from "../../recovery-mnemocode/source/export/sskr-render.js";
export { resolveSskrLayout } from "../../recovery-mnemocode/source/export/sskr-content.js";
export { Share } from "../../recovery-mnemocode/source/sskr/transport.js";
