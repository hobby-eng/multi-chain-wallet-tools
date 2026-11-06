//! The text of a share: its deterministic CBOR, a byte string after the share's tag where the
//! encoding carries one, written as the minimal Bytewords of a compact UR or as standard Bytewords,
//! and read back. It is written here rather than through the CBOR values of dcbor and the decoder of
//! bc-ur, which keep copies of a share's bytes in memory that nothing wipes: every buffer here that
//! holds a share's bytes is made at its full size at once, so that no smaller one is left behind,
//! and is wiped when it is dropped (AUD-037-SEC006). The text is written letter by letter into one
//! string of its full size: bc-ur's encoder of Bytewords lists a reference to the word of each
//! byte first, and that freed list would name the bytes of the share. From bc-ur it takes only the
//! list of the words.
//!
//! A compact UR is read in ASCII alone, in either case, as BCR-2020-005 writes one: bc-ur read it
//! after Unicode's lower case, which took U+212A KELVIN SIGN for k; a host canonicalises a typed
//! share first (readShare). The CRC-32 and the search of a word branch on the bytes of a share: a
//! time that depends on them, of no use to anyone but the person at the computer.

use crate::Refusal;
use bc_ur::bytewords::BYTEWORDS;
use zeroize::Zeroizing;

/// The start of a share's compact UR, its type in lower case.
const UR_PREFIX: &str = "ur:sskr/";
/// The CBOR tag that the standard Bytewords of a share carry (BCR-2020-011).
const SHARE_TAG: u64 = bc_tags::TAG_SSKR_SHARE;
/// The tag of the first version of SSKR, which earlier standard Bytewords carry and are read with.
const SHARE_TAG_V1: u64 = bc_tags::TAG_SSKR_SHARE_V1;
/// The CBOR major type of a byte string, which holds the share.
const BYTE_STRING: u8 = 2;
/// The CBOR major type of a tag, which the standard Bytewords of a share carry before it.
const TAG: u8 = 6;
/// The bits of a CBOR head's first byte that hold its major type.
const MAJOR_SHIFT: u8 = 5;
/// The bits of a CBOR head's first byte below its major type: its additional information.
const ADDITIONAL_INFORMATION: u8 = (1 << MAJOR_SHIFT) - 1;
/// The additional information that says how many bytes of the head's value follow its first byte
/// (RFC 8949, 3): one, two, four or eight. A value below ONE_BYTE is the additional information
/// itself.
const ONE_BYTE: u8 = 24;
const TWO_BYTES: u8 = 25;
const FOUR_BYTES: u8 = 26;
const EIGHT_BYTES: u8 = 27;
/// The longest CBOR head: its first byte and a value of eight bytes.
const LONGEST_HEAD: usize = 1 + size_of::<u64>();
/// The CRC-32 at the end of the bytes that Bytewords write.
const CHECKSUM_BYTES: usize = 4;
/// The reflected polynomial of the CRC-32 that Bytewords use (ISO-HDLC, as in zlib).
const CRC32_POLYNOMIAL: u32 = 0xEDB8_8320;

/// The deterministic head of a CBOR item of `major` type with `value`: in the fewest bytes, as
/// dcbor writes it and requires it (RFC 8949, 4.2.1). It holds a tag or a length, nothing secret.
fn head(major: u8, value: u64) -> Vec<u8> {
    let kind = major << MAJOR_SHIFT;
    if let Ok(small) = u8::try_from(value) {
        return if small < ONE_BYTE {
            vec![kind | small]
        } else {
            vec![kind | ONE_BYTE, small]
        };
    }
    let mut written = Vec::with_capacity(LONGEST_HEAD);
    if let Ok(two) = u16::try_from(value) {
        written.push(kind | TWO_BYTES);
        written.extend_from_slice(&two.to_be_bytes());
    } else if let Ok(four) = u32::try_from(value) {
        written.push(kind | FOUR_BYTES);
        written.extend_from_slice(&four.to_be_bytes());
    } else {
        written.push(kind | EIGHT_BYTES);
        written.extend_from_slice(&value.to_be_bytes());
    }
    written
}

