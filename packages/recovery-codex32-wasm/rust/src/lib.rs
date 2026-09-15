//! Narrow WebAssembly boundary around the pinned `rust-codex32` reference implementation.
//! The host supplies all entropy. This crate validates, checksums, and interpolates only.

use codex32::{Codex32String, Fe};
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

fn parse_index(index: &str) -> Result<Fe, JsValue> {
    index
        .parse::<Fe>()
        .map_err(|error| JsValue::from_str(&format!("Invalid Codex32 share index: {error:?}")))
}

fn parse_codex32(value: &str) -> Result<Codex32String, JsValue> {
    let normalized = value.trim();
    if !(normalized.starts_with("ms1") || normalized.starts_with("MS1")) {
        return Err(JsValue::from_str("A Codex32 value must use the ms1 human-readable prefix."));
    }
    Codex32String::from_string(normalized.to_owned())
        .map_err(|error| JsValue::from_str(&format!("Invalid Codex32 value: {error:?}")))
}

#[wasm_bindgen]
pub fn encode_codex32_seed(
    mut seed: Vec<u8>,
    threshold: u8,
    identifier: &str,
    share_index: &str,
) -> Result<String, JsValue> {
    if !matches!(seed.len(), 16 | 20 | 24 | 28 | 32 | 64) {
        seed.zeroize();
        return Err(JsValue::from_str(
            "Codex32 master seeds must contain 16, 20, 24, 28, 32, or 64 bytes.",
        ));
    }
    let index = match parse_index(share_index) {
        Ok(index) => index,
        Err(error) => {
            seed.zeroize();
            return Err(error);
        }
    };
    let encoded = Codex32String::from_seed("ms", usize::from(threshold), identifier, index, &seed)
        .map(|value| value.to_string())
        .map_err(|error| JsValue::from_str(&format!("Codex32 encoding failed: {error:?}")));
    seed.zeroize();
    encoded
}

#[wasm_bindgen]
pub fn interpolate_codex32(shares_text: &str, target_index: &str) -> Result<String, JsValue> {
    let mut shares = Vec::new();
    for line in shares_text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        shares.push(parse_codex32(line)?);
    }
    let target = parse_index(target_index)?;
    Codex32String::interpolate_at(&shares, target)
        .map(|value| value.to_string())
        .map_err(|error| JsValue::from_str(&format!("Codex32 interpolation failed: {error:?}")))
}

#[wasm_bindgen]
pub fn decode_codex32_seed(value: &str) -> Result<Vec<u8>, JsValue> {
    let parsed = parse_codex32(value)?;
    Ok(parsed.parts().data())
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
