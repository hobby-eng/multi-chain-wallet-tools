// Heir metadata uses the same gated adapter as card rendering. The existing no-SSKR resolver
// replaces this relative import too, so an encoded-only heir sheet pulls in no share renderer.
export { Share, ownShareCards } from "./mnemocode-share-render.js";
