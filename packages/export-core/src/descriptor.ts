/** BIP380 / Bitcoin Core output descriptor checksum implementation. */
const INPUT_CHARSET = "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn] as const;

function polymod(checksum: bigint, value: number): bigint {
  const top = checksum >> 35n;
  let next = ((checksum & 0x7ffffffffn) << 5n) ^ BigInt(value);
  for (let bit = 0; bit < GENERATOR.length; bit += 1) {
    if (((top >> BigInt(bit)) & 1n) !== 0n) next ^= GENERATOR[bit]!;
  }
  return next;
}

export function descriptorChecksum(descriptor: string): string {
  if (descriptor.includes('#')) throw new Error('Descriptor input must not already contain a checksum.');
  let checksum = 1n;
  let group = 0;
  let groupCount = 0;
  for (const character of descriptor) {
    const position = INPUT_CHARSET.indexOf(character);
    if (position < 0) throw new Error(`Descriptor contains unsupported character ${JSON.stringify(character)}.`);
    checksum = polymod(checksum, position & 31);
    group = group * 3 + (position >> 5);
    groupCount += 1;
    if (groupCount === 3) {
      checksum = polymod(checksum, group);
      group = 0;
      groupCount = 0;
    }
  }
  if (groupCount > 0) checksum = polymod(checksum, group);
  for (let index = 0; index < 8; index += 1) checksum = polymod(checksum, 0);
  checksum ^= 1n;
  let output = '';
  for (let index = 0; index < 8; index += 1) {
    output += CHECKSUM_CHARSET[Number((checksum >> BigInt(5 * (7 - index))) & 31n)];
  }
  return output;
}

export function addDescriptorChecksum(descriptor: string): string {
  return `${descriptor}#${descriptorChecksum(descriptor)}`;
}
