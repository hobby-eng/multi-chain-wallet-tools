use bc_rand::RandomNumberGenerator;
use bc_ur::{bytewords, prelude::*};
use rand_chacha::ChaCha20Rng;
use rand_core::{CryptoRng, RngCore, SeedableRng};
use sskr::{sskr_combine, sskr_generate_using, GroupSpec, Secret, Spec};
use wasm_bindgen::prelude::*;
use zeroize::{Zeroize, Zeroizing};

struct BrowserSeedRng(ChaCha20Rng);

impl RngCore for BrowserSeedRng {
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

impl CryptoRng for BrowserSeedRng {}
impl RandomNumberGenerator for BrowserSeedRng {}

impl Drop for BrowserSeedRng {
    fn drop(&mut self) {
        self.0 = ChaCha20Rng::from_seed([0; 32]);
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

fn message(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

const ENCODING_COMPACT_UR: u8 = 0;
const ENCODING_BYTEWORDS: u8 = 1;

fn encode_share(share: Vec<u8>, encoding: u8) -> Result<String, JsValue> {
    let share = UrShare(share);
    match encoding {
        ENCODING_COMPACT_UR => Ok(share.ur_string()),
        ENCODING_BYTEWORDS => Ok(bytewords::encode(
            share.tagged_cbor().to_cbor_data(),
            bytewords::Style::Standard,
        )),
        _ => Err(JsValue::from_str("Unsupported SSKR share encoding.")),
    }
}

fn decode_share(record: &str, encoding: u8) -> Result<Vec<u8>, JsValue> {
    match encoding {
        ENCODING_COMPACT_UR => UrShare::from_ur_string(record)
            .map(|mut value| std::mem::take(&mut value.0))
            .map_err(message),
        ENCODING_BYTEWORDS => {
            let data = bytewords::decode(record, bytewords::Style::Standard)
                .map_err(message)?;
            let cbor = CBOR::try_from_data(data).map_err(message)?;
            // Standard textual SSKR Bytewords carries the registered CBOR tag.
            // Accept the earlier CKD untagged wrapper for existing backups only.
            UrShare::from_tagged_cbor(cbor.clone())
                .or_else(|_| UrShare::from_untagged_cbor(cbor))
                .map(|mut value| std::mem::take(&mut value.0))
                .map_err(message)
        }
        _ => Err(JsValue::from_str("Unsupported SSKR share encoding.")),
    }
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
        ENCODING_COMPACT_UR,
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
    let result = (|| {
        if group_specs.is_empty() || group_specs.len() % 2 != 0 {
            return Err(JsValue::from_str(
                "SSKR groups must contain threshold/count pairs.",
            ));
        }
        let groups = group_specs
            .chunks_exact(2)
            .map(|pair| {
                GroupSpec::new(usize::from(pair[0]), usize::from(pair[1]))
                    .map_err(message)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let spec = Spec::new(usize::from(group_threshold), groups).map_err(message)?;
        let secret_value = Secret::new(&secret).map_err(message)?;
        let mut seed: [u8; 32] = random_seed.as_slice().try_into().map_err(|_| {
            JsValue::from_str("SSKR requires exactly 32 bytes of browser-generated randomness.")
        })?;
        let mut rng = BrowserSeedRng(ChaCha20Rng::from_seed(seed));
        seed.zeroize();
        let records = sskr_generate_using(&spec, &secret_value, &mut rng)
            .map_err(message)?
            .into_iter()
            .flatten()
            .map(|share| encode_share(share, encoding))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(records.join("\n"))
    })();
    secret.zeroize();
    random_seed.zeroize();
    result
}

#[wasm_bindgen]
pub fn recover_sskr_shares(records: String) -> Result<Vec<u8>, JsValue> {
    recover_sskr_shares_formatted(records, ENCODING_COMPACT_UR)
}

#[wasm_bindgen]
pub fn recover_sskr_shares_formatted(
    mut records: String,
    encoding: u8,
) -> Result<Vec<u8>, JsValue> {
    bc_tags::register_tags();
    let result = (|| {
        let shares = records
            .lines()
            .map(str::trim)
            .filter(|record| !record.is_empty())
            .map(|record| decode_share(record, encoding).map(Zeroizing::new))
            .collect::<Result<Vec<_>, _>>()?;
        if shares.is_empty() {
            return Err(JsValue::from_str("Enter at least one ur:sskr share."));
        }
        sskr_combine(&shares)
            .map(|secret| secret.as_ref().to_vec())
            .map_err(message)
    })();
    records.zeroize();
    result
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
                ENCODING_BYTEWORDS,
            )
            .unwrap(),
            secret,
        );
    }

    #[test]
    fn grouped_round_trip() {
        let secret = vec![0x42; 16];
        let records =
            create_sskr_shares(secret.clone(), 2, vec![2, 3, 1, 2], vec![7; 32]).unwrap();
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
            ENCODING_BYTEWORDS,
        )
        .unwrap();
        let word_lines: Vec<_> = word_records.lines().collect();
        assert!(word_lines[0].contains(' '));
        assert_eq!(
            recover_sskr_shares_formatted(
                [word_lines[0], word_lines[2]].join("\n"),
                ENCODING_BYTEWORDS,
            )
            .unwrap(),
            secret,
        );
    }
}
