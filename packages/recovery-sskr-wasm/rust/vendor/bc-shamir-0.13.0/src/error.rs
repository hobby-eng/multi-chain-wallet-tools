use thiserror::Error;

/// Errors returned by the pinned Shamir operations.
#[derive(Debug, Error)]
pub enum Error {
    /// The secret exceeds the supported byte length.
    #[error("secret is too long")]
    SecretTooLong,

    /// The requested member count is unsupported.
    #[error("too many shares")]
    TooManyShares,

    /// The coordinates do not admit interpolation.
    #[error("interpolation failed")]
    InterpolationFailure,

    /// The reconstructed secret fails its digest check.
    #[error("checksum failure")]
    ChecksumFailure,

    /// The secret is shorter than the supported minimum.
    #[error("secret is too short")]
    SecretTooShort,

    /// The secret byte length is not even.
    #[error("secret is not of even length")]
    SecretNotEvenLen,

    /// The threshold does not fit the supplied shares.
    #[error("invalid threshold")]
    InvalidThreshold,

    /// The supplied shares have different byte lengths.
    #[error("shares have unequal length")]
    SharesUnequalLength,
}

/// A result from a Shamir operation.
pub type Result<T> = std::result::Result<T, Error>;
