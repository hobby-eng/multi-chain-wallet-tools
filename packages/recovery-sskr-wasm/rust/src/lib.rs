//! The SSKR engine of MnemoCode, built into WebAssembly: Blockchain Commons' SSKR, which splits a
//! secret into Shamir shares and restores it, with the shares written as compact URs or standard
//! Bytewords. The host gives the fresh randomness of a split and reads the shares one per line.
//! Once a call returns, its memory holds no copy of a secret, a seed or a share that the engine or
//! its dependencies made while working: the buffers it owns are wiped, the text of a share is
//! written and read here (share_text.rs), and the stack that the SSKR library worked on is
//! overwritten (scrub_stack); test/sskr-engine-memory.test.ts searches the whole memory for them.
//! What a call returns to the host, the text of the shares or the secret, the glue that
//! scripts/build-sskr-wasm.mjs writes wipes in this memory once the host holds its copy.

use bc_rand::RandomNumberGenerator;
use rand_chacha::ChaCha20Rng;
use rand_core::{CryptoRng, RngCore, SeedableRng};
use sskr::{sskr_combine, sskr_generate_using, GroupSpec, Secret, Spec};
use wasm_bindgen::prelude::*;
use zeroize::{Zeroize, Zeroizing};

mod refusal;
mod share_text;
pub use refusal::Refusal;

/// The bytes of the stack below an entry's frame that scrub_stack overwrites once the SSKR library
/// has returned: more than five times the deepest that a split or a restore was measured to go,
/// 2,936 bytes, which test/sskr-engine-memory.test.ts would show (AUD-037-SEC005).
const STACK_SCRUB_BYTES: usize = 16 * 1024;

/// Overwrites with zeros the stack below its caller, where the SSKR library and its dependencies
/// leave what they do not wipe, such as the message of the HMAC that checks a restored secret: a
/// buffer as large as STACK_SCRUB_BYTES on the stack, written byte by byte so that no write is left
/// out, and never inlined, so that it lies below the frame that called it.
#[inline(never)]
fn scrub_stack() {
    let mut area = [0_u8; STACK_SCRUB_BYTES];
    area.zeroize();
    std::hint::black_box(&mut area);
}

/// The seed of a split's generator: as many bytes as ChaCha20 takes. The hosts' SEED_BYTES
/// (src/sskr/share-platform.ts) is a deliberate copy, which test/sskr-vectors.test.ts keeps in step
/// by asking this engine to take it and to refuse one byte less and one more.
type Seed = <ChaCha20Rng as SeedableRng>::Seed;

/// The generator of a split, seeded with the host's fresh randomness (a browser's or Node.js's).
struct HostSeedRng(ChaCha20Rng);

impl RngCore for HostSeedRng {
    fn next_u32(&mut self) -> u32 {
        self.0.next_u32()
    }

    fn next_u64(&mut self) -> u64 {
        self.0.next_u64()
    }

    fn fill_bytes(&mut self, destination: &mut [u8]) {
        self.0.fill_bytes(destination);
    }
}

impl CryptoRng for HostSeedRng {}
impl RandomNumberGenerator for HostSeedRng {}

impl Drop for HostSeedRng {
    fn drop(&mut self) {
        self.0 = ChaCha20Rng::from_seed(Seed::default());
        std::hint::black_box(&mut self.0);
    }
}

/// The bytes of one share, wiped when it is dropped.
struct UrShare(Vec<u8>);

impl Drop for UrShare {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// The encodings of a share, which a host asks for by their number: the compact UR, or standard
/// Bytewords. JavaScript reads the numbers from this enum (`ShareEncoding.CompactUr`), so they are
/// written only here.
///
/// The entries still take the number as a `u8`: wasm-bindgen refuses a number outside an enum by
/// throwing before any code here runs, which would leave the secret it has already copied in
/// unwiped. `ShareEncoding::try_from` refuses it inside the entry, which then wipes the secret
/// (AUD-012-SEC001).
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShareEncoding {
    /// The compact UR of a share (ur:sskr/...), its minimal Bytewords.
    CompactUr = 0,
    /// The standard Bytewords of a share's tagged CBOR.
    Bytewords = 1,
}

const UNSUPPORTED_ENCODING: &str = "Unsupported SSKR share encoding.";

impl TryFrom<u8> for ShareEncoding {
    type Error = Refusal;

