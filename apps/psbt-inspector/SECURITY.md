# PSBT & Multisig Inspector security boundary

The standalone artifact has no network, storage, frames, external assets, dynamic JavaScript evaluation, or broadcast capability. The Multi-Chain artifact embeds the pinned `btcutil-js` WebAssembly module used for BIP-322 verification and permits only WebAssembly compilation in its script CSP; the Dash Community artifact excludes that module. It parses untrusted PSBT bytes with bounded collection sizes and rejects duplicate keys, non-minimal CompactSize integers, unsupported versions, trailing data, and chain/version combinations it does not support.

The policy and wallet builders accept public keys, not private keys. The descriptor decoder and ranged wallet builder accept public extended keys and never persist or transmit them; xpubs still reveal wallet structure and address history and should be handled as privacy-sensitive data. Generated scripts, descriptors, imports and addresses must be tested with valueless testnet funds and independently verified before use. Arbitrary scripts can create permanently unspendable outputs, and wallet/hardware support for multisig, descriptors, Miniscript and timelocks varies.

The BIP38 decryptor is an explicit local secret-handling boundary. It accepts up to 200 encrypted private keys with one shared password, derives each standard BIP38 key sequentially with `scrypt`, verifies every address hash for the selected Bitcoin/Dash network, and masks recovered WIF/hex output until Reveal is pressed. Clear invalidates the active batch and removes input and output DOM values; hiding or unfocusing the page masks them again. JavaScript strings cannot be reliably wiped, so close the offline page after sweeping recovered keys and clear any clipboard contents.

Dash multisig address tests include Dash Core dev-branch BIP67 `sh(sortedmulti(...))` P2SH vectors. The reviewed Dash descriptor scope remains the standard Dash Core L1 descriptor set (`pk`, `pkh`, `sh`, `multi`, `sortedmulti`, `addr`, `raw`, `combo`); no additional Dash P2PKH/P2SH address family was found in the checked dev-branch documentation.

Message verification consumes only a claimed address, exact message, and public signature. It never requests a private key. Bitcoin BIP-322 verification delegates consensus Script evaluation to the embedded btcd-derived engine; Dash compact-message verification recovers a public key and compares its P2PKH address. A successful message proof establishes control of the relevant spending condition for that exact message, not identity, authorization for another action, or transaction validity.


## September 2026 local audit corrections

Custom Tapscript compilation now validates literal x-only curve points before
using compiler safety labels. Inspector verification results are bound to an
input revision and discarded after edits or Clear. Descriptor expansion checks
context, arity, origins and multipath bounds before constructing output scripts.
PSBT known-field schemas, UTXO outpoint binding, nonce point shapes and partial
scalar ranges are validated; structural decoding is not a signature check or a
proof of blockchain inclusion. See `../../docs/audits/2026-09-12-02-remediation-audit.md`
for the tested snapshot and remaining boundaries.
