/**
 * Build-time replacement for the non-cryptographic random function.
 *
 * Bundled libraries may contain it in code paths this project never runs, such as
 * the random operator of a font program. The build rewrites every such call to
 * this function, so the artifact contains only the system random source.
 */
export function ckdRandomFraction(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return (values[0] ?? 0) / 0x1_0000_0000;
}
