use bc_rand::RandomNumberGenerator;
use bc_ur::{bytewords, prelude::*};
use rand_chacha::ChaCha20Rng;
use rand_core::{CryptoRng, RngCore, SeedableRng};
use sskr::{sskr_combine, sskr_generate_using, GroupSpec, Secret, Spec};
use wasm_bindgen::prelude::*;
use zeroize::{Zeroize, Zeroizing};

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

#[derive(Clone)]
struct UrShare(Vec<u8>);

impl Drop for UrShare {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl UrShare {
    /// The share's bytes, moved out of it; the emptied share has nothing left to wipe.
    fn into_bytes(mut self) -> Vec<u8> {
        std::mem::take(&mut self.0)
    }
}

impl CBORTagged for UrShare {
    fn cbor_tags() -> Vec<Tag> {
        tags_for_values(&[bc_tags::TAG_SSKR_SHARE, bc_tags::TAG_SSKR_SHARE_V1])
    }
}

impl From<UrShare> for CBOR {
    fn from(value: UrShare) -> Self {
        value.tagged_cbor()
    }
}

impl CBORTaggedEncodable for UrShare {
    fn untagged_cbor(&self) -> CBOR {
        CBOR::to_byte_string(&self.0)
    }
}

impl TryFrom<CBOR> for UrShare {
    type Error = dcbor::Error;

    fn try_from(cbor: CBOR) -> dcbor::Result<Self> {
        Self::from_tagged_cbor(cbor)
    }
}

impl CBORTaggedDecodable for UrShare {
    fn from_untagged_cbor(cbor: CBOR) -> dcbor::Result<Self> {
        Ok(Self(cbor.try_into_byte_string()?.to_vec()))
    }
}

/// A refusal, as the text that the host shows.
type Refusal = String;

fn refusal(error: impl std::fmt::Display) -> Refusal {
    error.to_string()
}

/// A refusal as JavaScript receives it: the text, thrown.
fn thrown(text: Refusal) -> JsValue {
    JsValue::from_str(&text)
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
    CompactUr = 0,
    Bytewords = 1,
}

const UNSUPPORTED_ENCODING: &str = "Unsupported SSKR share encoding.";

impl TryFrom<u8> for ShareEncoding {
    type Error = &'static str;

    fn try_from(code: u8) -> Result<Self, Self::Error> {
        [Self::CompactUr, Self::Bytewords]
            .into_iter()
            .find(|encoding| *encoding as u8 == code)
            .ok_or(UNSUPPORTED_ENCODING)
    }
}

/// The refusal of an empty list of shares, in either encoding. The hosts' assertShareCount
/// (src/sskr/transport.ts) owns the rule and also bounds the number of shares; the bridge refuses
/// again because any host may call it directly.
const NO_SHARES: &str = "Enter at least one SSKR share.";

fn encode_share(share: &UrShare, encoding: ShareEncoding) -> String {
    match encoding {
        ShareEncoding::CompactUr => share.ur_string(),
        ShareEncoding::Bytewords => bytewords::encode(
            share.tagged_cbor().to_cbor_data(),
            bytewords::Style::Standard,
        ),
    }
}

fn decode_share(record: &str, encoding: ShareEncoding) -> Result<Vec<u8>, Refusal> {
    let share = match encoding {
        ShareEncoding::CompactUr => UrShare::from_ur_string(record).map_err(refusal)?,
        ShareEncoding::Bytewords => {
            let data = bytewords::decode(record, bytewords::Style::Standard).map_err(refusal)?;
            let cbor = CBOR::try_from_data(data).map_err(refusal)?;
            // Standard textual SSKR Bytewords carries the registered CBOR tag.
            // Accept the earlier CKD untagged wrapper for existing backups only.
            UrShare::from_tagged_cbor(cbor.clone())
                .or_else(|_| UrShare::from_untagged_cbor(cbor))
                .map_err(refusal)?
        }
    };
    Ok(share.into_bytes())
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
        return Err(refusal("SSKR groups must contain threshold/count pairs."));
    }
    let groups = group_specs
        .chunks_exact(2)
        .map(|pair| GroupSpec::new(usize::from(pair[0]), usize::from(pair[1])).map_err(refusal))
        .collect::<Result<Vec<_>, _>>()?;
    let spec = Spec::new(usize::from(group_threshold), groups).map_err(refusal)?;
    let secret_value = Secret::new(secret).map_err(refusal)?;
    let mut seed: Seed = random_seed.try_into().map_err(|_| {
        format!(
            "SSKR requires exactly {} bytes of fresh randomness.",
            std::mem::size_of::<Seed>()
        )
    })?;
    let mut rng = HostSeedRng(ChaCha20Rng::from_seed(seed));
    seed.zeroize();
    // Every share is held by a UrShare at once, which wipes it when dropped, whatever happens
    // after.
    let shares: Vec<UrShare> = sskr_generate_using(&spec, &secret_value, &mut rng)
        .map_err(refusal)?
        .into_iter()
        .flatten()
        .map(UrShare)
        .collect();
    let mut records: Vec<String> = shares
        .iter()
        .map(|share| encode_share(share, encoding))
        .collect();
    let joined = records.join("\n");
    // The joined text goes to the host; its parts are wiped here.
    records.iter_mut().for_each(Zeroize::zeroize);
    Ok(joined)
}

