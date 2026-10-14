// Bounded synthetic framing literals following DIP2's version/type header and
// DIP4 CbTx v1 (uint16 version, uint32 height, 32-byte MN-list Merkle root).
// These assert serialization, not consensus validity or blockchain inclusion.
const ZERO_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
export const DASH_SPECIAL_PAYLOAD = "010001000000" + ZERO_HASH;
export const DASH_SPECIAL_TRANSACTION_BODY =
  "0300050001" + ZERO_HASH + "ffffffff025151ffffffff010100000000000000015100000000";
// The wire vector has a 38-byte payload and a canonical single-byte length.
export const DASH_SPECIAL_WIRE = DASH_SPECIAL_TRANSACTION_BODY + "26" + DASH_SPECIAL_PAYLOAD;
// One input, one OP_TRUE output worth zero: 61 bytes, unsigned and without a payload.
export const DASH_UNSIGNED_TRANSACTION =
  "0200000001" + ZERO_HASH + "0000000000ffffffff010000000000000000015100000000";
export const DASH_MINIMAL_PSBT = "70736274ff01003d" + DASH_UNSIGNED_TRANSACTION + "000000";