/// The value of the CBOR head of `major` type at `at` in `cbor`, which `at` then passes; refused
/// unless it is written in the fewest bytes, as dcbor refuses it (RFC 8949, 4.2.1): a value of
/// two bytes, for one, is at least the first that one byte cannot hold.
fn read_head(cbor: &[u8], at: &mut usize, major: u8) -> Result<u64, Refusal> {
    let first = *cbor.get(*at).ok_or(Refusal::Decode)?;
    if first >> MAJOR_SHIFT != major {
        return Err(Refusal::Decode);
    }
    *at += 1;
    let (bytes, least) = match first & ADDITIONAL_INFORMATION {
        info @ 0..ONE_BYTE => return Ok(u64::from(info)),
        ONE_BYTE => (size_of::<u8>(), u64::from(ONE_BYTE)),
        TWO_BYTES => (size_of::<u16>(), u64::from(u8::MAX) + 1),
        FOUR_BYTES => (size_of::<u32>(), u64::from(u16::MAX) + 1),
        EIGHT_BYTES => (size_of::<u64>(), u64::from(u32::MAX) + 1),
        _ => return Err(Refusal::Decode),
    };
    let field = cbor.get(*at..*at + bytes).ok_or(Refusal::Decode)?;
    *at += bytes;
    let value = field
        .iter()
        .fold(0_u64, |value, byte| (value << u8::BITS) | u64::from(*byte));
    if value < least {
        return Err(Refusal::Decode);
    }
    Ok(value)
}

/// The deterministic CBOR of the share `payload`, a byte string, after the share's tag when
/// `tagged`.
fn share_cbor(payload: &[u8], tagged: bool) -> Zeroizing<Vec<u8>> {
    let tag = if tagged {
        head(TAG, SHARE_TAG)
    } else {
        Vec::new()
    };
    let length = head(
        BYTE_STRING,
        u64::try_from(payload.len()).unwrap_or(u64::MAX),
    );
    let mut cbor = Zeroizing::new(Vec::with_capacity(tag.len() + length.len() + payload.len()));
    cbor.extend_from_slice(&tag);
    cbor.extend_from_slice(&length);
    cbor.extend_from_slice(payload);
    cbor
}

/// The letters of a word of Bytewords, four of them.
const WORD_LETTERS: usize = 4;

/// The length of the Bytewords of `count` bytes: two letters each in `minimal`, otherwise words
/// with a space between two of them.
fn bytewords_length(count: usize, minimal: bool) -> usize {
    if minimal {
        2 * count
    } else {
        (WORD_LETTERS + 1) * count - 1
    }
}

/// `cbor` and its CRC-32 as Bytewords after `prefix`: in `minimal` the first and last letters of
/// each word, run together, otherwise the words apart. Written into one string made at its full
/// size, with no list of the words, whose freed memory would name the bytes, and wiped when it is
/// dropped (RUST-13).
fn bytewords_text(prefix: &str, cbor: &[u8], minimal: bool) -> Zeroizing<String> {
    let checksum = crc32(cbor).to_be_bytes();
    let length = prefix.len() + bytewords_length(cbor.len() + CHECKSUM_BYTES, minimal);
    let mut text = Zeroizing::new(String::with_capacity(length));
    text.push_str(prefix);
    for (place, byte) in cbor.iter().chain(checksum.iter()).enumerate() {
        let word = BYTEWORDS[usize::from(*byte)];
        if minimal {
            text.extend(word.chars().take(1).chain(word.chars().last()));
        } else {
            if place > 0 {
                text.push(' ');
            }
            text.push_str(word);
        }
    }
    text
}

/// The compact UR of the share `payload`: its untagged CBOR in minimal Bytewords.
pub(crate) fn compact_ur(payload: &[u8]) -> Zeroizing<String> {
    bytewords_text(UR_PREFIX, &share_cbor(payload, false), true)
}

/// The standard Bytewords of the share `payload`: its tagged CBOR, words apart.
pub(crate) fn standard_bytewords(payload: &[u8]) -> Zeroizing<String> {
    bytewords_text("", &share_cbor(payload, true), false)
}

/// The CRC-32 of `data`, the checksum that ends the bytes of Bytewords.
fn crc32(data: &[u8]) -> u32 {
    !data.iter().fold(!0_u32, |crc, byte| {
        (0..8).fold(crc ^ u32::from(*byte), |crc, _| {
            if crc & 1 == 1 {
                (crc >> 1) ^ CRC32_POLYNOMIAL
            } else {
                crc >> 1
            }
        })
    })
}

/// The byte of a word of Bytewords: a whole word, or its first and last letters in `minimal`.
fn byte_of(word: &[u8], minimal: bool) -> Result<u8, Refusal> {
    BYTEWORDS
        .iter()
        .position(|candidate| {
            let letters = candidate.as_bytes();
            if minimal {
                word.len() == 2 && letters.first() == word.first() && letters.last() == word.last()
            } else {
                letters == word
            }
        })
        .and_then(|index| u8::try_from(index).ok())
        .ok_or(Refusal::Decode)
}

