/**
 * Card rendering without any Node.js dependency.
 *
 * A host calls `configureRenderPlatform` once, then renders with the same
 * templates and code as the command-line program.
 */
export {
  configureRenderPlatform,
  createRasterImage,
  renderAssets,
  type QrModules,
  type RasterImage,
  type RenderAsset,
  type RenderPlatform,
} from './export/platform.js';
export {
  cardTemplates,
  selectTemplate,
  type CardContent,
  type CardKind,
  type CardTemplate,
} from './export/templates.js';
export { createCardSession, type CardSession } from './export/card-session.js';
export type { CardCopyOverrides } from './export/card-copy.js';
export {
  renderCards,
  renderIndividualCards,
  type CardJob,
  type RenderedCard,
} from './export/render.js';
export {
  isCardPageSize,
  parseOrientation,
  parsePageSize,
  profileFields,
  validateProfile,
  type CardOrientation,
  type CardPageSize,
  type CardProfile,
} from './export/card-settings.js';
