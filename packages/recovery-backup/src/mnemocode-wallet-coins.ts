// The wallet recognition of a build without Bitcoin, such as the Dash Community Edition: the BIP32
// master fingerprint (core/master-fingerprint.ts) or an address of one of the coins the build
// offers (core/coin-address-evidence.ts with those coins' own modules, mnemocode-offered-coins.ts),
// and the fingerprint alone in a build that offers none. No other coin's code reaches it. The build
// puts this module in place of mnemocode-wallet-bitcoin.ts, with the same class (see
// mnemocode-wallet.ts).
import {
  CoinAddressCheck,
  CoinAddressComparison,
  type CoinAddressEvidence,
} from "../../recovery-mnemocode/source/core/coin-address-evidence.js";
import {
  MasterFingerprintCheck,
  parseMasterFingerprint,
  type Pbkdf2HmacSha512,
} from "../../recovery-mnemocode/source/core/master-fingerprint.js";
import type { WalletCheck } from "../../recovery-mnemocode/source/core/wallet-check.js";
import { OFFERED_COIN_CHECKS, OFFERED_COINS } from "./mnemocode-offered-coins.js";
import type {
  CoinDescription,
  SelfTestFeature,
  WalletEvidence,
  WalletEvidenceRequest,
  WalletRecognition,
} from "./mnemocode-wallet.js";

/** The evidence of an address of an offered coin, as MnemoCode's coin check takes it. */
function coinAddress(evidence: WalletEvidence): CoinAddressEvidence {
  const coin =
    evidence.kind === "coin-address"
      ? OFFERED_COINS.find((offered) => offered.id === evidence.coin)
      : undefined;
  if (evidence.kind !== "coin-address" || coin === undefined)
    throw new Error(
      OFFERED_COINS.length === 0
        ? "This edition recognises a wallet by its master fingerprint only."
        : `This edition recognises a wallet by its fingerprint or an address of ${OFFERED_COINS.map((offered) => offered.name).join(" or ")}.`,
    );
  return {
    coin,
    value: evidence.value,
    location: evidence.location,
    ...(evidence.addresses === undefined ? {} : { addresses: evidence.addresses }),
  };
}

export class MnemoCodeWalletRecognition implements WalletRecognition {
  static readonly PROFILES: readonly string[] = [];
  /** The coins whose addresses this build compares. */
  static readonly COINS: readonly CoinDescription[] = OFFERED_COINS;
  static readonly SELF_TESTS: readonly SelfTestFeature[] = OFFERED_COIN_CHECKS;

  /**
   * Refuses, before a search starts, what MnemoCode would refuse: anything but a master
   * fingerprint or an address of an offered coin, a count of addresses beside a fingerprint, and
   * an address, place or count that no wallet can have (MnemoCode's CoinAddressComparison).
   */
  static assertEvidence(evidence: WalletEvidence): void {
    if (evidence.kind === "master-fingerprint") {
      if ((evidence as { addresses?: unknown }).addresses !== undefined)
        throw new Error(
          "Only an address, a compressed public key or a WIF is compared with several addresses.",
        );
      parseMasterFingerprint(evidence.value);
      return;
    }
    new CoinAddressComparison(coinAddress(evidence));
  }

  readonly #fingerprints: MasterFingerprintCheck;
  readonly #addresses: CoinAddressCheck;

  constructor(pbkdf2: Pbkdf2HmacSha512) {
    this.#fingerprints = new MasterFingerprintCheck(pbkdf2);
    this.#addresses = new CoinAddressCheck(pbkdf2);
  }

  checkFor(request: WalletEvidenceRequest): WalletCheck {
    MnemoCodeWalletRecognition.assertEvidence(request.evidence);
    const { evidence, passphrase } = request;
    if (evidence.kind === "coin-address") {
      const address = coinAddress(evidence);
      return async (mnemonic) => {
        const match = await this.#addresses.matchAsync(mnemonic, address, passphrase);
        return {
          matched: match.matched,
          ...(match.path === undefined ? {} : { path: match.path }),
        };
      };
    }
    const expected = evidence.value;
    return (mnemonic) => this.#fingerprints.matchAsync(mnemonic, expected, passphrase);
  }
}