/// The bytes that the Bytewords `text` hold, without their checksum, which must fit them: words
/// apart, or in `minimal` two letters each, run together. Read as bc-ur's decoder reads them, into
/// one buffer of their full size.
fn bytes_of(text: &str, minimal: bool) -> Result<Zeroizing<Vec<u8>>, Refusal> {
    if !text.is_ascii() || (minimal && text.len() % 2 != 0) {
        return Err(Refusal::Decode);
    }
    let count = if minimal {
        text.len() / 2
    } else {
        text.split(' ').count()
    };
    let mut data = Zeroizing::new(Vec::with_capacity(count));
    if minimal {
        for word in text.as_bytes().chunks_exact(2) {
            data.push(byte_of(word, true)?);
        }
    } else {
        for word in text.split(' ') {
            data.push(byte_of(word.as_bytes(), false)?);
        }
    }
    let end = data
        .len()
        .checked_sub(CHECKSUM_BYTES)
        .ok_or(Refusal::Decode)?;
    let (body, checksum) = data.split_at(end);
    if crc32(body).to_be_bytes() != checksum {
        return Err(Refusal::Decode);
    }
    data.truncate(end);
    Ok(data)
}

/// The share in `cbor`: a byte string after one of the `tags`, or after none.
fn payload_of(cbor: &[u8], tags: &[u64]) -> Result<Zeroizing<Vec<u8>>, Refusal> {
    let mut at = 0;
    if cbor.first().map(|first| first >> MAJOR_SHIFT) == Some(TAG)
        && !tags.contains(&read_head(cbor, &mut at, TAG)?)
    {
        return Err(Refusal::Decode);
    }
    let length =
        usize::try_from(read_head(cbor, &mut at, BYTE_STRING)?).map_err(|_| Refusal::Decode)?;
    let payload = cbor.get(at..).ok_or(Refusal::Decode)?;
    if payload.len() != length {
        return Err(Refusal::Decode);
    }
    Ok(Zeroizing::new(payload.to_vec()))
}

/// The share that the compact UR `record` holds, its type and Bytewords in either ASCII case: its
/// body is the share's CBOR without a tag. Any other character is refused, U+212A KELVIN SIGN too,
/// which bc-ur's Unicode lower case took for k.
pub(crate) fn read_compact_ur(record: &str) -> Result<Zeroizing<Vec<u8>>, Refusal> {
    let lower = Zeroizing::new(record.to_ascii_lowercase());
    let body = lower.strip_prefix(UR_PREFIX).ok_or(Refusal::Decode)?;
    payload_of(&bytes_of(body, true)?, &[])
}

/// The standard Bytewords of the share `payload` without its tag, as earlier backups wrote it.
#[cfg(test)]
pub(crate) fn untagged_standard_bytewords(payload: &[u8]) -> Zeroizing<String> {
    bytewords_text("", &share_cbor(payload, false), false)
}

/// The share that the standard Bytewords `record` hold: the share's CBOR with its tag, or, for
/// existing backups only, the earlier tag or none.
pub(crate) fn read_standard_bytewords(record: &str) -> Result<Zeroizing<Vec<u8>>, Refusal> {
    payload_of(&bytes_of(record, false)?, &[SHARE_TAG, SHARE_TAG_V1])
}

#[cfg(test)]
mod tests {
    use super::*;
    use bc_ur::bytewords::{self, Style};

    #[test]
    fn writes_and_reads_cbor_heads_in_their_fewest_bytes() {
        for (value, written) in [
            (0, vec![0x40]),
            (23, vec![0x40 | 23]),
            (24, vec![0x58, 24]),
            (255, vec![0x58, 255]),
            (256, vec![0x59, 1, 0]),
            (65_536, vec![0x5a, 0, 1, 0, 0]),
        ] {
            assert_eq!(head(BYTE_STRING, value), written);
            let mut at = 0;
            assert_eq!(read_head(&written, &mut at, BYTE_STRING), Ok(value));
            assert_eq!(at, written.len());
        }
        assert_eq!(head(TAG, SHARE_TAG), vec![0xd9, 0x9d, 0x75]);
        // 21 written in two bytes is not the fewest, and is refused.
        assert_eq!(
            read_head(&[0x58, 21], &mut 0, BYTE_STRING),
            Err(Refusal::Decode)
        );
    }

