/** HASH160 output width, used by transparent hash-based address encodings. */
export const ADDRESS_HASH_BYTES = 20;
/** One version/type byte precedes the hash in these address payloads. */
export const HASH_ADDRESS_PAYLOAD_BYTES = 1 + ADDRESS_HASH_BYTES;