/// The secret of the shares `records`, one per line, written in `encoding`.
fn combine(records: &str, encoding: u8) -> Result<Vec<u8>, Refusal> {
    let encoding = ShareEncoding::try_from(encoding)?;
    let shares = records
        .lines()
        .map(str::trim)
        .filter(|record| !record.is_empty())
        .map(|record| decode_share(record, encoding).map(Zeroizing::new))
        .collect::<Result<Vec<_>, _>>()?;
    if shares.is_empty() {
        return Err(refusal(NO_SHARES));
    }
    sskr_combine(&shares)
        .map(|secret| secret.as_ref().to_vec())
        .map_err(refusal)
}

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

#[wasm_bindgen]
pub fn create_sskr_shares_formatted(
    mut secret: Vec<u8>,
    group_threshold: u8,
    group_specs: Vec<u8>,
    mut random_seed: Vec<u8>,
    encoding: u8,
) -> Result<String, JsValue> {
    bc_tags::register_tags();
    let result = split(
        &secret,
        group_threshold,
        &group_specs,
        &random_seed,
        encoding,
    );
    secret.zeroize();
    random_seed.zeroize();
    result.map_err(thrown)
}

#[wasm_bindgen]
pub fn recover_sskr_shares(records: String) -> Result<Vec<u8>, JsValue> {
    recover_sskr_shares_formatted(records, ShareEncoding::CompactUr as u8)
}

#[wasm_bindgen]
pub fn recover_sskr_shares_formatted(
    mut records: String,
    encoding: u8,
) -> Result<Vec<u8>, JsValue> {
    bc_tags::register_tags();
    let result = combine(&records, encoding);
    records.zeroize();
    result.map_err(thrown)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restores_legacy_untagged_bytewords() {
        bc_tags::register_tags();
        let secret = vec![0x24; 16];
        let records = create_sskr_shares(secret.clone(), 1, vec![2, 3], vec![5; 32]).unwrap();
        let legacy = records
            .lines()
            .map(|record| {
                let share = UrShare::from_ur_string(record).unwrap();
                bytewords::encode(share.ur().cbor().to_cbor_data(), bytewords::Style::Standard)
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
    fn encoding_codes() {
        assert_eq!(ShareEncoding::try_from(0), Ok(ShareEncoding::CompactUr));
        assert_eq!(ShareEncoding::try_from(1), Ok(ShareEncoding::Bytewords));
        for code in [2, u8::MAX] {
            assert_eq!(ShareEncoding::try_from(code), Err(UNSUPPORTED_ENCODING));
        }
    }

    #[test]
    fn refuses_an_unknown_encoding_before_any_share() {
        assert_eq!(
            split(&[0x42; 16], 1, &[2, 3], &[7; 32], 2),
            Err(UNSUPPORTED_ENCODING.to_string())
        );
        assert_eq!(combine("", 2), Err(UNSUPPORTED_ENCODING.to_string()));
    }

    #[test]
    fn refuses_a_seed_of_another_length() {
        let refused = "SSKR requires exactly 32 bytes of fresh randomness.".to_string();
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
                Err(refused.clone())
            );
        }
    }

    #[test]
    fn refuses_no_shares_in_either_encoding() {
        for encoding in [ShareEncoding::CompactUr, ShareEncoding::Bytewords] {
            assert_eq!(combine(" \n\n", encoding as u8), Err(NO_SHARES.to_string()));
        }
    }

    #[test]
    fn grouped_round_trip() {
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
}
