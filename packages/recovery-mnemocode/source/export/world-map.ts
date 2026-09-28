/**
 * Geometry of the world map printed behind a collection sheet.
 *
 * The map uses the Robinson projection, the familiar rounded world map. Its land
 * shapes are generated once from public-domain Natural Earth data; see
 * `assets/maps/NOTICE`.
 */

/** Width of the map box in map units. */
export const WORLD_MAP_WIDTH = 2000;
/** The Robinson map is 0.5072 times as high as it is wide. */
export const WORLD_MAP_HEIGHT = 1014;

/**
 * The published Robinson table for every 5 degrees of latitude:
 * the length of the parallel and its distance from the equator, both relative.
 */
const ROBINSON_TABLE: readonly (readonly [number, number])[] = [
  [1.0, 0.0],
  [0.9986, 0.062],
  [0.9954, 0.124],
  [0.99, 0.186],
  [0.9822, 0.248],
  [0.973, 0.31],
  [0.96, 0.372],
  [0.9427, 0.434],
  [0.9216, 0.4958],
  [0.8962, 0.5571],
  [0.8679, 0.6176],
  [0.835, 0.6769],
  [0.7986, 0.7346],
  [0.7597, 0.7903],
  [0.7186, 0.8435],
  [0.6732, 0.8936],
  [0.6213, 0.9394],
  [0.5722, 0.9761],
  [0.5322, 1.0],
];
const TABLE_STEP_DEGREES = 5;

/** Projects a place on Earth into the map box. */
export function robinson(longitude: number, latitude: number): { x: number; y: number } {
  const position = Math.min(Math.abs(latitude), 90) / TABLE_STEP_DEGREES;
  const row = Math.min(Math.floor(position), ROBINSON_TABLE.length - 2);
  const share = position - row;
  const [length, distance] = ROBINSON_TABLE[row]!;
  const [nextLength, nextDistance] = ROBINSON_TABLE[row + 1]!;
  const parallelLength = length + (nextLength - length) * share;
  const fromEquator = (distance + (nextDistance - distance) * share) * Math.sign(latitude);
  return {
    x: (WORLD_MAP_WIDTH / 2) * (1 + (parallelLength * longitude) / 180),
    y: (WORLD_MAP_HEIGHT / 2) * (1 - fromEquator),
  };
}

function line(points: readonly { x: number; y: number }[]): string {
  return `M${points.map(({ x, y }) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`;
}

/** Meridians and parallels every `step` degrees, as one path each. */
export function graticule(step: number): string[] {
  const SMOOTHNESS = 3; // degrees between the points of a curved line
  const lines: string[] = [];
  for (let longitude = -180; longitude <= 180; longitude += step) {
    const points = [];
    for (let latitude = -90; latitude <= 90; latitude += SMOOTHNESS)
      points.push(robinson(longitude, latitude));
    lines.push(line(points));
  }
  for (let latitude = -90; latitude <= 90; latitude += step)
    lines.push(line([robinson(-180, latitude), robinson(180, latitude)]));
  return lines;
}
