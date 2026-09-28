export const MM = 72 / 25.4;

/** Coordinates in millimetres, measured from the top left. */
export interface CardBox {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}
