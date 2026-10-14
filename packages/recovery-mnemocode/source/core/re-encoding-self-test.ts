// The self-test of re-encoding (re-encoding.ts): the public phrase masked with MnemoCode Seedshift
// and 23-09-2026 decoded and given out only once confirmed, by the person or by a wallet that
// matches; a wrong date, which MnemoCode Seedshift turns into another valid phrase that only the
// wallet tells apart; the Original Seedshift's wrong date refused by its checksum, and its backup
// with a valid last word told by the original last word; and the confirmed phrase encoded again
// without Seedshift as Unicode codes. A host that offers
// re-encoding adds it to its self-test (SelfTestHost.features).
//
// The masked codes are those of vectors/mnemocode-v1.json (checksum-valid-seedshift-12), as
// backup-reading-self-test.ts reads them; the Original Seedshift's codes are the record of the
// original program in the help of decode. The Unicode codes come from the published BIP39
// Chinese list (bitcoin/bips bip-0039/chinese_simplified.txt): word 1, abandon, is 的 (U+7684),
// word 4, about, is 在 (U+5728). Public test data only.
//
// Host-neutral: it imports only other core modules.

import { EncodedBackup } from "./encoded-backup.js";
import { parseDate } from "./dates.js";
import { CHECKSUM_FAILS, LAST_WORD_NEEDED, NOT_CONFIRMED, ReEncoding } from "./re-encoding.js";
import {
  expectRefused,
  expectSame,
  selfTestFeature,
  type SelfTestFeature,
} from "./self-test-check.js";
import { FINGERPRINT_WARNING, fingerprintMatch, type WalletCheck } from "./wallet-check.js";

const PUBLIC_PHRASE = `${"abandon ".repeat(11)}about`;
/** The public phrase masked with MnemoCode Seedshift and 23-09-2026, as word numbers. */
const MASKED_NUMBERS = "2027 10 24 2027 10 24 2027 10 24 2027 10 377";
/** The public phrase masked with the Original Seedshift and 23-09-2026, as Unicode codes. */
const LEGACY_UNICODE = "8F44901950118F44901950118F44901950118F4490194F5C";
const RIGHT_DATE = parseDate("23-09-2026");
/** A day later: MnemoCode Seedshift still gives a valid phrase, the Original Seedshift does not. */
const WRONG_DATE = parseDate("24-09-2026");
/** The public phrase without Seedshift as Unicode codes, written joined as encode writes them. */
const PUBLIC_UNICODE = `${"7684".repeat(11)}5728`;

/** A wallet that has the public phrase's address, and one that has none of these phrases'. */
const PUBLIC_WALLET: WalletCheck = (mnemonic) => ({
  matched: mnemonic === PUBLIC_PHRASE,
  path: "m/84'/0'/0'/0/0",
});
const OTHER_WALLET: WalletCheck = () => ({ matched: false });
/** The public phrase's master fingerprint (vectors/mnemocode-v1.json, direct-12). */
const PUBLIC_FINGERPRINT = "73c5da0a";
/** A wallet named by its fingerprint, the public phrase's, which comes with FINGERPRINT_WARNING. */
const FINGERPRINT_WALLET: WalletCheck = (mnemonic) =>
  fingerprintMatch(
    mnemonic === PUBLIC_PHRASE ? PUBLIC_FINGERPRINT : "00000000",
    PUBLIC_FINGERPRINT,
  );

function maskedBackup(): EncodedBackup {
  return EncodedBackup.read(MASKED_NUMBERS, "indexes", "seedshift");
}

const NOT_CONFIRMED_REFUSAL = new RegExp(NOT_CONFIRMED.slice(0, 40), "u");

/**
 * The quick known answers: the phrase held back until the person confirms it, then encoded again; a
 * wrong date's valid phrase; and a failing checksum refused.
 */
