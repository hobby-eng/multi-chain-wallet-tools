//! Narrow WebAssembly boundary around the pinned `rust-codex32` reference implementation.
//! The host supplies all entropy. This crate validates, checksums, and interpolates only.

#![deny(unsafe_code)]

mod record;

use record::{Codex32Record, MAX_THRESHOLD, MIN_THRESHOLD, SEED_BYTES, SHARE_INDICES};
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

fn message(error: String) -> JsValue {
    JsValue::from_str(&error)
}

#[wasm_bindgen]
pub fn codex32_parameters_json() -> String {
    let seed_length_error = Codex32Record::seed_length_error();
    format!(
        r#"{{"seedBytes":{SEED_BYTES:?},"shareIndices":"{SHARE_INDICES}","minThreshold":{MIN_THRESHOLD},"maxThreshold":{MAX_THRESHOLD},"seedLengthError":"{seed_length_error}"}}"#
    )
}

#[wasm_bindgen]
pub fn encode_codex32_seed(
    mut seed: Vec<u8>,
    threshold: u8,
    identifier: &str,
    share_index: &str,
) -> Result<String, JsValue> {
    let encoded = Codex32Record::from_seed(&seed, usize::from(threshold), identifier, share_index)
        .map(|value| value.text())
        .map_err(message);
    seed.zeroize();
    encoded
}

#[wasm_bindgen]
pub fn interpolate_codex32(shares_text: &str, target_index: &str) -> Result<String, JsValue> {
    Codex32Record::interpolate(shares_text, target_index)
        .map(|value| value.text())
        .map_err(message)
}

#[wasm_bindgen]
pub fn decode_codex32_seed(value: &str) -> Result<Vec<u8>, JsValue> {
    Codex32Record::read(value)
        .map(|value| value.data())
        .map_err(message)
}

#[wasm_bindgen]
pub fn encode_codex32_random_share(
    mut random: Vec<u8>,
    threshold: u8,
    identifier: &str,
    share_index: &str,
    padding: u8,
) -> Result<String, JsValue> {
    let encoded = Codex32Record::random_share(
        &random,
        usize::from(threshold),
        identifier,
        share_index,
        padding,
    )
    .map(|value| value.text())
    .map_err(message);
    random.zeroize();
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_bip93_vector_two() {
        let shares = concat!(
            "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM\n",
            "MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN"
        );
        assert_eq!(
            interpolate_codex32(shares, "s").unwrap(),
            "MS12NAMES6XQGUZTTXKEQNJSJZV4JV3NZ5K3KWGSPHUH6EVW"
        );
    }

    #[test]
    fn round_trip_sixty_four_byte_seed() {
        let seed: Vec<u8> = (0..64).map(|index| index as u8).collect();
        let master = encode_codex32_seed(seed.clone(), 2, "test", "s").unwrap();
        assert_eq!(decode_codex32_seed(&master).unwrap(), seed);
    }
}
