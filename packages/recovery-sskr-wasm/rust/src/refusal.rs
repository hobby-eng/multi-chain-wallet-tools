use std::fmt;
use wasm_bindgen::prelude::*;

/// Owned bridge failures; decode refusals never retain upstream input or diagnostics.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    /// The encoding code is not supported.
    Encoding,
    /// Group specifications are not threshold/count pairs.
    GroupPairs,
    /// Upstream group validation refused the parameters.
    Group(String),
    /// Upstream validation refused the group quorum.
    Specification(String),
    /// The secret has an unsupported length.
    Secret(String),
    /// The randomness seed has the wrong length.
    Randomness,
    /// A share's transport or CBOR is invalid.
    Decode,
    /// Upstream splitting failed.
    Generate(String),
    /// Upstream reconstruction failed.
    Combine(String),
    /// No share was supplied.
    NoShares,
}

impl Refusal {
    /// The stable code of this refusal, independent of its message and upstream detail.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Encoding => "sskr.engine.unsupported-encoding",
            Self::GroupPairs => "sskr.engine.group-pairs",
            Self::Group(_) => "sskr.engine.group",
            Self::Specification(_) => "sskr.engine.specification",
            Self::Secret(_) => "sskr.engine.secret",
            Self::Randomness => "sskr.engine.randomness",
            Self::Decode => "sskr.engine.decode",
            Self::Generate(_) => "sskr.engine.generate",
            Self::Combine(_) => "sskr.engine.combine",
            Self::NoShares => "sskr.engine.no-shares",
        }
    }

    pub(crate) fn thrown(self) -> JsValue {
        let error = HostError::new(&self.to_string());
        error.set_code(self.code());
        error.into()
    }
}

impl fmt::Display for Refusal {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Encoding => formatter.write_str(crate::UNSUPPORTED_ENCODING),
            Self::GroupPairs => {
                formatter.write_str("SSKR groups must contain threshold/count pairs.")
            }
            Self::Randomness => write!(
                formatter,
                "SSKR requires exactly {} bytes of fresh randomness.",
                std::mem::size_of::<crate::Seed>()
            ),
            Self::NoShares => formatter.write_str(crate::NO_SHARES),
            Self::Decode => formatter.write_str("The SSKR share could not be decoded."),
            Self::Group(text)
            | Self::Specification(text)
            | Self::Secret(text)
            | Self::Generate(text)
            | Self::Combine(text) => formatter.write_str(text),
        }
    }
}

impl std::error::Error for Refusal {}

// Bind the standard JavaScript Error directly; no added runtime dependency is needed.
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = Error)]
    type HostError;

    #[wasm_bindgen(constructor, js_class = Error)]
    fn new(message: &str) -> HostError;

    #[wasm_bindgen(method, setter, js_name = code)]
    fn set_code(this: &HostError, code: &str);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;

    #[test]
    fn preserves_messages_and_distinguishes_owned_codes() {
        assert_eq!(Refusal::Encoding.to_string(), crate::UNSUPPORTED_ENCODING);
        assert_eq!(Refusal::NoShares.to_string(), crate::NO_SHARES);
        assert_eq!(Refusal::Randomness.code(), "sskr.engine.randomness");
        assert_eq!(Refusal::Group("test".into()).to_string(), "test");
        assert_ne!(
            Refusal::GroupPairs.code(),
            Refusal::Specification("test".into()).code()
        );
    }

    #[test]
    fn decode_has_only_a_stable_safe_message_code_and_debug_value() {
        let refusal = Refusal::Decode;
        assert_eq!(refusal.code(), "sskr.engine.decode");
        assert_eq!(refusal.to_string(), "The SSKR share could not be decoded.");
        assert_eq!(format!("{refusal:?}"), "Decode");
        assert!(refusal.source().is_none());
    }
}