function checkReEncodingStartup(): void {
  const reEncoding = ReEncoding.of(maskedBackup(), [RIGHT_DATE]);
  expectSame(reEncoding.phrase, PUBLIC_PHRASE, "Re-encoded phrase");
  expectRefused(
    () => reEncoding.confirmedPhrase(),
    NOT_CONFIRMED_REFUSAL,
    "Phrase before confirmation",
  );
  reEncoding.confirmByPerson();
  expectSame(
    Reflect.set(reEncoding.result, "recoveredMnemonic", "changed public test phrase"),
    false,
    "Immutable confirmed phrase",
  );
  expectSame(reEncoding.confirmation?.by, "person", "Confirmation by the person");
  const encoded = EncodedBackup.encode(reEncoding.confirmedPhrase(), [], "unicode", "direct");
  expectSame(encoded.backup.text(), PUBLIC_UNICODE, "Phrase encoded again");
  // Every date gives MnemoCode Seedshift a valid phrase, which the checksum cannot tell apart.
  expectSame(
    ReEncoding.of(maskedBackup(), [WRONG_DATE]).phrase === PUBLIC_PHRASE,
    false,
    "Phrase of a wrong date",
  );
  const legacy = EncodedBackup.read(LEGACY_UNICODE, "unicode", "seedshift-legacy");
  expectSame(ReEncoding.of(legacy, [RIGHT_DATE]).phrase, PUBLIC_PHRASE, "Original Seedshift");
  expectRefused(
    () => ReEncoding.of(legacy, [WRONG_DATE]),
    new RegExp(CHECKSUM_FAILS.slice(0, 40), "u"),
    "Original Seedshift with a wrong date",
  );
  // Made with a valid last word, it gives a phrase for each possible last word: the original one,
  // which the person remembers, picks it.
  const several = EncodedBackup.encode(PUBLIC_PHRASE, [RIGHT_DATE], "indexes", "seedshift-legacy", {
    validLastWord: true,
  }).backup;
  expectRefused(
    () => ReEncoding.of(several, [RIGHT_DATE]),
    new RegExp(LAST_WORD_NEEDED.slice(0, 40), "u"),
    "Valid last word without the original one",
  );
  expectSame(ReEncoding.of(several, [RIGHT_DATE], "about").phrase, PUBLIC_PHRASE, "Last word");
}

/**
 * Every check: the quick ones, then the wallet's, which a host may answer later: a wallet that does
 * not match confirms nothing, the right one confirms the phrase, and only it tells a wrong date; a
 * fingerprint's match keeps the warning that it is only a filter, an address's has none.
 */
async function checkReEncoding(): Promise<void> {
  checkReEncodingStartup();
  const reEncoding = ReEncoding.of(maskedBackup(), [RIGHT_DATE]);
  expectSame((await reEncoding.confirmByWallet(OTHER_WALLET)).matched, false, "Other wallet");
  expectRefused(
    () => reEncoding.confirmedPhrase(),
    NOT_CONFIRMED_REFUSAL,
    "Phrase of another wallet",
  );
  expectSame((await reEncoding.confirmByWallet(PUBLIC_WALLET)).matched, true, "Its wallet");
  expectSame(reEncoding.confirmation?.by, "wallet", "Confirmation by the wallet");
  expectSame(warningOf(reEncoding), undefined, "Warning of an address");
  expectSame(reEncoding.confirmedPhrase(), PUBLIC_PHRASE, "Phrase confirmed by the wallet");
  const byFingerprint = ReEncoding.of(maskedBackup(), [RIGHT_DATE]);
  const match = await byFingerprint.confirmByWallet(FINGERPRINT_WALLET);
  expectSame(match.matched && match.warning, FINGERPRINT_WARNING, "Fingerprint's warning");
  expectSame(warningOf(byFingerprint), FINGERPRINT_WARNING, "Fingerprint's confirmation");
  const wrong = ReEncoding.of(maskedBackup(), [WRONG_DATE]);
  expectSame((await wrong.confirmByWallet(PUBLIC_WALLET)).matched, false, "Wrong date's wallet");
}

/** The warning that came with a confirmation by the wallet. */
function warningOf(reEncoding: ReEncoding): string | undefined {
  const confirmation = reEncoding.confirmation;
  return confirmation?.by === "wallet" ? confirmation.warning : undefined;
}

/** The checks of re-encoding, for a host that offers it. */
export const RE_ENCODING_SELF_TEST: SelfTestFeature = selfTestFeature({
  name: "Re-encoding",
  detail: "a backup decoded, held back until confirmed, encoded again",
  startup: checkReEncodingStartup,
  run: checkReEncoding,
});
