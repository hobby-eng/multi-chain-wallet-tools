// Stand-in for type checking and tests. The build replaces this module with one that gives the
// SeedQR tab its hidden form only where MnemoCode is built too, and none otherwise
// (apps/key-derivation/scripts/build-key-derivation-html.mjs).
import { hiddenSeedQr as withMnemoCode, type SeedQrHiddenForm } from "./recovery-seedqr-hidden.js";

export const hiddenSeedQr: SeedQrHiddenForm | undefined = withMnemoCode;
