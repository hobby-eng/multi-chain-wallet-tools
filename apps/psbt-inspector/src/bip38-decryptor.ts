import { decryptBip38 } from "@ckd/core/bip38.js";
import { bytesToHex, concatBytes, encodeBase58Check, wipe } from "@ckd/core/crypto.js";
import { InspectorNetworkProfile } from "./network-profile.js";
import type { PsbtChain, PsbtNetwork } from "./psbt-types.js";
import { Bip38Input, Bip38InputError } from "./bip38-input.js";

/** A recovered key for explicit local presentation; immutable strings cannot be erased by JavaScript. */
export interface Bip38Decryption {
  readonly address: string;
  readonly privateKeyHex: string;
  readonly wif: string;
  readonly compressed: boolean;
}

/** Admits one request and delegates its cryptography; mutable private bytes are wiped before return. */
export class Bip38KeyRecovery {
  decrypt(
    encryptedKey: string,
    passphrase: string,
    chain: PsbtChain,
    networkName: PsbtNetwork,
  ): Promise<Bip38Decryption> {
    const key = Bip38Input.key(encryptedKey);
    const password = Bip38Input.password(passphrase);
    const coin = Bip38Input.chain(chain);
    const selectedNetwork = Bip38Input.network(coin, networkName);
    const network = new InspectorNetworkProfile(coin, selectedNetwork).keyNetwork;
    // This synchronous adapter frame ends after passing temporary text to the cryptographic API.
    return decryptBip38(key, password, network)
      .then((decrypted) => this.#format(decrypted, network.wif))
      .catch((cause: unknown) => {
        throw new Bip38InputError("failed", { cause });
      });
  }

  #format(
    decrypted: Awaited<ReturnType<typeof decryptBip38>>,
    wifVersion: number,
  ): Bip38Decryption {
    try {
      const payload = decrypted.compressed
        ? concatBytes(Uint8Array.of(wifVersion), decrypted.privateKey, Uint8Array.of(1))
        : concatBytes(Uint8Array.of(wifVersion), decrypted.privateKey);
      try {
        return {
          address: decrypted.address,
          privateKeyHex: bytesToHex(decrypted.privateKey),
          wif: encodeBase58Check(payload),
          compressed: decrypted.compressed,
        };
      } finally {
        wipe(payload);
      }
    } finally {
      wipe(decrypted.privateKey);
    }
  }
}

/** Compatibility entry point for the Inspector's single-key recovery API. */
export function decryptBip38Key(
  encryptedKey: string,
  passphrase: string,
  chain: PsbtChain,
  networkName: PsbtNetwork,
): Promise<Bip38Decryption> {
  try {
    return new Bip38KeyRecovery().decrypt(encryptedKey, passphrase, chain, networkName);
  } catch (cause) {
    return Promise.reject(cause);
  }
}
