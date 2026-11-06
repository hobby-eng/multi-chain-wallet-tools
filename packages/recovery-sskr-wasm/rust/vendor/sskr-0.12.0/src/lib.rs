#![doc(html_root_url = "https://docs.rs/sskr/0.12.0")]
#![warn(rust_2018_idioms)]

//! # Introduction
//!
//! Sharded Secret Key Reconstruction (SSKR) is a protocol for splitting a
//! *secret* into a set of *shares* across one or more *groups*, such that the
//! secret can be reconstructed from any combination of shares totaling or
//! exceeding a *threshold* number of shares within each group and across all
//! groups. SSKR is a generalization of Shamir's Secret Sharing (SSS) that
//! allows for multiple groups and multiple thresholds.
//!
//! # Getting Started
//!
//! ```toml
//! [dependencies]
//! sskr = "0.12.0"
//! ```
//!
//! # Example
//!
//! ```
//! # use sskr::{Secret, GroupSpec, Spec, sskr_generate, sskr_combine};
//! let secret_string = b"my secret belongs to me.";
//! let secret = Secret::new(secret_string).unwrap();
//!
//! // Split the secret into 2 groups, the first requiring 2 of three shares
//! // and the second requiring 3 of 5 shares. A group threshold of 2 is
//! // specified, meaning that a quorum from both groups are necessary to
//! // reconstruct the secret.
//!
//! let group1 = GroupSpec::new(2, 3).unwrap();
//! let group2 = GroupSpec::new(3, 5).unwrap();
//! let spec = Spec::new(2, vec![group1, group2]).unwrap();
//!
//! // The result is a vector of groups, each containing a vector of shares,
//! // each of which is a vector of bytes.
//! let shares: Vec<Vec<Vec<u8>>> = sskr_generate(&spec, &secret).unwrap();
//!
//! assert_eq!(shares.len(), 2);
//! assert_eq!(shares[0].len(), 3);
//! assert_eq!(shares[1].len(), 5);
//!
//! // Now, recover the secret from a quorum of shares from each group.
//!
//! let recovered_shares = vec![
//!     // Two shares from the first group.
//!     shares[0][0].clone(),
//!     shares[0][2].clone(),
//!     // Three shares from the second group.
//!     shares[1][0].clone(),
//!     shares[1][1].clone(),
//!     shares[1][4].clone(),
//! ];
//!
//! let recovered_secret = sskr_combine(&recovered_shares).unwrap();
//! assert_eq!(recovered_secret, secret);
//! ```

/// The minimum length of a secret.
pub const MIN_SECRET_LEN: usize = bc_shamir::MIN_SECRET_LEN;

/// The maximum length of a secret.
pub const MAX_SECRET_LEN: usize = bc_shamir::MAX_SECRET_LEN;

/// The maximum number of shares that can be generated from a secret.
pub const MAX_SHARE_COUNT: usize = bc_shamir::MAX_SHARE_COUNT;

/// The maximum number of groups in a split.
pub const MAX_GROUPS_COUNT: usize = MAX_SHARE_COUNT;

/// The number of bytes used to encode the metadata for a share.
pub const METADATA_SIZE_BYTES: usize = 5;

/// The minimum number of bytes required to encode a share.
pub const MIN_SERIALIZE_SIZE_BYTES: usize = METADATA_SIZE_BYTES + MIN_SECRET_LEN;

mod encoding;
pub use encoding::{sskr_combine, sskr_generate, sskr_generate_using};

mod share;

mod secret;
pub use secret::Secret;

mod spec;
pub use spec::{GroupSpec, Spec};

mod error;
pub use error::{Error, Result};
