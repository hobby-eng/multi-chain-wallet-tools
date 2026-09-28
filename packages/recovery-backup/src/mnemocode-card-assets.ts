import font from '../../recovery-mnemocode/source/assets/fonts/DejaVuSans-UI.ttf';
import businessArchitect from '../../recovery-mnemocode/source/assets/images/business-architect-v1.png';
import businessContact from '../../recovery-mnemocode/source/assets/images/business-contact-v1.png';
import businessCurves from '../../recovery-mnemocode/source/assets/images/business-curves-v1.png';
import businessDiagonal from '../../recovery-mnemocode/source/assets/images/business-diagonal-v1.png';
import businessEstate from '../../recovery-mnemocode/source/assets/images/business-estate-v1.png';
import businessFacets from '../../recovery-mnemocode/source/assets/images/business-facets-v1.png';
import businessGlass4 from '../../recovery-mnemocode/source/assets/images/business-glass-4in1.png';
import businessGlass6 from '../../recovery-mnemocode/source/assets/images/business-glass-6in1.jpg';
import businessGlass8 from '../../recovery-mnemocode/source/assets/images/business-glass-8in1.jpg';
import businessIt from '../../recovery-mnemocode/source/assets/images/business-it-v1.png';
import materialEnclosure from '../../recovery-mnemocode/source/assets/images/material-enclosure.jpg';
import materialKitchen from '../../recovery-mnemocode/source/assets/images/material-kitchen.jpg';
import materialSwitch from '../../recovery-mnemocode/source/assets/images/material-switch.jpg';
import materialTile from '../../recovery-mnemocode/source/assets/images/material-tile.jpg';
import materialVehicle from '../../recovery-mnemocode/source/assets/images/material-vehicle.jpg';
import type { RenderAsset } from '../../recovery-mnemocode/source/cards.js';

/**
 * The vendored MnemoCode font and artwork, embedded in the HTML file by the build.
 * The record type makes the compiler reject a missing or unknown file.
 */
const assets: Readonly<Record<RenderAsset, Uint8Array>> = {
  'fonts/DejaVuSans-UI.ttf': font,
  'images/business-architect-v1.png': businessArchitect,
  'images/business-contact-v1.png': businessContact,
  'images/business-curves-v1.png': businessCurves,
  'images/business-diagonal-v1.png': businessDiagonal,
  'images/business-estate-v1.png': businessEstate,
  'images/business-facets-v1.png': businessFacets,
  'images/business-it-v1.png': businessIt,
  'images/business-glass-4in1.png': businessGlass4,
  'images/business-glass-6in1.jpg': businessGlass6,
  'images/business-glass-8in1.jpg': businessGlass8,
  'images/material-enclosure.jpg': materialEnclosure,
  'images/material-kitchen.jpg': materialKitchen,
  'images/material-switch.jpg': materialSwitch,
  'images/material-tile.jpg': materialTile,
  'images/material-vehicle.jpg': materialVehicle,
};

export function readMnemoCodeCardAsset(path: RenderAsset): Uint8Array {
  return assets[path];
}
