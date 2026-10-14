//! Record admission and encoding; interpolation/checksums remain in rust-codex32.

use codex32::{ChecksumEngine, Codex32String, Fe};

pub const SEED_BYTES: [usize; 6] = [16, 20, 24, 28, 32, 64];
pub const SHARE_INDICES: &str = "acdefghjklmnpqrtuvwxyz023456789";
pub const MIN_THRESHOLD: usize = 2;
pub const MAX_THRESHOLD: usize = 9;
const BITS_PER_BYTE: usize = 8;
const BITS_PER_SYMBOL: usize = 5;
const HEADER_SYMBOLS: usize = 6; // BIP93: threshold, four-character ID, share index.
const HRP: &str = "ms";

pub struct Codex32Record {
    value: Codex32String,
}

impl Codex32Record {
    pub fn read(value: &str) -> Result<Self, String> {
        let value = value.trim();
        if !(value.starts_with("ms1") || value.starts_with("MS1")) {
            return Err("A Codex32 value must use the ms1 human-readable prefix.".into());
        }
        Codex32String::from_string(value.to_owned())
            .map(|value| Self { value })
            .map_err(Self::error)
    }

    pub fn from_seed(seed: &[u8], threshold: usize, id: &str, index: &str) -> Result<Self, String> {
        Self::validate_seed_length(seed.len())?;
        let index = index
            .parse::<Fe>()
            .map_err(|error| format!("Invalid Codex32 share index: {error:?}"))?;
        Codex32String::from_seed(HRP, threshold, id, index, seed)
            .map(|value| Self { value })
            .map_err(Self::error)
    }

    pub fn random_share(
        seed: &[u8],
        threshold: usize,
        id: &str,
        index: &str,
        padding: u8,
    ) -> Result<Self, String> {
        if !(MIN_THRESHOLD..=MAX_THRESHOLD).contains(&threshold)
            || !SHARE_INDICES.contains(index)
            || index.len() != 1
        {
            return Err(
                "A random Codex32 basis requires a supported threshold and non-secret share index."
                    .into(),
            );
        }
        let base = Self::from_seed(seed, threshold, id, index)?;
        let padding_bits =
            (BITS_PER_SYMBOL - seed.len() * BITS_PER_BYTE % BITS_PER_SYMBOL) % BITS_PER_SYMBOL;
        if padding_bits == 0 {
            return Ok(base);
        }
        let mut text = base.text();
        let payload_end =
            HRP.len() + 1 + HEADER_SYMBOLS + (seed.len() * BITS_PER_BYTE).div_ceil(BITS_PER_SYMBOL);
        let last = text.as_bytes()[payload_end - 1] as char;
        let symbol =
            Fe::from_char(last).map_err(|error| format!("Invalid Codex32 payload: {error:?}"))?;
        // Random byte data covers the meaningful bits. Independently random
        // padding covers the remaining GF(32) bits; zero padding here leaks
        // secret bits after pointwise interpolation (AUD-028-SEC003).
        let mask = (1u8 << padding_bits) - 1;
        let replacement = Fe::from_u8(symbol.to_u8() | (padding & mask))
            .map_err(|error| format!("Invalid Codex32 padding: {error:?}"))?;
        text.replace_range(
            payload_end - 1..payload_end,
            &replacement.to_char().to_string(),
        );
        text.truncate(payload_end);
        // Ask the reference encoder which checksum it selected, rather than
        // repeating its seed-length boundary in the wrapper.
        let short_length = ChecksumEngine::new_codex32_short().into_residue().len();
        let mut checksum = if base.text().len() - payload_end == short_length {
            ChecksumEngine::new_codex32_short()
        } else {
            ChecksumEngine::new_codex32_long()
        };
        checksum.input_hrp(HRP).map_err(Self::error)?;
        checksum
            .input_data_str(&text[HRP.len() + 1..])
            .map_err(Self::error)?;
        checksum.input_own_target();
        text.extend(checksum.into_residue().into_iter().map(Fe::to_char));
        Self::read(&text)
    }

    pub fn interpolate(values: &str, index: &str) -> Result<Self, String> {
        let records = values
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(Self::read)
            .collect::<Result<Vec<_>, _>>()?;
        // Admit each original case/checksum before folding. Presentation case
        // is per record, while compatible HRP/ID values are semantic equality.
        let uppercase = records
            .first()
            .is_some_and(|record| record.text().starts_with("MS1"));
        let normalized = records
            .iter()
            .map(|record| {
                let text = record.text();
                Self::read(&if uppercase {
                    text.to_ascii_uppercase()
                } else {
                    text.to_ascii_lowercase()
                })
                .map(|record| record.value)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let index = index
            .parse::<Fe>()
            .map_err(|error| format!("Invalid Codex32 share index: {error:?}"))?;
        Codex32String::interpolate_at(&normalized, index)
            .map(|value| Self { value })
            .map_err(Self::error)
    }

    pub fn data(&self) -> Vec<u8> {
        self.value.parts().data()
    }

    pub fn text(&self) -> String {
        self.value.to_string()
    }

    pub fn validate_seed_length(length: usize) -> Result<(), String> {
        if SEED_BYTES.contains(&length) {
            Ok(())
        } else {
            Err(Self::seed_length_error())
        }
    }

    pub fn seed_length_error() -> String {
        let preceding = SEED_BYTES[..SEED_BYTES.len() - 1]
            .iter()
            .map(usize::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "Codex32 supports {preceding}, or {} bytes of secret data.",
            SEED_BYTES[SEED_BYTES.len() - 1]
        )
    }

    fn error(error: codex32::Error) -> String {
        // The dependency's Debug for this variant includes the secret record.
        match error {
            codex32::Error::InvalidChecksum { .. } => "InvalidChecksum".into(),
            error => format!("{error:?}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn original_case_is_checked_before_normalization() {
        let upper = "MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM";
        let lower = "MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN".to_ascii_lowercase();
        let restored = Codex32Record::interpolate(&format!("{upper}\n{lower}"), "s").unwrap();
        assert_eq!(
            restored.text(),
            "MS12NAMES6XQGUZTTXKEQNJSJZV4JV3NZ5K3KWGSPHUH6EVW"
        );
        assert!(Codex32Record::read(&format!("ms{}", &upper[2..])).is_err());
    }

    #[test]
    fn random_basis_covers_every_final_symbol() {
        for length in SEED_BYTES {
            let bits =
                (BITS_PER_SYMBOL - length * BITS_PER_BYTE % BITS_PER_SYMBOL) % BITS_PER_SYMBOL;
            if bits == 0 {
                continue;
            }
            let mut symbols = BTreeSet::new();
            let remaining = BITS_PER_SYMBOL - bits;
            for tail in 0..(1 << remaining) {
                let mut seed = vec![0; length];
                seed[length - 1] = tail;
                for padding in 0..(1 << bits) {
                    let record =
                        Codex32Record::random_share(&seed, 2, "test", "a", padding).unwrap();
                    let end = HRP.len()
                        + 1
                        + HEADER_SYMBOLS
                        + (length * BITS_PER_BYTE).div_ceil(BITS_PER_SYMBOL);
                    symbols.insert(record.text().as_bytes()[end - 1]);
                }
            }
            assert_eq!(symbols.len(), 1 << BITS_PER_SYMBOL);
        }
    }
}
