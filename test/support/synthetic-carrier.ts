// A synthetic JPEG carrier for the steganography tests, written codeword by codeword as MnemoCode's
// own startup fixture writes it (mnemocode-rust crates/mnemocode/src/stego/fixtures.rs,
// literal_jpeg, sequential): one luma component, Q=1, every block DC=0 and every AC coefficient +2,
// with abbreviated Huffman tables holding exactly the symbols used (T.81 Annexes B, F and K). No
// photograph or encoder is involved, so the bytes are public and the same on every machine.

function segment(output: number[], marker: number, body: readonly number[]): void {
  output.push(0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body);
}

/** Appends `value`, with the zero byte that JPEG stuffs after 0xFF in entropy-coded data. */
function entropyByte(output: number[], value: number): void {
  output.push(value);
  if (value === 0xff) output.push(0);
}

function entropy(output: number[], pattern: readonly number[], blocks: number): void {
  let current = 0;
  let used = 0;
  for (let block = 0; block < blocks; block += 1) {
    for (const bit of pattern) {
      current = current * 2 + bit;
      used += 1;
      if (used === 8) {
        entropyByte(output, current);
        current = 0;
        used = 0;
      }
    }
  }
  if (used !== 0) entropyByte(output, (current << (8 - used)) | ((1 << (8 - used)) - 1));
}

/** A sequential grey JPEG of `width` by `height` pixels whose every AC coefficient is +2. */
export function literalJpeg(width: number, height: number): Uint8Array {
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const output: number[] = [0xff, 0xd8];
  segment(output, 0xdb, [0, ...Array.from({ length: 64 }, () => 1)]);
  segment(output, 0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]);
  const dc = Array.from({ length: 17 }, () => 0);
  dc[1] = 1;
  segment(output, 0xc4, [...dc, 0]);
  const ac = Array.from({ length: 17 }, () => 0);
  ac[0] = 0x10;
  ac[1] = 1;
  segment(output, 0xc4, [...ac, 2]);
  segment(output, 0xdd, [0, 0]);
  segment(output, 0xda, [1, 1, 0, 0, 63, 0]);
  // DC difference 0, then 63 times the AC symbol 0x02 (code 0) and its value +2 (bits 10).
  const bits = [0];
  for (let coefficient = 0; coefficient < 63; coefficient += 1) bits.push(0, 1, 0);
  entropy(output, bits, blocks);
  output.push(0xff, 0xd9);
  return Uint8Array.from(output);
}
