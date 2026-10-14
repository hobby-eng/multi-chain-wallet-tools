// The units of a PDF page: points, of which an inch has 72, and millimetres, which every card and
// sheet is laid out in. Imports nothing, so that the renderers and the formats of the files share
// one conversion.

/** Points in an inch: the default unit of PDF user space (ISO 32000-1, 8.3.2.3). */
export const POINTS_PER_INCH = 72;
/** Millimetres in an inch, by definition. */
export const MM_PER_INCH = 25.4;
/** Points in a millimetre. */
export const MM = POINTS_PER_INCH / MM_PER_INCH;
