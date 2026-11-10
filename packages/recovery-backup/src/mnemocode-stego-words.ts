// What the page says of steganography, in MnemoCode's own words (its stego command, menu and
// library messages), where the binding gives a code or a stage name rather than a text.
import type { StegoPairCheck, StegoProgress } from "./mnemocode-stego.js";

/** Said before a file is chosen, as MnemoCode's menu says it. */
export const STEGO_CLEAN_SOURCE =
  "Choose a clean original. The new file holds only what you hide now; the source file is not overwritten.";
export const STEGO_EXACT_COPIES =
  "Keep exact file copies. Recompression, resizing or audio conversion destroys the hidden record. Statistical invisibility is not established.";
/** Under the capacity table. */
export const STEGO_CAPACITY_HINT =
  "Capacity checks encoding constraints; memory, output verification and detector resistance are separate checks.";
export const STEGO_UNAVAILABLE_LEVELS =
  "Grey levels are unavailable: the contents do not fit at these densities.";
export const STEGO_DENSITY_QUESTION =
  "Choose density; higher levels may increase distortion and detectability";
/** The table's title for one file, for a decoy pair and for a set. */
export const STEGO_CAPACITY_TITLE = {
  one: "Guaranteed message space for this file and new password:",
  decoy: "Guaranteed space for each of the two records, under these passwords:",
  set: "Guaranteed message space for this file selection and new password:",
} as const;
/** A password opened nothing: that never says that a file is empty. */
export const STEGO_NO_RECORD =
  "No hidden data found with this password. This does not prove that the file holds none.";
export const STEGO_PASSWORDS_DIFFER = "The two container passwords differ. Type both again.";
export const STEGO_DECOY_PASSWORDS_DIFFER = "The two decoy passwords differ. Type both again.";

/** What a stage of a job is doing, for the status line. */
const STAGES: Readonly<Record<string, string>> = {
  reading: "Reading the file…",
  "deriving-password": "Stretching the password (Argon2id, 128 MiB)…",
  "locating-record": "Looking for the record…",
  "analyzing-capacity": "Analyzing available space…",
  "building-costs": "Weighing the changes…",
  encoding: "Writing the hidden record…",
  verifying: "Verifying the record…",
};

/** The status line of `progress`; `files` is the count of files the job works through. */
export function stegoProgressLine(progress: StegoProgress, files: number): string {
  const doing = STAGES[progress.stage] ?? "Working…";
  return progress.file === undefined || files < 2
    ? doing
    : `File ${progress.file} of ${files}: ${doing}`;
}

/** MnemoCode's words for a refused decoy password, with its threshold. */
export function stegoPairRefusal(check: StegoPairCheck, minimumPercent: number): string {
  return check.refusalCode === "stego.password.decoy"
    ? "The decoy needs a password different from the original message's password."
    : `The container passwords are too similar: use independently chosen passwords with at least ${minimumPercent}% OSA edit difference, avoiding obvious variants. This is a heuristic, not a strength guarantee.`;
}

/** What an accepted pair's check says, as MnemoCode's menu says it. */
export function stegoPairAccepted(check: StegoPairCheck, minimumPercent: number): string {
  return `Passwords differ by ${check.differencePercent}% (minimum ${minimumPercent}%). Similarity check passed; this is not a password strength rating.`;
}

/** MnemoCode's words for the metadata conditions of a file, by their codes. */
const NOTICES: Readonly<Record<string, string>> = {
  "jpeg.mpf.primary-length-preserved":
    "The existing inconsistent primary MPF length was kept unchanged.",
  "jpeg.preview.unavailable-preserved":
    "An existing preview reference extends beyond the file; it was kept unchanged.",
  "jpeg.auxiliary.unavailable-preserved":
    "An existing auxiliary image declaration has no complete image in this file; its fields and byte positions were kept unchanged.",
  "jpeg.mpf.references-updated": "MPF sizes or offsets were updated for the edited file.",
  "jpeg.preview.references-updated": "Preview offsets were updated for the edited file.",
  "jpeg.ancillary.positions-preserved":
    "Additional camera data was kept at its original byte positions.",
  "jpeg.motion-photo.gap-preserved": "An existing Motion Photo gap was kept unchanged.",
  "jpeg.integrity.possible-content-binding":
    "Image integrity metadata may cover this image. Changes can invalidate it; MnemoCode does not verify it.",
  "jpeg.qualcomm-debug.opaque-positions-preserved":
    "Qualcomm debug and opaque trailing data were kept at their original byte positions; proprietary meaning and image-bound integrity are not verified.",
};

/** The text of a metadata notice code; an unknown code is named as it is. */
export function stegoNoticeText(code: string): string {
  return NOTICES[code] ?? `File condition: ${code}.`;
}

/** Bytes as MnemoCode's capacity table shows them; zero is no space at all. */
export function stegoBytesText(bytes: number): string {
  return bytes === 0 ? "not available" : `${bytes} bytes (${(bytes / 1024).toFixed(3)} KiB)`;
}
