// Hedera's message signing: HIP-820's hedera_signMessage, in two parts, one per key type of the
// Deriver's rows. An Ed25519 row's address is its key's alias 0.0.<DER public key>, which holds the
// key; an ECDSA row's is its key's EVM address, so its signature is verified against the row's
// compressed public key. Both return the SignatureMap that HashPack and the other WalletConnect
// wallets return, and sign ASCII text only (decision D5).
import { hex } from "@scure/base";
import { ed25519HexSeed, secp256k1HexKey } from "@ckd/core/derived-private-key.js";
import { hexAddressesEqual } from "../registry-base.js";
import { evmAddressOfKey } from "../keccak-account.js";
import { ed25519CoinSigning } from "../message-signing-ed25519.js";
import { secp256k1CoinSigning } from "../message-signing-secp256k1.js";
import { hederaAliasKey, hederaEd25519Alias } from "./account.js";
import { hip820Bytes, hip820Digest } from "./message-signing-hip820.js";
import { readSignatureMap, writeSignatureMap } from "./message-signing-signature-map.js";
import { HEDERA_ECDSA_PROFILES, HEDERA_ED25519_PROFILES } from "./profiles.js";

/** Hedera's two formats: HIP-820 for the Ed25519 rows and for the ECDSA rows. */
export const HEDERA_MESSAGE_SIGNING = Object.freeze([
  ed25519CoinSigning({
    key: ed25519HexSeed("privateKeyHex"),
    adapters: HEDERA_ED25519_PROFILES.map((profile) => profile.adapterId),
    formats: {
      "hedera-hip820-ed25519": {
        name: "HIP-820 hedera_signMessage (Ed25519)",
        signedBytes: (request) => hip820Bytes(request.message),
        write: (signature, _request, publicKey) =>
          writeSignatureMap("ed25519", publicKey, signature),
        read: (text) => readSignatureMap("ed25519", text),
      },
    },
    publicKeyOf: (request) => {
      const key = hederaAliasKey(request.address);
      return key === null ? undefined : hex.decode(key);
    },
    owns: (publicKey, address) => hederaEd25519Alias(publicKey) === address,
  }),
  secp256k1CoinSigning({
    key: secp256k1HexKey("privateKey"),
    adapters: HEDERA_ECDSA_PROFILES.map((profile) => profile.adapterId),
    formats: {
      "hedera-hip820-ecdsa": {
        name: "HIP-820 hedera_signMessage (ECDSA)",
        signedBytes: (request) => hip820Digest(request.message),
        write: (signature, _request, publicKey) => writeSignatureMap("ecdsa", publicKey, signature),
        read: (text) => readSignatureMap("ecdsa", text),
      },
    },
    owns: (publicKey, address) => hexAddressesEqual(evmAddressOfKey(publicKey), address),
  }),
]);
