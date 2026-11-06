/**
 * The admission bound of a Script or descriptor typed in the Inspector, in UTF-16 code units,
 * including text before preprocessing. Its own module, so that a build without descriptor decoding
 * keeps the same bound for raw Script.
 */
export const MAX_SCRIPT_TEXT_UNITS = 64 * 1024;