    #[test]
    fn checks_the_crc32_of_the_check_value() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
    }

    #[test]
    fn refuses_bytewords_with_a_wrong_word_or_checksum() {
        let record = compact_ur(&[0x42; 21]);
        let changed = record.replacen("ur:sskr/", "ur:sskr/ae", 1);
        assert_eq!(read_compact_ur(&changed), Err(Refusal::Decode));
        assert_eq!(read_compact_ur("ur:sskr/zz"), Err(Refusal::Decode));
        assert_eq!(read_standard_bytewords("able acid"), Err(Refusal::Decode));
    }

    #[test]
    fn reads_a_compact_ur_in_either_case() {
        let record = compact_ur(&[0x42; 21]);
        assert_eq!(
            read_compact_ur(&record.to_ascii_uppercase()).map(|share| share.to_vec()),
            Ok(vec![0x42; 21])
        );
    }

    /// The published BCR-2020-011 share, whose CBOR is the head 0x55 and 21 bytes.
    const SHARE: &str = "ur:sskr/gogrrsbyadaefmnlbnctaaecvoqdfnjpbzecstfgaxtifpsskbfw";

    /// The 21 bytes of SHARE, read with bc-ur, as a known answer made apart from this module.
    fn published_payload() -> Vec<u8> {
        let body = SHARE.strip_prefix("ur:sskr/").unwrap_or_default();
        let cbor = bytewords::decode(body, Style::Minimal).unwrap_or_default();
        cbor.get(1..).map(<[u8]>::to_vec).unwrap_or_default()
    }

    /// `cbor`, written as bc-ur writes it: a compact UR, or standard Bytewords.
    fn written(cbor: &[u8], compact: bool) -> String {
        if compact {
            format!("ur:sskr/{}", bytewords::encode(cbor, Style::Minimal))
        } else {
            bytewords::encode(cbor, Style::Standard)
        }
    }

    /// The share read back from `cbor` written in either encoding.
    fn read(cbor: &[u8], compact: bool) -> Result<Vec<u8>, Refusal> {
        let text = written(cbor, compact);
        let share = if compact {
            read_compact_ur(&text)
        } else {
            read_standard_bytewords(&text)
        };
        share.map(|payload| payload.to_vec())
    }

    #[test]
    fn writes_the_texts_that_bc_ur_writes_in_one_string_of_their_size() {
        let payload = published_payload();
        let mut cbor = vec![0x55];
        cbor.extend_from_slice(&payload);
        let record = compact_ur(&payload);
        assert_eq!(record.as_str(), SHARE);
        assert_eq!(record.capacity(), record.len());
        let mut tagged = vec![0xd9, 0x9d, 0x75];
        tagged.extend_from_slice(&cbor);
        let words = standard_bytewords(&payload);
        assert_eq!(*words, written(&tagged, false));
        assert_eq!(words.capacity(), words.len());
    }

    #[test]
    fn refuses_a_byte_after_the_share_and_a_share_shorter_than_its_head_in_both_encodings() {
        let payload = published_payload();
        for compact in [true, false] {
            let mut longer = vec![0x55];
            longer.extend_from_slice(&payload);
            longer.push(0);
            assert_eq!(read(&longer, compact), Err(Refusal::Decode));
            let mut shorter = vec![0x56];
            shorter.extend_from_slice(&payload);
            assert_eq!(read(&shorter, compact), Err(Refusal::Decode));
        }
    }

    #[test]
    fn reads_standard_bytewords_with_either_tag_or_none_and_refuses_another_tag() {
        let payload = published_payload();
        for tag in [&[0xd9, 0x9d, 0x75][..], &[0xd9, 0x01, 0x35], &[]] {
            let mut cbor = tag.to_vec();
            cbor.push(0x55);
            cbor.extend_from_slice(&payload);
            assert_eq!(read(&cbor, false), Ok(payload.clone()));
        }
        for tag in [&[0xd9, 0x9d, 0x74][..], &[0xda, 0x00, 0x00, 0x9d, 0x75]] {
            let mut cbor = tag.to_vec();
            cbor.push(0x55);
            cbor.extend_from_slice(&payload);
            assert_eq!(read(&cbor, false), Err(Refusal::Decode));
        }
    }

    #[test]
    fn refuses_a_compact_ur_whose_share_carries_a_tag() {
        let payload = published_payload();
        for tag in [[0xd9, 0x9d, 0x75], [0xd9, 0x01, 0x35]] {
            let mut cbor = tag.to_vec();
            cbor.push(0x55);
            cbor.extend_from_slice(&payload);
            assert_eq!(read(&cbor, true), Err(Refusal::Decode));
        }
    }

    #[test]
    fn refuses_an_empty_share_and_a_kelvin_sign() {
        assert_eq!(read_compact_ur("ur:sskr/"), Err(Refusal::Decode));
        assert_eq!(read_standard_bytewords(""), Err(Refusal::Decode));
        assert_eq!(
            read_compact_ur(&SHARE.replacen("sskr", "ss\u{212A}r", 1)),
            Err(Refusal::Decode)
        );
    }
}
