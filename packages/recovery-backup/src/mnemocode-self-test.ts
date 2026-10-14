// MnemoCode's self-test as the Deriver runs it on the person's button press, never at start (the
// owner's rule): the library's checks (core/self-test.ts) with the public vectors bundled here,
// the master fingerprint from WebCrypto, and the checks that the parts of this build add: the
// shares their SSKR library, the card export its renderers. Each part adds its checks when it is
// installed, so that a build without it neither runs nor names them.
import type { SharePlatform } from "../../recovery-mnemocode/source/sskr/share-platform.js";
import {
  MasterFingerprintCheck,
  type Pbkdf2HmacSha512,
} from "../../recovery-mnemocode/source/core/master-fingerprint.js";
import {
  MnemoCodeSelfTest,
  type SelfTestCheck,
  type SelfTestFeature,
  type SelfTestReport,
} from "../../recovery-mnemocode/source/core/self-test.js";
import publicVectors from "../../recovery-mnemocode/source/vectors/mnemocode-v1.json";

export type { SelfTestCheck, SelfTestReport };

export class MnemoCodeSelfTestRun {
  readonly #pbkdf2: Pbkdf2HmacSha512;
  readonly #fingerprints: MasterFingerprintCheck;
  #shares: { readonly platform: SharePlatform; readonly library: string } | undefined;
  readonly #features: SelfTestFeature[] = [];
  readonly #after: SelfTestCheck[] = [];

  constructor(pbkdf2: Pbkdf2HmacSha512) {
    this.#pbkdf2 = pbkdf2;
    this.#fingerprints = new MasterFingerprintCheck(pbkdf2);
  }

  /** The checks of a feature of this build, such as its wallet recognition or the heir sheet. */
  addFeature(feature: SelfTestFeature): void {
    if (!this.#features.includes(feature)) this.#features.push(feature);
  }

  /** The SSKR library of the build, for the share rows; `library` names it in the report. */
  addShares(platform: SharePlatform, library: string): void {
    this.#shares = { platform, library };
  }

  /** A check of the build's own, run after the library's. */
  addCheck(check: SelfTestCheck): void {
    this.#after.push(check);
  }

  /** Runs every check; throws at the first that fails. */
  run(): Promise<SelfTestReport> {
    return new MnemoCodeSelfTest({
      fingerprint: (mnemonic) => this.#fingerprints.fingerprintAsync(mnemonic),
      publicVectors,
      // The BIP39 seed vectors run in full with the page's own PBKDF2.
      pbkdf2: this.#pbkdf2,
      features: [...this.#features],
      ...(this.#shares === undefined
        ? {}
        : { sharePlatform: this.#shares.platform, shareLibrary: this.#shares.library }),
      after: [...this.#after],
    }).run();
  }
}