    fn try_from(code: u8) -> Result<Self, Self::Error> {
        [Self::CompactUr, Self::Bytewords]
            .into_iter()
            .find(|encoding| *encoding as u8 == code)
            .ok_or(Refusal::Encoding)
    }
}

/// The refusal of an empty list of shares, in either encoding. The hosts' assertShareCount
/// (src/sskr/transport.ts) owns the rule and also bounds the number of shares; the bridge refuses
/// again because any host may call it directly.
const NO_SHARES: &str = "Enter at least one SSKR share.";

fn encode_share(share: &UrShare, encoding: ShareEncoding) -> Zeroizing<String> {
    match encoding {
        ShareEncoding::CompactUr => share_text::compact_ur(&share.0),
        ShareEncoding::Bytewords => share_text::standard_bytewords(&share.0),
    }
}

fn decode_share(record: &str, encoding: ShareEncoding) -> Result<Zeroizing<Vec<u8>>, Refusal> {
    match encoding {
        ShareEncoding::CompactUr => share_text::read_compact_ur(record),
        ShareEncoding::Bytewords => share_text::read_standard_bytewords(record),
    }
}

/// The shares of `secret` in `encoding`, one per line, from the generator seeded with
/// `random_seed`.
fn split(
    secret: &[u8],
    group_threshold: u8,
    group_specs: &[u8],
    random_seed: &[u8],
    encoding: u8,
) -> Result<String, Refusal> {
    // Refused before the secret is read or any share is made (AUD-012-SEC001).
    let encoding = ShareEncoding::try_from(encoding)?;
    if group_specs.is_empty() || group_specs.len() % 2 != 0 {
        return Err(Refusal::GroupPairs);
    }
    let groups = group_specs
        .chunks_exact(2)
        .map(|pair| {
            GroupSpec::new(usize::from(pair[0]), usize::from(pair[1]))
                .map_err(|error| Refusal::Group(message(error)))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let spec = Spec::new(usize::from(group_threshold), groups)
        .map_err(|error| Refusal::Specification(message(error)))?;
    // Validate randomness before the upstream owner makes its additional secret copy.
    let mut seed = Zeroizing::new(Seed::try_from(random_seed).map_err(|_| Refusal::Randomness)?);
    let secret_value = Secret::new(secret).map_err(|error| Refusal::Secret(message(error)))?;
    let mut rng = HostSeedRng(ChaCha20Rng::from_seed(*seed));
    seed.zeroize();
    // Every share is held by a UrShare at once, which wipes it when dropped, whatever happens
    // after.
    let shares: Vec<UrShare> = sskr_generate_using(&spec, &secret_value, &mut rng)
        .map_err(|error| Refusal::Generate(message(error)))?
        .into_iter()
        .flatten()
        .map(UrShare)
        .collect();
    let records: Vec<Zeroizing<String>> = shares
        .iter()
        .map(|share| encode_share(share, encoding))
        .collect();
    Ok(joined_lines(&records))
}

/// `records` one per line, in one string made at its full size at once, so that no smaller copy
/// of a share is left behind; the string goes to the host, whose glue wipes it here once it holds
/// its copy, and the records are wiped when they are dropped.
fn joined_lines(records: &[Zeroizing<String>]) -> String {
    let breaks = records.len().saturating_sub(1);
    let length = records.iter().map(|record| record.len()).sum::<usize>() + breaks;
    let mut joined = String::with_capacity(length);
    for (place, record) in records.iter().enumerate() {
        if place > 0 {
            joined.push('\n');
        }
        joined.push_str(record);
    }
    joined
}

/// The secret of the shares `records`, one per line, written in `encoding`.
fn combine(records: &str, encoding: u8) -> Result<Vec<u8>, Refusal> {
    let encoding = ShareEncoding::try_from(encoding)?;
    let shares = records
        .lines()
        .map(str::trim)
        .filter(|record| !record.is_empty())
        .map(|record| decode_share(record, encoding))
        .collect::<Result<Vec<_>, _>>()?;
    if shares.is_empty() {
        return Err(Refusal::NoShares);
    }
    sskr_combine(&shares)
        .map(|secret| secret.as_ref().to_vec())
        .map_err(|error| Refusal::Combine(message(error)))
}

/// The shares of `secret` as compact URs, one per line (create_sskr_shares_formatted).
#[wasm_bindgen]
pub fn create_sskr_shares(
    secret: Vec<u8>,
    group_threshold: u8,
    group_specs: Vec<u8>,
    random_seed: Vec<u8>,
) -> Result<String, JsValue> {
    create_sskr_shares_formatted(
        secret,
        group_threshold,
        group_specs,
        random_seed,
        ShareEncoding::CompactUr as u8,
    )
}

/// The shares of `secret` in the encoding numbered `encoding` (ShareEncoding), one per line: of
/// the groups `group_specs`, a threshold and a count for each, of which `group_threshold` restore
/// it, made with a generator seeded with the host's fresh `random_seed`. The secret and the seed
/// are wiped, also when the split is refused.
#[wasm_bindgen]
pub fn create_sskr_shares_formatted(
    secret: Vec<u8>,
    group_threshold: u8,
    group_specs: Vec<u8>,
    random_seed: Vec<u8>,
    encoding: u8,
) -> Result<String, JsValue> {
    // Both under a wiping owner before anything can fail, without a copy.
    let secret = Zeroizing::new(secret);
    let random_seed = Zeroizing::new(random_seed);
    let result = split(
        &secret,
        group_threshold,
        &group_specs,
        &random_seed,
        encoding,
    );
    drop(secret);
    drop(random_seed);
    scrub_stack();
    result.map_err(Refusal::thrown)
}

/// The secret of the compact UR shares `records`, one per line (recover_sskr_shares_formatted).
#[wasm_bindgen]
pub fn recover_sskr_shares(records: String) -> Result<Vec<u8>, JsValue> {
    recover_sskr_shares_formatted(records, ShareEncoding::CompactUr as u8)
}

/// The secret of the shares `records`, one per line, in the encoding numbered `encoding`
/// (ShareEncoding). The records are wiped, also when they are refused.
#[wasm_bindgen]
pub fn recover_sskr_shares_formatted(records: String, encoding: u8) -> Result<Vec<u8>, JsValue> {
    // Under a wiping owner before anything can fail, without a copy.
    let records = Zeroizing::new(records);
    let result = combine(&records, encoding);
    drop(records);
    scrub_stack();
    result.map_err(Refusal::thrown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_group_index_outside_its_declared_group_count_in_both_encodings() {
        for encoding in [ShareEncoding::CompactUr, ShareEncoding::Bytewords] {
            let mut payload = vec![0, 0, 0, 0, 0];
            payload.extend_from_slice(&[0x24; 16]);
            let valid = encode_share(&UrShare(payload.clone()), encoding);
            assert_eq!(combine(&valid, encoding as u8).unwrap(), vec![0x24; 16]);
            payload[3] = 0x10;
            let invalid = encode_share(&UrShare(payload), encoding);
            assert!(matches!(
                combine(&invalid, encoding as u8),
                Err(Refusal::Combine(_))
            ));
        }
    }

    #[test]
    fn refuses_a_share_with_bytes_after_it_rather_than_restoring_a_longer_secret() {
        let records = create_sskr_shares(vec![0x42; 16], 1, vec![1, 1], vec![7; 32]).unwrap();
        let payload = decode_share(&records, ShareEncoding::CompactUr).unwrap();
        let mut cbor = vec![0x55];
        cbor.extend_from_slice(&payload);
        cbor.extend_from_slice(&[0, 0]);
        let longer = format!(
            "ur:sskr/{}",
            bc_ur::bytewords::encode(&cbor, bc_ur::bytewords::Style::Minimal)
        );
        assert_eq!(
            combine(&longer, ShareEncoding::CompactUr as u8),
            Err(Refusal::Decode)
        );
    }

    #[test]
    fn restores_legacy_untagged_bytewords() {
        let secret = vec![0x24; 16];
        let records = create_sskr_shares(secret.clone(), 1, vec![2, 3], vec![5; 32]).unwrap();
        let legacy = records
            .lines()
            .map(|record| {
                let share = share_text::read_compact_ur(record).unwrap();
                share_text::untagged_standard_bytewords(&share)
            })
            .collect::<Vec<_>>();
        assert_eq!(
            recover_sskr_shares_formatted(
                [legacy[0].as_str(), legacy[2].as_str()].join("\n"),
                ShareEncoding::Bytewords as u8,
            )
            .unwrap(),
            secret,
        );
    }

    #[test]
    fn accepts_known_encoding_codes_and_refuses_unknown_codes() {
        assert_eq!(ShareEncoding::try_from(0), Ok(ShareEncoding::CompactUr));
        assert_eq!(ShareEncoding::try_from(1), Ok(ShareEncoding::Bytewords));
        for code in [2, u8::MAX] {
            assert_eq!(ShareEncoding::try_from(code), Err(Refusal::Encoding));
        }
    }

    #[test]
    fn refuses_an_unknown_encoding_before_any_share() {
        assert_eq!(
            split(&[0x42; 16], 1, &[2, 3], &[7; 32], 2),
            Err(Refusal::Encoding)
        );
        assert_eq!(combine("", 2), Err(Refusal::Encoding));
    }

    #[test]
    fn refuses_a_seed_of_another_length() {
        assert_eq!(
            Refusal::Randomness.to_string(),
            "SSKR requires exactly 32 bytes of fresh randomness."
        );
        for length in [31, 33] {
            let seed = vec![7; length];
            assert_eq!(
                split(
                    &[0x42; 16],
                    1,
                    &[2, 3],
                    &seed,
                    ShareEncoding::CompactUr as u8
                ),
                Err(Refusal::Randomness)
            );
        }
    }

    #[test]
    fn refuses_no_shares_in_either_encoding() {
        for encoding in [ShareEncoding::CompactUr, ShareEncoding::Bytewords] {
            assert_eq!(combine(" \n\n", encoding as u8), Err(Refusal::NoShares));
        }
    }

    #[test]
    fn restores_secret_from_grouped_compact_ur_and_bytewords_quorums() {
        let secret = vec![0x42; 16];
        let records = create_sskr_shares(secret.clone(), 2, vec![2, 3, 1, 2], vec![7; 32]).unwrap();
        let lines: Vec<_> = records.lines().collect();
        assert_eq!(
            recover_sskr_shares([lines[0], lines[1], lines[3]].join("\n")).unwrap(),
            secret,
        );

        let word_records = create_sskr_shares_formatted(
            secret.clone(),
            1,
            vec![2, 3],
            vec![9; 32],
            ShareEncoding::Bytewords as u8,
        )
        .unwrap();
        let word_lines: Vec<_> = word_records.lines().collect();
        assert!(word_lines[0].contains(' '));
        assert_eq!(
            recover_sskr_shares_formatted(
                [word_lines[0], word_lines[2]].join("\n"),
                ShareEncoding::Bytewords as u8,
            )
            .unwrap(),
            secret,
        );
    }

    #[test]
    fn writes_the_text_of_a_share_into_an_owner_that_wipes_it_on_drop() {
        // Fails to build where the text is held by a type that does not wipe it (RUST-13).
        fn wiped_on_drop<T: zeroize::ZeroizeOnDrop>(_: &T) {}
        let share = UrShare(vec![0x42; 21]);
        for encoding in [ShareEncoding::CompactUr, ShareEncoding::Bytewords] {
            wiped_on_drop(&encode_share(&share, encoding));
        }
    }

    // Published BCR-2020-011 share and its independently retained Bytewords, unchanged.
    const SHARE: &str = "ur:sskr/gogrrsbyadaefmnlbnctaaecvoqdfnjpbzecstfgaxtifpsskbfw";
    const WORDS: &str = "tuna next keep gyro gear runs body acid able film nail barn cost aqua epic veto quad fern jump buzz epic slot frog apex taxi grim fern twin leaf";

    #[test]
    fn preserves_literal_public_encodings() {
        let share = UrShare(
            decode_share(SHARE, ShareEncoding::CompactUr)
                .unwrap()
                .to_vec(),
        );
        assert_eq!(
            encode_share(&share, ShareEncoding::CompactUr).as_str(),
            SHARE
        );
        assert_eq!(
            encode_share(&share, ShareEncoding::Bytewords).as_str(),
            WORDS
        );
        assert_eq!(
            decode_share(WORDS, ShareEncoding::Bytewords)
                .unwrap()
                .to_vec(),
            share.0
        );
    }

    #[test]
    fn discards_wrong_type_and_malformed_decoder_details() {
        let wrong_type = SHARE.replacen("ur:sskr/", "ur:private-user-token/", 1);
        let bad_checksum = format!("{}ae", &SHARE[..SHARE.len() - 2]);
        for (record, encoding) in [
            (wrong_type.as_str(), ShareEncoding::CompactUr),
            (bad_checksum.as_str(), ShareEncoding::CompactUr),
            ("private-user-token invalid words", ShareEncoding::Bytewords),
        ] {
            let refusal = decode_share(record, encoding).unwrap_err();
            assert_eq!(refusal, Refusal::Decode);
            assert_eq!(refusal.code(), "sskr.engine.decode");
            assert_eq!(refusal.to_string(), "The SSKR share could not be decoded.");
            assert_eq!(format!("{refusal:?}"), "Decode");
            assert!(std::error::Error::source(&refusal).is_none());
        }
    }
}
