import { EthereumAddress } from "@ckd/core/eip55.js";
import { HEDERA_ED25519_PUBLIC_DER } from "@ckd/coins/hedera/profiles.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** The HIP-32 alias of an Ed25519 key: 0.0. and the DER of the public key. */
const ED25519_ALIAS = new RegExp(`^0\\.0\\.${HEDERA_ED25519_PUBLIC_DER}[0-9a-f]{64}$`, "iu");

/**
 * Hedera's part of the matcher: an Ed25519 key's alias, or the EVM address of an ECDSA key, which
 * Ethereum's part reads too. An account number (0.0.N) is not derived from a key.
 */
export const HEDERA_MATCHER = singleKeyMatcher(["hedera", "hedera-ecdsa"], (value) => {
  if (ED25519_ALIAS.test(value)) return { normalized: value.toLowerCase(), adapterIds: ["hedera"] };
  return EthereumAddress.accepts(value)
    ? { normalized: value.toLowerCase(), adapterIds: ["hedera-ecdsa"] }
    : null;
});
