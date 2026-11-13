// MnemoCode's self-test as the Deriver runs it on the person's button press, never at start:
// every case of each part of MnemoCode's WebAssembly that this build uses
// (selfCheck* with `full`), the shares' and the cards' only where the build offers them, then the
// checks that parts of the page add. It throws at the first difference.
import { mnemocode, type MnemoCodeBinding } from "./mnemocode-engine.js";

/** One row of the report. */
export interface SelfTestRow {
  readonly name: string;
  readonly detail: string;
  readonly milliseconds: number;
}

export interface SelfTestReport {
  readonly rows: readonly SelfTestRow[];
  readonly milliseconds: number;
}

/** A check of the page's own, run after MnemoCode's. */
export interface SelfTestCheck {
  readonly name: string;
  readonly detail: string;
  run(): void | Promise<void>;
}

type Part =
  | "phrase"
  | "wallet"
  | "qr"
  | "candidates"
  | "sskr"
  | "recovery"
  | "cards"
  | "embroidery"
  | "stego";

const PARTS: Readonly<
  Record<
    Part,
    { readonly name: string; readonly detail: string; readonly check: keyof MnemoCodeBinding }
  >
> = {
  phrase: { name: "Phrase", detail: "forms, modes, records and backups", check: "selfCheckPhrase" },
  wallet: {
    name: "Wallet",
    detail: "fingerprints, keys and coin addresses",
    check: "selfCheckWallet",
  },
  qr: { name: "QR codes", detail: "QR symbols and PNG images", check: "selfCheckQr" },
  candidates: {
    name: "Candidate lists",
    detail: "MNCL, age and scrypt",
    check: "selfCheckCandidates",
  },
  sskr: {
    name: "Shamir shares",
    detail: "SSKR split, restore and share forms",
    check: "selfCheckSskr",
  },
  recovery: {
    name: "Recovery",
    detail: "decoding, backup checks and searches",
    check: "selfCheckRecovery",
  },
  cards: {
    name: "Cards",
    detail: "card sets, share cards and the heir sheet",
    check: "selfCheckCards",
  },
  embroidery: {
    name: "Cross-stitch patterns",
    detail: "SeedStitch legends, misread rows and a pattern",
    check: "selfCheckEmbroidery",
  },
  stego: {
    name: "Photos and MP3 files",
    detail: "hidden records, decoys, sets and the full Argon2id reference",
    check: "stegoSelfCheck",
  },
};

export class MnemoCodeSelfTestRun {
  readonly #parts = new Set<Part>([
    "phrase",
    "wallet",
    "qr",
    "candidates",
    "recovery",
    "embroidery",
    "stego",
  ]);
  readonly #after: SelfTestCheck[] = [];

  /** The shares of this build: their known answers join the run. */
  addShares(): void {
    this.#parts.add("sskr");
  }

  /** The card export of this build: its known answers join the run. */
  addCards(): void {
    this.#parts.add("cards");
  }

  /** A check of the build's own, run after MnemoCode's. */
  addCheck(check: SelfTestCheck): void {
    this.#after.push(check);
  }

  /** Runs every check; throws at the first that fails. */
  async run(): Promise<SelfTestReport> {
    const started = performance.now();
    const binding = mnemocode();
    const rows: SelfTestRow[] = [];
    for (const part of Object.keys(PARTS) as Part[]) {
      if (!this.#parts.has(part)) continue;
      const { name, detail, check } = PARTS[part];
      const begun = performance.now();
      (binding[check] as (full: boolean) => void)(true);
      rows.push({ name, detail, milliseconds: performance.now() - begun });
      // Each part's full cases take a while: the page is given a turn between them.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (const check of this.#after) {
      const begun = performance.now();
      await check.run();
      rows.push({
        name: check.name,
        detail: check.detail,
        milliseconds: performance.now() - begun,
      });
    }
    return { rows, milliseconds: performance.now() - started };
  }
}
