//! The page digest, shared by the build script that checks the page and the program that shows it.

use sha2::{Digest, Sha256};
use std::fmt::Write;

/// SHA-256 as 64 lowercase hex digits, the form of the .sha256 files next to the page.
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}
