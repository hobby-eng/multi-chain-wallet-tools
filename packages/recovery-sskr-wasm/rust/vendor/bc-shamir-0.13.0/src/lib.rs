#![doc(html_root_url = "https://docs.rs/bc-shamir/0.13.0")]
#![warn(rust_2018_idioms)]

//! ## Introduction
//!
//! This is a pure-Rust implementation of [Shamir's Secret Sharing
//! (SSS)](https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing) is a
//! cryptographic technique in which a *secret* is divided into parts, called
//! *shares*, in such a way that a *threshold* of several shares are needed to
//! reconstruct the secret. The shares are distributed in a way that makes it
//! impossible for an attacker to know anything about the secret without having
//! a threshold of shares. If the number of shares is less than the threshold,
//! then no information about the secret is revealed.
//!
//! ## Getting Started
//!
//! ```toml
//! [dependencies]
//! bc-shamir = "0.13.0"
//! ```
//!
//! ## Usage
//!
//! ### Splitting a secret
//!
//! ```
//! # use bc_shamir::split_secret;
//! # fn main() {
//! let secret = b"my secret belongs to me.";
//! let threshold = 2;
//! let share_count = 3;
//! let mut random_generator = bc_rand::SecureRandomNumberGenerator;
//!
//! let shares =
//!     split_secret(threshold, share_count, secret, &mut random_generator)
//!         .unwrap();
//!
//! assert_eq!(shares.len(), share_count);
//! # }
//! ```
//!
//! ### Recovering a secret
//!
//! ```
//! # use bc_shamir::recover_secret;
//! # fn main() {
//! let indexes = vec![0, 2];
//! let shares = vec![
//!     vec![
//!         47, 165, 102, 232, 218, 99, 6, 94, 39, 6, 253, 215, 12, 88, 64, 32,
//!         105, 40, 222, 146, 93, 197, 48, 129,
//!     ],
//!     vec![
//!         221, 174, 116, 201, 90, 99, 136, 33, 64, 215, 60, 84, 207, 28, 74,
//!         10, 111, 243, 43, 224, 48, 64, 199, 172,
//!     ],
//! ];
//!
//! let secret = recover_secret(&indexes, &shares).unwrap();
//!
//! assert_eq!(secret, b"my secret belongs to me.");
//! # }
//! ```

/// The minimum length of a secret.
pub const MIN_SECRET_LEN: usize = 16;

/// The maximum length of a secret.
pub const MAX_SECRET_LEN: usize = 32;

/// The maximum number of shares that can be generated from a secret.
pub const MAX_SHARE_COUNT: usize = 16;

mod hazmat;
mod interpolate;

mod error;
pub use error::{Error, Result};

mod recovery_secret;
mod shamir;
pub use shamir::{recover_secret, split_secret};
