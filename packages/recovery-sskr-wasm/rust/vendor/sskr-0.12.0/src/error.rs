use thiserror::Error;

/// Errors that can occur when using the SSKR library.
#[derive(Debug, Error)]
pub enum Error {
    /// A serialized share repeats a member index.
    #[error("When combining shares, the provided shares contained a duplicate member index")]
    DuplicateMemberIndex,

    /// A group specification does not have the expected syntax.
    #[error("Invalid group specification.")]
    GroupSpecInvalid,

    /// The number of groups is unsupported.
    #[error("When creating a split spec, the group count is invalid")]
    GroupCountInvalid,

    /// A serialized share names a group outside its declared group count.
    #[error("SSKR group index is invalid")]
    GroupIndexInvalid,

    /// The group threshold is unsupported.
    #[error("SSKR group threshold is invalid")]
    GroupThresholdInvalid,

    /// The number of members is unsupported.
    #[error("SSKR member count is invalid")]
    MemberCountInvalid,

    /// The member threshold is unsupported.
    #[error("SSKR member threshold is invalid")]
    MemberThresholdInvalid,

    /// The supplied groups do not meet the quorum.
    #[error("SSKR shares did not contain enough groups")]
    NotEnoughGroups,

    /// The secret length is not even.
    #[error("SSKR secret is not of even length")]
    SecretLengthNotEven,

    /// The secret exceeds the supported length.
    #[error("SSKR secret is too long")]
    SecretTooLong,

    /// The secret is below the supported length.
    #[error("SSKR secret is too short")]
    SecretTooShort,

    /// A serialized share is too short.
    #[error("SSKR shares did not contain enough serialized bytes")]
    ShareLengthInvalid,

    /// A serialized share has nonzero reserved bits.
    #[error("SSKR shares contained invalid reserved bits")]
    ShareReservedBitsInvalid,

    /// No serialized shares were supplied.
    #[error("SSKR shares were empty")]
    SharesEmpty,

    /// The serialized shares do not belong to one set.
    #[error("SSKR shares were invalid")]
    ShareSetInvalid,

    /// The pinned Shamir implementation refused the operation.
    #[error("SSKR Shamir error: {0}")]
    ShamirError(#[from] bc_shamir::Error),
}

/// The result of an SSKR operation.
pub type Result<T> = std::result::Result<T, Error>;
