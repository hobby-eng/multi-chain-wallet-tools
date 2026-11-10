/* tslint:disable */
/* eslint-disable */

/**
 * What a written backup was found to be.
 */
export class BackupFinding {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The verdict's line.
     */
    readonly message: string;
    /**
     * What was left out on the way, one line each.
     */
    readonly notes: string[];
    /**
     * The places of the finding, from 1.
     */
    readonly places: Uint32Array;
    /**
     * "restores", "differs", "unreadable" or "unchecked".
     */
    readonly verdict: string;
}

/**
 * One design of this file.
 */
export class CardDesign {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * What it draws.
     */
    readonly description: string;
    /**
     * Whether it draws separate cards as well as sheets.
     */
    readonly drawsSeparateCards: boolean;
    /**
     * Its id, as a page names it.
     */
    readonly id: string;
    /**
     * Its name.
     */
    readonly name: string;
}

/**
 * Drawn documents, each a PDF or images of its pages when a page asks for them.
 */
export class CardDocuments {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The page `page` of the document at `at`, as an image in `format`: png or jpg.
     */
    image(at: number, page: number, format: string): Uint8Array;
    /**
     * The name of the document at `at`.
     */
    name(at: number): string;
    /**
     * How many pages the document at `at` has.
     */
    pageCount(at: number): number;
    /**
     * The document at `at` as a PDF file.
     */
    pdf(at: number): Uint8Array;
    /**
     * How many documents there are.
     */
    readonly count: number;
}

/**
 * The page, the design and the details of the cards of one export, all public; what is left out is
 * invented with the browser's randomness when the cards are planned.
 */
export class CardExport {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The cards of the backup `codes`, written in the form `form` and masked in `mode`, planned
     * once for every file of the export, so that each shows the same cards.
     */
    backup(codes: any, form: any, mode: any): CardPlan;
    /**
     * The cards of the design `template`, on the page `page_size` turned to `orientation`, each
     * the default where it is left out, with a QR code on a sheet where `card_qr` says so. A size
     * or a turn of none is refused here.
     */
    constructor(template: string | null | undefined, page_size: string | null | undefined, orientation: string | null | undefined, card_qr: boolean);
    /**
     * Sample cards of a random phrase of `words` words (0: the default), of this design or of
     * `every` design.
     */
    preview(words: number, every: boolean): CardDocuments;
    /**
     * The `value` of the person's detail `field`: name, role, company, email, phone, website or
     * location.
     */
    setDetail(field: string, value: string): void;
    /**
     * Choose a contact in the sheet QR and the exact backup record in its filler bytes.
     */
    setHiddenQr(enabled: boolean): void;
    /**
     * The text `part` of the design: studioName, slogan, subtitle, footer or referenceLabel; "-"
     * hides its line.
     */
    setText(part: string, value: string): void;
    /**
     * The title of the sheet, in place of the studio name.
     */
    setTitle(title: string): void;
    /**
     * The cards of `records`, shares as written, in `format` and the layout `layout`, the
     * default where it is left out.
     */
    shares(records: any[], format: any, layout: any): ShareCards;
    /**
     * Takes the details left out from `session`, so that this export repeats what it chose.
     */
    useSession(session: CardSession): void;
}

/**
 * The cards of a backup, planned once: its sheets and its separate cards show the same cards.
 */
export class CardPlan {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The separate cards: a document for each.
     */
    separate(): CardDocuments;
    /**
     * The sheets: one document.
     */
    sheets(): CardDocuments;
}

/**
 * The details that a working session invented: one person, and one employer for each sector, kept
 * across exports until the page frees it.
 */
export class CardSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A session with nothing chosen yet.
     */
    constructor();
}

/**
 * The phrases that decoded codes give.
 */
export class DecodedBackup {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the phrase at `at` keeps the BIP39 checksum.
     */
    checksumValid(at: number): boolean;
    /**
     * The phrase at `at`.
     */
    phrase(at: number): string | undefined;
    /**
     * How many phrases: more than one only for a record with a replaced last word.
     */
    readonly count: number;
    /**
     * The master fingerprint of the codes read as a phrase, where they are one.
     */
    readonly encodedFingerprint: string | undefined;
}

/**
 * A seed phrase encoded as a backup: its codes and its record, which hold the phrase masked or in
 * another form, and both fingerprints. The page frees it once the codes are shown or saved.
 */
export class EncodedBackup {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The codes, as the form writes them.
     */
    codes(): string;
    /**
     * `phrase` encoded in `form` (its name, as `--format` takes it) with `mode` and `dates`, the
     * dates typed as a line of them (undefined: none); with `validLastWord`, the Original
     * Seedshift's checksum-valid last word. Refused as the library refuses the phrase, the dates,
     * the form and the mode, and for a phrase or dates that are not text.
     */
    static encode(phrase: any, dates: any, form: any, mode: any, valid_last_word: boolean): EncodedBackup;
    /**
     * The master fingerprint of the codes read as a phrase, where they are a valid BIP39 phrase;
     * undefined for the Original Seedshift's, which are one only by chance.
     */
    encodedFingerprint(): string | undefined;
    /**
     * The MNC1 record, which names the mode and the form.
     */
    record(): string;
    /**
     * Whether the Original Seedshift's valid last word differs from the mode's own.
     */
    readonly lastWordChanged: boolean;
    /**
     * The master fingerprint of the original phrase, with an empty BIP39 passphrase.
     */
    readonly originalFingerprint: string;
}

/**
 * The way through a page to the seed phrase, told by the page, for the sheet for heirs. Its steps
 * are written with {dates}, which the sheet fills in, or leaves out where no dates are asked.
 */
export class HeirPage {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The sheet for an encoded backup of `words` words in `form`, masked in `mode` with `dates`
     * dates.
     */
    encodedSheet(form: string, words: number, mode: string, dates: number): Uint8Array;
    /**
     * A route: the line under the title, the one address that the sheet prints, the steps that
     * open the page, those that lead to the phrase, what to do with an unclear digit of a date,
     * and the size of the sheet, the default where it is left out.
     */
    constructor(subtitle: string, address: string, start: string[], steps: string[], date_digit_help?: string | null, size?: string | null);
    /**
     * The sheet for `count` shares in `format` of which `threshold` restore the phrase, each with
     * `codes` codes on its cards (NaN: not said).
     */
    sharesSheet(format: string, threshold: number, count: number, codes: number, mode: string, dates: number): Uint8Array;
}

/**
 * The checksum-valid phrases that an exact legacy Seedshift phrase gives, one for each last word.
 */
export class LegacyLastWords {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the phrase at `at` keeps the entropy of the old last word.
     */
    keepsEntropy(at: number): boolean;
    /**
     * The phrase at `at`; none past the last.
     */
    phrase(at: number): string | undefined;
    /**
     * How many there are.
     */
    readonly count: number;
}

/**
 * Codes marked with ?, with what a page says of them before it searches.
 */
export class MarkedCodes {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Reads the marked `codes` in `form` and `mode`.
     */
    static read(codes: any, form: any, mode: any): MarkedCodes;
    /**
     * The way at `at` of those offered, in order; the search itself refuses a way that does not
     * fit.
     */
    way(at: number): MarkedWay | undefined;
    /**
     * What to say where the candidates are too many to list; none where a list holds them.
     */
    readonly many: string | undefined;
    /**
     * Whether the dates of these codes are needed: they were masked.
     */
    readonly needsDates: boolean;
    /**
     * How the question of the ways is put.
     */
    readonly question: string;
    /**
     * What cannot be read, and how many candidates that leaves.
     */
    readonly unreadable: string;
    /**
     * How many ways are offered.
     */
    readonly ways: number;
}

/**
 * A way to tell the right codes.
 */
export class MarkedWay {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Its name in a list of choices.
     */
    readonly label: string;
    /**
     * What it needs or does, shown beside its label.
     */
    readonly note: string;
    /**
     * Which it is: "encoded", for `markedByFingerprint`, or "wallet" or "list", for
     * `markedSearch`.
     */
    readonly way: string;
}

/**
 * A candidate list read from its MNCL bytes, one candidate on request.
 */
export class OpenedCandidateList {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The BIP39 passphrase that the candidate at `at` is checked with; refused past the last.
     */
    passphrase(at: number): string;
    /**
     * The phrase of the candidate at `at`, a whole number from 0; refused past the last.
     */
    phrase(at: number): string;
    /**
     * The list in `bytes`; refused as the library refuses a damaged or foreign list.
     */
    static read(bytes: Uint8Array): OpenedCandidateList;
    /**
     * How many candidates it holds.
     */
    readonly count: number;
    /**
     * Which passphrases it holds: "none", "list" (one for all) or "records" (their own).
     */
    readonly passphrases: string;
}

/**
 * The modules of a QR symbol, without its quiet zone, which a page draws itself.
 */
export class QrMatrix {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the module at `row` and `column`, each a whole number from 0, is dark: never one
     * outside the matrix.
     */
    isDark(row: number, column: number): boolean;
    /**
     * The matrix of `payload` at level M, read back before it is given out.
     */
    static of(payload: any): QrMatrix;
    /**
     * The modules on a side.
     */
    readonly size: number;
}

/**
 * The phrase of an old backup, to be confirmed before it is encoded again.
 */
export class ReEncoding {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The person recognises the phrase.
     */
    confirmByPerson(): void;
    /**
     * Compares the phrase with the wallet of `recovery`; whether it matched, which confirms it.
     */
    confirmByWallet(recovery: Recovery): boolean;
    /**
     * What is said of the confirmation, by the way it came: fingerprint, key or address.
     */
    confirmationLine(by: any): string;
    /**
     * The phrase, once it is confirmed; refused before.
     */
    confirmedPhrase(): string;
    /**
     * The phrase that `codes`, written in `form` and masked in `mode`, give with `dates`; for the
     * Original Seedshift with a valid last word, the one that ends with `last_word`.
     */
    constructor(codes: any, form: any, mode: any, dates: any, last_word: any);
    /**
     * The phrase, for the person to recognise.
     */
    phrase(): string;
}

/**
 * A backup as given, before its dates.
 */
export class ReadBackup {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The codes in `form`, read as `mode` holds them, with their master fingerprint where they
     * are a valid phrase, and decoded under `dates`.
     */
    decode(form: any, mode: any, dates: any): DecodedBackup;
    /**
     * What the record says against `given`.
     */
    formConflict(given: any): string | undefined;
    /**
     * The forms that fit the codes, by name.
     */
    forms(given: any): string[];
    /**
     * The codes marked with ? in `form`, as `mode` holds them: about how many candidates they
     * leave.
     */
    markedCandidates(form: any, mode: any): number;
    /**
     * The forms that fit codes marked with ?.
     */
    markedForms(given: any): string[];
    /**
     * What the record says against `given`.
     */
    modeConflict(given: any): string | undefined;
    /**
     * The mode the record or `given` names.
     */
    mode(given: any): string | undefined;
    /**
     * Reads `backup`, codes or a record; `share_reader` names where the page reads Shamir shares,
     * and `words` (NaN: all) says how many words the phrase has, of codes that end with decoys.
     */
    static read(backup: any, seedshift_only: boolean, share_reader: any, words: number): ReadBackup;
    /**
     * Whether the backup holds a record header.
     */
    readonly hasRecord: boolean;
    /**
     * Whether some codes are marked with ?.
     */
    readonly marked: boolean;
}

/**
 * The wallet that the searches compare with, if any; [`Recovery::without_wallet`], or
 * `WalletEvidence.recovery` with its BIP39 passphrase.
 */
export class Recovery {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The search of the forgotten digits of `dates` of the backup `codes`, read in `form` and
     * `mode`; `max_shown` and `keep` (NaN: the defaults) say what it keeps.
     */
    dateSearch(codes: any, form: any, mode: any, dates: any, max_shown: number, keep: number): RecoverySearch;
    /**
     * The search of the marked `codes` by their encoded `fingerprint`.
     */
    markedByFingerprint(codes: any, form: any, mode: any, fingerprint: any): RecoverySearch;
    /**
     * The search of the marked `codes`: by the wallet with `dates`, which may hold ?, or with `list`
     * every candidate under complete `dates`, with its fingerprint.
     */
    markedSearch(codes: any, form: any, mode: any, dates: any, list: boolean): RecoverySearch;
    /**
     * As [`Recovery::restore_shares`], writing damaged shares again as sskr-export does, the phrase
     * never given: each share in `format`, or in its own where it is undefined; "shares" holds
     * them, or "variants" every set that fits where nothing tells which is the person's.
     */
    repairShares(shares: any[], mode: any, dates: any, decode_entry: any, format: any): RecoverySearch;
    /**
     * The restore of `shares` as typed, each in any form, in `mode` with `dates`, which may hold
     * ?, by the limits set. `decode_entry` names where the page reads an encoded phrase. The page
     * calls `begin`, then steps it.
     */
    restoreShares(shares: any[], mode: any, dates: any, decode_entry: any): RecoverySearch;
    /**
     * What a restore of shares goes by: `keep` date matches for a list, the share combinations and
     * the date combinations it tries without a question (NaN: the defaults), and whether the
     * person said yes to the long search that its question announced.
     */
    setRestoreLimits(keep: number, most_tries: number, most_dates: number, confirmed: boolean): void;
    /**
     * The searches compared with no wallet.
     */
    static withoutWallet(): Recovery;
    /**
     * The search of the words `phrase` marks; with `missing`, of a word missing at any place.
     */
    wordSearch(phrase: any, missing: boolean, max_shown: number, keep: number): RecoverySearch;
}

/**
 * A search that the page steps: it times each part of the public pace sample, asks what
 * `question` says where it must, and calls `step` until it gives false.
 */
export class RecoverySearch {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Reads the shares of a restore and settles its search, from the `seconds` each part of the
     * sample took; nothing for another search.
     */
    begin(seconds: Float64Array): void;
    /**
     * What it found.
     */
    finish(): SearchResult;
    /**
     * Runs part `part` of the sample, for the page to time.
     */
    paceSample(part: number): void;
    /**
     * What is said before a date or marked-code search, from the `seconds` each part took and the
     * person's `limit` (NaN: twelve hours); none for another search.
     */
    plan(seconds: Float64Array, limit: number): SearchQuestion | undefined;
    /**
     * Tries at most `work` candidates.
     */
    step(work: number): SearchProgress;
    /**
     * How many parts its public pace sample has.
     */
    readonly paceParts: number;
}

/**
 * The files of the recovery set: the word lists and the guide for reading a backup by hand.
 */
export class RecoverySet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The bytes of the file at `at`; none past the last.
     */
    bytes(at: number): Uint8Array | undefined;
    /**
     * The name of the file at `at`; none past the last.
     */
    name(at: number): string | undefined;
    /**
     * The set.
     */
    constructor();
    /**
     * How many files it holds.
     */
    readonly count: number;
}

/**
 * The phrase that shares restore, with what checked it and what a repair filled in.
 */
export class RestoredShares {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The phrase the shares hold: for a Seedshift backup, the masked phrase.
     */
    phrase(): string;
    /**
     * What a repair filled in, share by share, then the notes on guesses and on correcting the
     * written copy.
     */
    repairLines(): string[];
    /**
     * Restores the one phrase `shares` hold, each in any form, with elements marked with ? where
     * unreadable; every share is checked against it. A repair that needs a long search, or that
     * more than one phrase passes, is refused here; the assessment of marked shares runs at once,
     * until the recovery binding steps it as a host steps a search.
     */
    static restore(shares: any[]): RestoredShares;
    /**
     * The shares, as read or repaired, each written in its own form, in the order given.
     */
    shares(): string[];
    /**
     * The warning for shares that took no part, or for a phrase no digest checked.
     */
    uncheckedNote(): string | undefined;
    /**
     * Whether every share took part, every element is settled, and a digest checked the phrase.
     */
    readonly checked: boolean;
    /**
     * Groups of the set that restore the phrase.
     */
    readonly groupThreshold: number;
    /**
     * Words of the phrase.
     */
    readonly wordCount: number;
}

/**
 * How far a search has come.
 */
export class SearchProgress {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Tries made so far.
     */
    readonly checked: number;
    /**
     * What passed its own check so far.
     */
    readonly found: number;
    /**
     * What the wallet matched so far.
     */
    readonly matched: number;
    /**
     * Whether it has more to try.
     */
    readonly running: boolean;
    /**
     * Tries in all, where the search knows them.
     */
    readonly total: number | undefined;
}

/**
 * The size of a search and what is said of it before it starts.
 */
export class SearchQuestion {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether it is asked for first.
     */
    readonly ask: boolean;
    /**
     * What it tries, for a notice.
     */
    readonly notice: string;
    /**
     * What to ask.
     */
    readonly question: string;
    /**
     * Whether its time is said.
     */
    readonly tell: boolean;
}

/**
 * What a search found, one row for each phrase or candidate.
 */
export class SearchResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The candidates kept as a list's bytes for `protectList`, each with the BIP39 `passphrase`, if
     * any; none where it kept none. Refused for a passphrase longer than a list takes.
     */
    candidateList(passphrase: any): Uint8Array | undefined;
    /**
     * The codes of the row at `at`.
     */
    codes(at: number): string | undefined;
    /**
     * The dates of the row at `at`.
     */
    dates(at: number): string | undefined;
    /**
     * The fingerprint of the row at `at`.
     */
    fingerprint(at: number): string | undefined;
    /**
     * The form that the share of the row at `at` is written in.
     */
    format(at: number): string | undefined;
    /**
     * Where the wallet matched the row at `at`.
     */
    matchedAt(at: number): string | undefined;
    /**
     * The number of the candidate of the row at `at`, from 1, or the place of its share.
     */
    number(at: number): number | undefined;
    /**
     * The phrase of the row at `at`.
     */
    phrase(at: number): string | undefined;
    /**
     * The share of the row at `at` as an SSKR UR record.
     */
    record(at: number): string | undefined;
    /**
     * What a repair filled in of the row at `at`, a line for each share.
     */
    repairs(at: number): string[] | undefined;
    /**
     * Which set of "variants" the share of the row at `at` belongs to, from 0.
     */
    set(at: number): number | undefined;
    /**
     * The share of the row at `at`, written again in its form.
     */
    share(at: number): string | undefined;
    /**
     * How many candidates a search counted.
     */
    readonly count: number;
    /**
     * What kind of result: "dates", "words", "found", "list", "none", "several", "trouble",
     * "question", "few", "phrases", "shares", "variants" or "stopped".
     */
    readonly kind: string;
    /**
     * The lines of a report, said before the phrases.
     */
    readonly lines: string[];
    /**
     * Whether the search found more candidates than a list keeps, so that no list holds them all.
     */
    readonly listFull: boolean;
    /**
     * How many the wallet matched.
     */
    readonly matched: number;
    /**
     * What the result says: its trouble, its question or why nothing fits.
     */
    readonly message: string | undefined;
    /**
     * The notes said with the phrases.
     */
    readonly notes: string[];
    /**
     * How many other sets of codes and dates give the phrase found, which no wallet tells apart.
     */
    readonly others: number | undefined;
    /**
     * How many rows it holds.
     */
    readonly rows: number;
    /**
     * Whether the page stopped the search, so that the result is partial.
     */
    readonly stopped: boolean;
    /**
     * What the wallet check said of its matches.
     */
    readonly warning: string | undefined;
}

/**
 * The Discovery Scanner's one-time key for a session; only its recipient leaves the WebAssembly,
 * and `wipe()` or `free()` wipes the key.
 */
export class SessionIdentity {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A new key from the browser's randomness, once the gate is open.
     */
    static create(): SessionIdentity;
    /**
     * The candidate list in the age `file`, opened with this key; refused for a file of another
     * lock or shape, one this key does not open, a damaged one, and once the key is wiped.
     */
    decrypt(file: Uint8Array): Uint8Array;
    /**
     * Wipes the key now, as `free()` does, and leaves an object that refuses every use.
     */
    wipe(): void;
    /**
     * Its recipient, age1…, which the writer of a list encrypts to; refused once wiped.
     */
    readonly recipient: string;
}

/**
 * The cards of a set of shares, planned once.
 */
export class ShareCards {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The documents of the share at `at`, from 0.
     */
    documents(at: number): CardDocuments;
    /**
     * The QR code that the sheets of the share at `at` print, as its text; none on separate
     * cards.
     */
    qrPayload(at: number): string | undefined;
    /**
     * How many shares the set holds.
     */
    readonly count: number;
}

/**
 * The shares of one split, each written in one form, in member order.
 */
export class SplitShares {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The note the shares are kept with, saved as `packaging` ("file", "folder", "files",
     * "folders" or "pages").
     */
    keepingNote(packaging: any): string;
    /**
     * The shares, each written in the form chosen, in member order.
     */
    shares(): string[];
    /**
     * `phrase` masked in `mode` with `dates` (a typed line of them; undefined: none) and split
     * into `count` shares, `threshold` of them needed, written in `format` (a share form's name);
     * every new split is restored, each share checked, before it is given out.
     */
    static split(phrase: any, dates: any, mode: any, threshold: number, count: number, format: any): SplitShares;
}

/**
 * Clean input owners for one new threshold generation; incomplete groups export no files.
 */
export class StegoCarrierSet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Moves a completed analysis into the group without another file copy or
     * password stretch. Admission failure retains the analysis for the host.
     */
    addAnalyzed(job: StegoJob): void;
    /**
     * Admits aggregate source bytes before copying this input into Rust.
     * Each member holds its share as the original message of its file.
     */
    add(file: Uint8Array, password: any): void;
    /**
     * Common guaranteed payload bytes after envelope overhead. No value means
     * at least one input was not analyzed; it does not mean zero capacity.
     */
    capacityBytes(selected_density: any): number | undefined;
    /**
     * Starts an empty selection of original carriers.
     */
    constructor(selected_density: any);
    /**
     * Changes the requested profile without discarding admitted analyses. The
     * exact contents are checked against common capacity when `start` is called.
     */
    selectDensity(selected_density: any): void;
    /**
     * Consumes the inputs and contents; the core validates the requested quorum.
     */
    start(content: StegoContent, needed: any): StegoJob;
}

/**
 * A typed hidden message in an owning wiped buffer; `free()` releases it.
 */
export class StegoContent {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * MNC1 text for a compact backup; the host must promptly clear its JS copy.
     */
    backupRecord(): string | undefined;
    /**
     * Packs an existing MNC1 backup without changing any legacy checksum bits.
     */
    static backup(record: any): StegoContent;
    /**
     * Required files for a threshold envelope, or zero for ordinary contents.
     */
    filesNeeded(): number;
    /**
     * Opaque bytes, or no value for a compact backup or a threshold envelope.
     */
    opaqueBytes(): Uint8Array | undefined;
    /**
     * Nonempty exact bytes, including arbitrary binary files; never normalized.
     */
    static opaque(bytes: Uint8Array): StegoContent;
    /**
     * Releases the contents now; subsequent uses are refused.
     */
    wipe(): void;
}

/**
 * One carrier and normalized password: the original message's, or a decoy's or set
 * member's where the call says so. Opening finds the password's record by itself.
 */
export class StegoInput {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Checks a proposed decoy password without consuming the input or changing either password.
     * Use only on the private creation screen. hideWithDecoy repeats core admission before
     * consuming inputs; this method is feedback, not an authorization token.
     */
    compareDecoyPassword(decoy: any): StegoPasswordComparison;
    /**
     * Metadata condition codes from the admitted input, before a job takes it.
     */
    metadataNotices(): string[];
    /**
     * The host checks aggregate file sizes before constructing a group. Its
     * other JS/Blob copies are outside the library's 512MiB managed budget.
     */
    constructor(file: Uint8Array, password: any);
}

/**
 * An owned stepped operation. Use a worker: Argon2 is one blocking 128MiB step.
 * `free()` or `cancel()` drops all passwords and incomplete results.
 */
export class StegoJob {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Analyzes a new password for a record of `role` without searching old records:
     * undefined or "original" for the original message alone, "decoy", or
     * "original-behind-decoy". For a decoy pair, analyze both roles with their own
     * passwords and take the smaller space. On completion `status` is "analyzed" and
     * capacities become available; only an "original" analysis can `encodeAnalyzed`.
     */
    static analyze(input: StegoInput, role: any): StegoJob;
    /**
     * Copies one candidate to JS for a Blob. This alone does not verify the Blob.
     */
    bytes(file_index: any): Uint8Array;
    /**
     * Drops unfinished state and results; subsequent steps return "cancelled".
     */
    cancel(): void;
    /**
     * Guaranteed ordinary-message bytes for this exact file, password and role.
     * Zero means no supported bucket; an unfinished or consumed analysis throws.
     */
    capacityBytes(selected_density: any): number;
    /**
     * Reuses the analyzed key and source. A decoy-pair analysis, an invalid density or
     * insufficient space retains both owners; success consumes this analysis and the contents.
     */
    encodeAnalyzed(content: StegoContent, selected_density: any): StegoJob;
    /**
     * Metadata outcomes for one verified candidate; this does not verify a saved Blob.
     */
    fileMetadataNotices(file_index: any): string[];
    /**
     * Creates the original message and a decoy together in a clean source, at one
     * density. Passwords must pass pair admission; the decoy opens what looks like a file with
     * one record. Verify the saved bytes with each password.
     */
    static hideWithDecoy(input: StegoInput, content: StegoContent, decoy_password: any, decoy: StegoContent, selected_density: any): StegoJob;
    /**
     * Creates the original message alone in a clean source; old records are not
     * searched. The smallest fitting bucket is automatic.
     */
    static hide(input: StegoInput, content: StegoContent, selected_density: any): StegoJob;
    /**
     * Opens the record of this password, the original message or a decoy, without
     * telling which. No-record never means empty.
     */
    static open(input: StegoInput): StegoJob;
    /**
     * Performs one bounded step; a refusal drops the working job immediately.
     */
    step(): string;
    /**
     * Takes an authenticated content owner, including a threshold envelope.
     */
    takeContent(): StegoContent;
    /**
     * Guaranteed ordinary-message bytes after threshold-envelope overhead.
     */
    thresholdCapacityBytes(selected_density: any): number;
    /**
     * Reopens the exact final Blob bytes with their password. Other retained
     * candidate files are counted before the ordinary saved-byte verifier starts.
     */
    verifySaved(file_index: any, saved: Uint8Array, password: any): StegoJob;
    /**
     * Number of fully verified candidates; none leave an incomplete group.
     */
    readonly fileCount: number;
    /**
     * Stable outcome or "working". Stage strings from `step()` are progress only.
     */
    readonly status: string;
}

/**
 * Public bounds for admission before a page reads large file buffers.
 */
export class StegoParameters {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Names of available embedding densities, least to most dense. Higher is
     * not a security guarantee; callers must request a profile explicitly.
     */
    readonly densities: string[];
    /**
     * Largest single input file, in bytes.
     */
    readonly inputBytes: number;
    /**
     * Fixed Argon2 workspace size, in bytes.
     */
    readonly kdfMemoryBytes: number;
    /**
     * The browser-managed buffer budget, excluding JS copies.
     */
    readonly memoryBytes: number;
    /**
     * Largest ordinary payload, in bytes; a carrier may hold less.
     */
    readonly messageBytes: number;
    /**
     * Payload input bytes admitted before the browser creates large buffers.
     * This is a host-memory bound, not a limit on the record representation.
     */
    readonly messageInputBytes: number;
    /**
     * Heuristic minimum OSA difference for new decoy pairs; not password strength.
     */
    readonly passwordDifferencePercent: number;
    /**
     * Largest raw UTF-8 password input before NFKD.
     */
    readonly passwordInputBytes: number;
    /**
     * Minimum normalized UTF-8 password length, not an entropy estimate.
     */
    readonly passwordMinBytes: number;
    /**
     * Largest primary image area, in pixels, subject to memory admission.
     */
    readonly pixels: number;
}

/**
 * Private admission feedback, not strength. Hosts must not log or persist its fields.
 */
export class StegoPasswordComparison {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Whether the full creation policy accepts the pair, including derivation checks.
     */
    readonly accepted: boolean;
    /**
     * Scalar count of the longer normalized input, the percentage denominator.
     */
    readonly comparedCharacters: number;
    /**
     * OSA difference rounded down to a whole percentage, not an entropy estimate.
     */
    readonly differencePercent: number;
    /**
     * Unicode-scalar OSA edits between the normalized inputs.
     */
    readonly editDistance: number;
    /**
     * Stable refusal code for this pair, or undefined when accepted.
     */
    readonly refusalCode: string | undefined;
}

/**
 * Authenticated records opened from separate files. Recovery rejects duplicate
 * members and mixed generations through the established threshold validator.
 */
export class StegoRecoverySet {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Consumes one opened threshold record in a wiped owner.
     */
    add(content: StegoContent): void;
    /**
     * Required count from the authenticated first member; zero before any input.
     */
    filesNeeded(): number;
    /**
     * Starts an empty recovery selection; add authenticated envelopes only.
     */
    constructor();
    /**
     * Compatible but insufficient inputs return no value; malformed or mixed
     * inputs and an empty selection throw a refusal. A recovered content owner must be freed promptly.
     */
    recover(): StegoContent | undefined;
    /**
     * Drops every owned share and its encrypted payload.
     */
    wipe(): void;
}

/**
 * A legend line read back.
 */
export class StitchLegend {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The record of the phrase: `MNC1:seedshift:indexes:…`, which the recovery part decodes with
     * the dates, or `MNC1:direct:indexes:…` for a legend made with `--mode direct`.
     */
    record(): string;
    /**
     * The row, from 1, that did not fit and was read as the only change of it that gives a phrase,
     * for the page to ask the person to check it; undefined where the line read as it is.
     */
    readonly correctedRow: number | undefined;
}

/**
 * A pattern whose legend holds a phrase, and how near it looks to its picture.
 */
export class StitchPattern {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The legend as a person types it back: each row's symbol number, a colon and its stitches.
     */
    legend(): string;
    /**
     * `phrase`, masked with `dates` (a typed line of them) by MnemoCode Seedshift, hidden in the
     * legend of a pattern of `picture`, a PNG, JPEG or WebP file, `stitchesAcross` wide (0: 200).
     * `mode`, which a page may leave out, is "seedshift" or "direct" for the phrase itself, with
     * no dates: anyone who knows the public format reads it from the legend. Refused as the
     * library refuses the mode, the phrase, the dates, the picture and the width, and where the
     * picture has too few colors to hold the phrase.
     */
    constructor(phrase: any, dates: any, picture: Uint8Array, stitches_across: number, mode?: string | null);
    /**
     * The pattern as a PDF dressed as a bought one: a cover, the floss key and the chart in colour,
     * for `fabric`, as `stitch --fabric` names it ("14" or "linen-28"), 14-count Aida where a page
     * leaves it out. The key page keeps the legend line, which [`read_stitch_pdf`] reads back.
     */
    pdf(fabric?: string | null): Uint8Array;
    /**
     * The stitches down.
     */
    readonly height: number;
    /**
     * The stitches moved to set the counts.
     */
    readonly moved: number;
    /**
     * The rows of the legend.
     */
    readonly rows: number;
    /**
     * How far the pattern is from the picture, seen from a little distance: the mean CIELAB
     * difference of the two, each blurred.
     */
    readonly seenDifference: number;
    /**
     * The stitches across.
     */
    readonly width: number;
}

/**
 * How large a pattern of a picture may be on a fabric, as the menu offers it: the sheets from A6 to
 * A2 that hold the picture, each with the stitches it takes there, and the widths the picture
 * allows. The picture is no secret.
 */
export class StitchSizes {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The stitches across the picture takes in the sheet at `at`; none past the last.
     */
    across(at: number): number | undefined;
    /**
     * The centimetres across that the stitches of the sheet at `at` take on the fabric; none past
     * the last.
     */
    centimetresAcross(at: number): number | undefined;
    /**
     * The centimetres down that the stitches of the sheet at `at` take on the fabric; none past
     * the last.
     */
    centimetresDown(at: number): number | undefined;
    /**
     * The stitches down the picture takes in the sheet at `at`; none past the last.
     */
    down(at: number): number | undefined;
    /**
     * The long side of the sheet at `at`, in millimetres; none past the last.
     */
    longSide(at: number): number | undefined;
    /**
     * The name of the sheet at `at`, smallest first, as "A4"; none past the last.
     */
    name(at: number): string | undefined;
    /**
     * The sizes of `picture`, a PNG, JPEG or WebP file, on `fabric` ("14" or "linen-28"; 14-count
     * Aida where a page leaves it out). Refused as the library refuses the picture and the fabric.
     */
    constructor(picture: Uint8Array, fabric?: string | null);
    /**
     * The short side of the sheet at `at`, in millimetres; none past the last.
     */
    shortSide(at: number): number | undefined;
    /**
     * The stitches across of a width of `centimetres` that a person typed; none where it is no
     * number above 0 or its stitches are not within the widths the picture allows.
     */
    typedWidth(centimetres: number): number | undefined;
    /**
     * How many sheets hold the picture.
     */
    readonly count: number;
    /**
     * The stitches across from which a photograph looks real, for the page to say why it selects
     * [`StitchSizes::first`].
     */
    readonly detailedFrom: number;
    /**
     * The fewest stitches across the picture may have.
     */
    readonly fewestAcross: number;
    /**
     * The fewest centimetres across that a width typed in them may have, rounded up.
     */
    readonly fewestCentimetres: number;
    /**
     * The place of the sheet a page selects first: the smallest that gives [`DETAILED_ACROSS`]
     * stitches across, else the largest; none where no sheet holds the picture.
     */
    readonly first: number | undefined;
    /**
     * The most stitches across the picture may have.
     */
    readonly mostAcross: number;
    /**
     * The most centimetres across that a width typed in them may have, rounded down.
     */
    readonly mostCentimetres: number;
}

/**
 * What shows below a line being typed, and what Tab adds to it.
 */
export class TypedHint {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The letters that Tab adds.
     */
    readonly letters: string;
    /**
     * How many words begin with them, or that none does, as a person reads it.
     */
    readonly said: string | undefined;
    /**
     * Whether one word is left, so that the word ends and a space follows.
     */
    readonly wordEnds: boolean;
    /**
     * The words that begin with the letters typed, in list order.
     */
    readonly words: string[];
}

/**
 * What a comparison found.
 */
export class WalletCheck {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * What the matching key gives, as the evidence writes it; undefined where nothing matched.
     */
    readonly derived: string | undefined;
    /**
     * Whether the wallet matched.
     */
    readonly matched: boolean;
    /**
     * The path of the key, m for the master key.
     */
    readonly path: string | undefined;
    /**
     * What the match is worth, for a fingerprint.
     */
    readonly warning: string | undefined;
}

/**
 * The evidence of a wallet, checked when it was made.
 */
export class WalletEvidence {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The evidence compared with the keys of `phrase` and its BIP39 `passphrase` (undefined:
     * empty). Both are read inside the call, so that a freed evidence is refused before either
     * is copied.
     */
    check(phrase: any, passphrase: any): WalletCheck;
    /**
     * An address at its place: of the coin named `coin`, or with `coin` empty, of every coin of
     * this build whose form it has, each on its own paths.
     */
    static coinAddress(coin: string, text: string, account: number, branch: number, index: number, count: number): WalletEvidence;
    /**
     * A master fingerprint, eight hexadecimal digits.
     */
    static masterFingerprint(text: string): WalletEvidence;
    /**
     * A master extended public key of `network`, which every coin shares.
     */
    static masterKey(text: string, network_name: string): WalletEvidence;
    /**
     * The searches of recovery compared with this wallet and its BIP39 `passphrase` (undefined:
     * empty).
     */
    recovery(passphrase: any): Recovery;
    /**
     * The ids of the coins an address was read as, in the order of [`walletCoins`]; empty for
     * other evidence.
     */
    readonly coins: string[];
}

/**
 * A row of the word table.
 */
export class WordRow {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The English word.
     */
    readonly english: string;
    /**
     * The word number, from 1.
     */
    readonly index: number;
    /**
     * The Unicode code.
     */
    readonly unicodeHex: string;
}

/**
 * The lock of the candidate file that begins with `head`, its first 64 KiB or more: "X25519" for
 * a Scanner's key, "scrypt" for a passphrase; refused where it is no list. A page asks it before
 * it asks for a key or a passphrase.
 */
export function candidateFileLock(head: Uint8Array): string;

/**
 * The design at `at`, from 0; none past the last.
 */
export function cardDesign(at: number): CardDesign | undefined;

/**
 * How many designs this file holds.
 */
export function cardDesignCount(): number;

/**
 * The check of the backup written down as `backup` and `written_dates` against the result of
 * `phrase` in `form` and `mode` under `dates`.
 */
export function checkBackup(phrase: any, form: any, mode: any, dates: any, backup: any, written_dates: any): BackupFinding;

/**
 * Refuses a candidate file of `size` bytes larger than any list's, before it is read.
 */
export function checkCandidateFileSize(size: number): void;

/**
 * The check of the shares written down as `backup` against the split of `phrase` in `mode`, with
 * `threshold` shares needed; `decode_entry` names where the page reads an encoded phrase.
 */
export function checkShareBackup(phrase: any, mode: any, threshold: number, dates: any, decode_entry: any, backup: any, written_dates: any): BackupFinding;

/**
 * Refuses a share QR code whose `payload` holds another share than the cards print: the share of
 * `colors` or, where the cards print them, of `labels` (undefined: the colors alone).
 */
export function checkShareQr(colors: any, payload: any, labels: any): void;

/**
 * Checks metadata sizes before a page materializes File/Blob ArrayBuffers.
 * Parsed plans and actual working buffers are admitted separately by core.
 */
export function checkStegoFileSizes(sizes: Float64Array): void;

/**
 * Checks a payload File size before creating its ArrayBuffer or WASM copy.
 */
export function checkStegoMessageSize(bytes: number): void;

/**
 * The candidate list in the age `file`, opened with `passphrase`.
 */
export function decryptWithPassphrase(file: Uint8Array, passphrase: any): Uint8Array;

/**
 * A PNG with visible text for ordinary scanners and an exact hidden UTF-8 record.
 */
export function hiddenQrPng(visible: any, record: any): Uint8Array;

/**
 * Whether `text`, given for the words of a phrase, is codes.
 */
export function isCodes(backup: any): boolean;

/**
 * The replacements of the last word of `phrase`, an exact legacy Seedshift phrase: the phrases, not
 * wallets, as `recover-word --legacy-valid-last-word` lists them.
 */
export function legacyLastWords(phrase: any): LegacyLastWords;

/**
 * The form that typed `codes` most likely is, by its name; refused for codes that are not text.
 */
export function likelyForm(codes: any): string;

/**
 * The master fingerprint of `phrase` with the BIP39 `passphrase` (undefined: empty), eight
 * hexadecimal digits.
 */
export function masterFingerprint(phrase: any, passphrase: any): string;

/**
 * The codes of one share on its cards in `format`, before the decoys, for the sheet for heirs;
 * none in a form without cards.
 */
export function ownShareCards(record: any, format: any): number | undefined;

/**
 * The file of `list` protected as `kind` says: "key" encrypts it to the Scanner's recipient in
 * `secret`, "passphrase" under the passphrase in `secret` (at least 12 characters), and "none",
 * only on the person's explicit request, leaves it in the open (`secret` undefined).
 */
export function protectList(list: Uint8Array, kind: any, secret: any): Uint8Array;

/**
 * The PNG image of `payload`, 720 pixels with the quiet zone of four modules, read back first.
 */
export function qrPng(payload: any): Uint8Array;

/**
 * A hidden record from a PNG, refused when its format or check is invalid.
 */
export function readHiddenQrPng(bytes: Uint8Array): string;

/**
 * The text of the QR code in the PNG file `bytes`, admitted and read as the library reads it.
 */
export function readQrPng(bytes: Uint8Array): string;

/**
 * The legend line `line` read back; undefined where the text is no legend line, such as codes or a
 * record. Refused for a line that is no legend, or that reads as no phrase or as more than one.
 */
export function readStitchLegend(line: any): StitchLegend | undefined;

/**
 * The legend line that the PDF `pdf` of a pattern keeps, read back as [`read_stitch_legend`]
 * reads a typed one; undefined where the PDF keeps none, as when another program saved it again,
 * and the page asks for the legend typed from the key instead.
 */
export function readStitchPdf(pdf: Uint8Array): StitchLegend | undefined;

/**
 * The candidates part's known answers: the startup cases, or with `full` every case, scrypt's
 * among them.
 */
export function selfCheckCandidates(full: boolean): void;

/**
 * The cards' known answers: the startup cases, or with `full` every case and a sheet of each
 * family.
 */
export function selfCheckCards(full: boolean): void;

/**
 * The embroidery part's known answers: the startup cases, or with `full` every case.
 */
export function selfCheckEmbroidery(full: boolean): void;

/**
 * The phrase part's known answers: the startup cases, or with `full` every case.
 */
export function selfCheckPhrase(full: boolean): void;

/**
 * The QR part's known answers: the startup cases, or with `full` every case.
 */
export function selfCheckQr(full: boolean): void;

/**
 * The recovery part's known answers: the startup cases, or with `full` every case.
 */
export function selfCheckRecovery(full: boolean): void;

/**
 * The shares part's known answers: the startup cases, or with `full` every case.
 */
export function selfCheckSskr(full: boolean): void;

/**
 * The wallet part's known answers: the startup cases, or with `full` every case.
 */
export function selfCheckWallet(full: boolean): void;

/**
 * The form `share` is written in, by its name.
 */
export function shareForm(share: any): string;

/**
 * What the text `text` given for the codes is: "share", "either", or undefined for neither.
 */
export function shareKind(backup: any): string | undefined;

/**
 * Reads bounds without constructing a secret or loading a carrier.
 */
export function stegoParameters(): StegoParameters;

/**
 * Runs the feature's startup cases, or includes its full Argon2 reference.
 */
export function stegoSelfCheck(full: boolean): void;

/**
 * The ids of the coins this build holds.
 */
export function walletCoins(): string[];

/**
 * The hint below `line`, the text before the cursor, of a seed phrase; with `codes`, of codes in
 * any form, which have words only where the line so far is English words.
 */
export function wordHint(line: any, codes: boolean): TypedHint;

/**
 * The row of `value`, read as `kind` says: word, index or unicode.
 */
export function wordLookup(kind: any, value: any): WordRow;

/**
 * The numbered list in `format`, as `table --format` names it.
 */
export function wordTable(format: string): string;

/**
 * `share`, in any form, written in `format`.
 */
export function writeShare(share: any, format: any): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_backupfinding_free: (a: number, b: number) => void;
    readonly __wbg_carddesign_free: (a: number, b: number) => void;
    readonly __wbg_carddocuments_free: (a: number, b: number) => void;
    readonly __wbg_cardexport_free: (a: number, b: number) => void;
    readonly __wbg_cardplan_free: (a: number, b: number) => void;
    readonly __wbg_cardsession_free: (a: number, b: number) => void;
    readonly __wbg_decodedbackup_free: (a: number, b: number) => void;
    readonly __wbg_encodedbackup_free: (a: number, b: number) => void;
    readonly __wbg_heirpage_free: (a: number, b: number) => void;
    readonly __wbg_legacylastwords_free: (a: number, b: number) => void;
    readonly __wbg_markedcodes_free: (a: number, b: number) => void;
    readonly __wbg_markedway_free: (a: number, b: number) => void;
    readonly __wbg_openedcandidatelist_free: (a: number, b: number) => void;
    readonly __wbg_qrmatrix_free: (a: number, b: number) => void;
    readonly __wbg_readbackup_free: (a: number, b: number) => void;
    readonly __wbg_recovery_free: (a: number, b: number) => void;
    readonly __wbg_recoverysearch_free: (a: number, b: number) => void;
    readonly __wbg_recoveryset_free: (a: number, b: number) => void;
    readonly __wbg_reencoding_free: (a: number, b: number) => void;
    readonly __wbg_restoredshares_free: (a: number, b: number) => void;
    readonly __wbg_searchprogress_free: (a: number, b: number) => void;
    readonly __wbg_searchquestion_free: (a: number, b: number) => void;
    readonly __wbg_searchresult_free: (a: number, b: number) => void;
    readonly __wbg_sessionidentity_free: (a: number, b: number) => void;
    readonly __wbg_sharecards_free: (a: number, b: number) => void;
    readonly __wbg_splitshares_free: (a: number, b: number) => void;
    readonly __wbg_stegocarrierset_free: (a: number, b: number) => void;
    readonly __wbg_stegocontent_free: (a: number, b: number) => void;
    readonly __wbg_stegoinput_free: (a: number, b: number) => void;
    readonly __wbg_stegojob_free: (a: number, b: number) => void;
    readonly __wbg_stegoparameters_free: (a: number, b: number) => void;
    readonly __wbg_stegopasswordcomparison_free: (a: number, b: number) => void;
    readonly __wbg_stegorecoveryset_free: (a: number, b: number) => void;
    readonly __wbg_stitchlegend_free: (a: number, b: number) => void;
    readonly __wbg_stitchpattern_free: (a: number, b: number) => void;
    readonly __wbg_stitchsizes_free: (a: number, b: number) => void;
    readonly __wbg_typedhint_free: (a: number, b: number) => void;
    readonly __wbg_walletcheck_free: (a: number, b: number) => void;
    readonly __wbg_walletevidence_free: (a: number, b: number) => void;
    readonly __wbg_wordrow_free: (a: number, b: number) => void;
    readonly backupfinding_message: (a: number, b: number) => void;
    readonly backupfinding_notes: (a: number, b: number) => void;
    readonly backupfinding_places: (a: number, b: number) => void;
    readonly backupfinding_verdict: (a: number, b: number) => void;
    readonly candidateFileLock: (a: number, b: number, c: number) => void;
    readonly cardDesign: (a: number) => number;
    readonly cardDesignCount: () => number;
    readonly carddesign_description: (a: number, b: number) => void;
    readonly carddesign_drawsSeparateCards: (a: number) => number;
    readonly carddesign_id: (a: number, b: number) => void;
    readonly carddesign_name: (a: number, b: number) => void;
    readonly carddocuments_count: (a: number) => number;
    readonly carddocuments_image: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly carddocuments_name: (a: number, b: number, c: number) => void;
    readonly carddocuments_pageCount: (a: number, b: number, c: number) => void;
    readonly carddocuments_pdf: (a: number, b: number, c: number) => void;
    readonly cardexport_backup: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly cardexport_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly cardexport_preview: (a: number, b: number, c: number, d: number) => void;
    readonly cardexport_setDetail: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cardexport_setHiddenQr: (a: number, b: number) => void;
    readonly cardexport_setText: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cardexport_setTitle: (a: number, b: number, c: number) => void;
    readonly cardexport_shares: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly cardexport_useSession: (a: number, b: number) => void;
    readonly cardplan_separate: (a: number, b: number) => void;
    readonly cardplan_sheets: (a: number, b: number) => void;
    readonly cardsession_new: () => number;
    readonly checkBackup: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly checkCandidateFileSize: (a: number, b: number) => void;
    readonly checkShareBackup: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly checkShareQr: (a: number, b: number, c: number, d: number) => void;
    readonly checkStegoFileSizes: (a: number, b: number, c: number) => void;
    readonly checkStegoMessageSize: (a: number, b: number) => void;
    readonly decodedbackup_checksumValid: (a: number, b: number) => number;
    readonly decodedbackup_count: (a: number) => number;
    readonly decodedbackup_encodedFingerprint: (a: number, b: number) => void;
    readonly decodedbackup_phrase: (a: number, b: number, c: number) => void;
    readonly decryptWithPassphrase: (a: number, b: number, c: number, d: number) => void;
    readonly encodedbackup_codes: (a: number, b: number) => void;
    readonly encodedbackup_encode: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly encodedbackup_encodedFingerprint: (a: number, b: number) => void;
    readonly encodedbackup_lastWordChanged: (a: number) => number;
    readonly encodedbackup_originalFingerprint: (a: number, b: number) => void;
    readonly encodedbackup_record: (a: number, b: number) => void;
    readonly heirpage_encodedSheet: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly heirpage_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly heirpage_sharesSheet: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly hiddenQrPng: (a: number, b: number, c: number) => void;
    readonly isCodes: (a: number, b: number) => void;
    readonly legacyLastWords: (a: number, b: number) => void;
    readonly legacylastwords_count: (a: number) => number;
    readonly legacylastwords_keepsEntropy: (a: number, b: number) => number;
    readonly legacylastwords_phrase: (a: number, b: number, c: number) => void;
    readonly likelyForm: (a: number, b: number) => void;
    readonly markedcodes_many: (a: number, b: number) => void;
    readonly markedcodes_needsDates: (a: number) => number;
    readonly markedcodes_question: (a: number, b: number) => void;
    readonly markedcodes_read: (a: number, b: number, c: number, d: number) => void;
    readonly markedcodes_unreadable: (a: number, b: number) => void;
    readonly markedcodes_way: (a: number, b: number, c: number) => void;
    readonly markedcodes_ways: (a: number, b: number) => void;
    readonly markedway_label: (a: number, b: number) => void;
    readonly markedway_note: (a: number, b: number) => void;
    readonly markedway_way: (a: number, b: number) => void;
    readonly masterFingerprint: (a: number, b: number, c: number) => void;
    readonly openedcandidatelist_count: (a: number) => number;
    readonly openedcandidatelist_passphrase: (a: number, b: number, c: number) => void;
    readonly openedcandidatelist_passphrases: (a: number, b: number) => void;
    readonly openedcandidatelist_phrase: (a: number, b: number, c: number) => void;
    readonly openedcandidatelist_read: (a: number, b: number, c: number) => void;
    readonly ownShareCards: (a: number, b: number, c: number) => void;
    readonly protectList: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly qrPng: (a: number, b: number) => void;
    readonly qrmatrix_isDark: (a: number, b: number, c: number) => number;
    readonly qrmatrix_of: (a: number, b: number) => void;
    readonly qrmatrix_size: (a: number) => number;
    readonly readHiddenQrPng: (a: number, b: number, c: number) => void;
    readonly readQrPng: (a: number, b: number, c: number) => void;
    readonly readStitchLegend: (a: number, b: number) => void;
    readonly readStitchPdf: (a: number, b: number, c: number) => void;
    readonly readbackup_decode: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly readbackup_formConflict: (a: number, b: number, c: number) => void;
    readonly readbackup_forms: (a: number, b: number, c: number) => void;
    readonly readbackup_hasRecord: (a: number) => number;
    readonly readbackup_marked: (a: number) => number;
    readonly readbackup_markedCandidates: (a: number, b: number, c: number, d: number) => void;
    readonly readbackup_markedForms: (a: number, b: number, c: number) => void;
    readonly readbackup_mode: (a: number, b: number, c: number) => void;
    readonly readbackup_modeConflict: (a: number, b: number, c: number) => void;
    readonly readbackup_read: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly recovery_dateSearch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly recovery_markedByFingerprint: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly recovery_markedSearch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly recovery_repairShares: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly recovery_restoreShares: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly recovery_setRestoreLimits: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly recovery_withoutWallet: () => number;
    readonly recovery_wordSearch: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly recoverysearch_begin: (a: number, b: number, c: number, d: number) => void;
    readonly recoverysearch_finish: (a: number, b: number) => void;
    readonly recoverysearch_paceParts: (a: number) => number;
    readonly recoverysearch_paceSample: (a: number, b: number, c: number) => void;
    readonly recoverysearch_plan: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly recoverysearch_step: (a: number, b: number, c: number) => void;
    readonly recoveryset_bytes: (a: number, b: number, c: number) => void;
    readonly recoveryset_count: (a: number) => number;
    readonly recoveryset_name: (a: number, b: number, c: number) => void;
    readonly recoveryset_new: () => number;
    readonly reencoding_confirmByPerson: (a: number) => void;
    readonly reencoding_confirmByWallet: (a: number, b: number, c: number) => void;
    readonly reencoding_confirmationLine: (a: number, b: number, c: number) => void;
    readonly reencoding_confirmedPhrase: (a: number, b: number) => void;
    readonly reencoding_new: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly reencoding_phrase: (a: number, b: number) => void;
    readonly restoredshares_checked: (a: number) => number;
    readonly restoredshares_groupThreshold: (a: number) => number;
    readonly restoredshares_phrase: (a: number, b: number) => void;
    readonly restoredshares_repairLines: (a: number, b: number) => void;
    readonly restoredshares_restore: (a: number, b: number, c: number) => void;
    readonly restoredshares_shares: (a: number, b: number) => void;
    readonly restoredshares_uncheckedNote: (a: number, b: number) => void;
    readonly restoredshares_wordCount: (a: number) => number;
    readonly searchprogress_checked: (a: number) => number;
    readonly searchprogress_found: (a: number) => number;
    readonly searchprogress_matched: (a: number) => number;
    readonly searchprogress_running: (a: number) => number;
    readonly searchprogress_total: (a: number, b: number) => void;
    readonly searchquestion_ask: (a: number) => number;
    readonly searchquestion_notice: (a: number, b: number) => void;
    readonly searchquestion_question: (a: number, b: number) => void;
    readonly searchquestion_tell: (a: number) => number;
    readonly searchresult_candidateList: (a: number, b: number, c: number) => void;
    readonly searchresult_codes: (a: number, b: number, c: number) => void;
    readonly searchresult_count: (a: number) => number;
    readonly searchresult_dates: (a: number, b: number, c: number) => void;
    readonly searchresult_fingerprint: (a: number, b: number, c: number) => void;
    readonly searchresult_format: (a: number, b: number, c: number) => void;
    readonly searchresult_kind: (a: number, b: number) => void;
    readonly searchresult_lines: (a: number, b: number) => void;
    readonly searchresult_listFull: (a: number) => number;
    readonly searchresult_matched: (a: number) => number;
    readonly searchresult_matchedAt: (a: number, b: number, c: number) => void;
    readonly searchresult_message: (a: number, b: number) => void;
    readonly searchresult_notes: (a: number, b: number) => void;
    readonly searchresult_number: (a: number, b: number, c: number) => void;
    readonly searchresult_others: (a: number, b: number) => void;
    readonly searchresult_phrase: (a: number, b: number, c: number) => void;
    readonly searchresult_record: (a: number, b: number, c: number) => void;
    readonly searchresult_repairs: (a: number, b: number, c: number) => void;
    readonly searchresult_rows: (a: number) => number;
    readonly searchresult_set: (a: number, b: number) => number;
    readonly searchresult_share: (a: number, b: number, c: number) => void;
    readonly searchresult_stopped: (a: number) => number;
    readonly searchresult_warning: (a: number, b: number) => void;
    readonly selfCheckCandidates: (a: number, b: number) => void;
    readonly selfCheckCards: (a: number, b: number) => void;
    readonly selfCheckEmbroidery: (a: number, b: number) => void;
    readonly selfCheckPhrase: (a: number, b: number) => void;
    readonly selfCheckQr: (a: number, b: number) => void;
    readonly selfCheckRecovery: (a: number, b: number) => void;
    readonly selfCheckSskr: (a: number, b: number) => void;
    readonly selfCheckWallet: (a: number, b: number) => void;
    readonly sessionidentity_create: (a: number) => void;
    readonly sessionidentity_decrypt: (a: number, b: number, c: number, d: number) => void;
    readonly sessionidentity_recipient: (a: number, b: number) => void;
    readonly sessionidentity_wipe: (a: number) => void;
    readonly shareForm: (a: number, b: number) => void;
    readonly shareKind: (a: number, b: number) => void;
    readonly sharecards_count: (a: number) => number;
    readonly sharecards_documents: (a: number, b: number, c: number) => void;
    readonly sharecards_qrPayload: (a: number, b: number, c: number) => void;
    readonly splitshares_keepingNote: (a: number, b: number, c: number) => void;
    readonly splitshares_shares: (a: number, b: number) => void;
    readonly splitshares_split: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly stegoParameters: () => number;
    readonly stegoSelfCheck: (a: number, b: number) => void;
    readonly stegocarrierset_add: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly stegocarrierset_addAnalyzed: (a: number, b: number, c: number) => void;
    readonly stegocarrierset_capacityBytes: (a: number, b: number, c: number) => void;
    readonly stegocarrierset_new: (a: number, b: number) => void;
    readonly stegocarrierset_selectDensity: (a: number, b: number, c: number) => void;
    readonly stegocarrierset_start: (a: number, b: number, c: number, d: number) => void;
    readonly stegocontent_backup: (a: number, b: number) => void;
    readonly stegocontent_backupRecord: (a: number, b: number) => void;
    readonly stegocontent_filesNeeded: (a: number, b: number) => void;
    readonly stegocontent_opaque: (a: number, b: number, c: number) => void;
    readonly stegocontent_opaqueBytes: (a: number, b: number) => void;
    readonly stegocontent_wipe: (a: number) => void;
    readonly stegoinput_compareDecoyPassword: (a: number, b: number, c: number) => void;
    readonly stegoinput_metadataNotices: (a: number, b: number) => void;
    readonly stegoinput_new: (a: number, b: number, c: number, d: number) => void;
    readonly stegojob_analyze: (a: number, b: number, c: number) => void;
    readonly stegojob_bytes: (a: number, b: number, c: number) => void;
    readonly stegojob_cancel: (a: number) => void;
    readonly stegojob_capacityBytes: (a: number, b: number, c: number) => void;
    readonly stegojob_encodeAnalyzed: (a: number, b: number, c: number, d: number) => void;
    readonly stegojob_fileCount: (a: number) => number;
    readonly stegojob_fileMetadataNotices: (a: number, b: number, c: number) => void;
    readonly stegojob_hide: (a: number, b: number, c: number, d: number) => void;
    readonly stegojob_hideWithDecoy: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly stegojob_open: (a: number, b: number) => void;
    readonly stegojob_status: (a: number, b: number) => void;
    readonly stegojob_step: (a: number, b: number) => void;
    readonly stegojob_takeContent: (a: number, b: number) => void;
    readonly stegojob_thresholdCapacityBytes: (a: number, b: number, c: number) => void;
    readonly stegojob_verifySaved: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly stegoparameters_densities: (a: number, b: number) => void;
    readonly stegoparameters_inputBytes: (a: number) => number;
    readonly stegoparameters_kdfMemoryBytes: (a: number) => number;
    readonly stegoparameters_memoryBytes: (a: number) => number;
    readonly stegoparameters_messageBytes: (a: number) => number;
    readonly stegoparameters_messageInputBytes: (a: number) => number;
    readonly stegoparameters_passwordDifferencePercent: (a: number) => number;
    readonly stegoparameters_passwordInputBytes: (a: number) => number;
    readonly stegoparameters_passwordMinBytes: (a: number) => number;
    readonly stegoparameters_pixels: (a: number) => number;
    readonly stegopasswordcomparison_accepted: (a: number) => number;
    readonly stegopasswordcomparison_comparedCharacters: (a: number) => number;
    readonly stegopasswordcomparison_differencePercent: (a: number) => number;
    readonly stegopasswordcomparison_editDistance: (a: number) => number;
    readonly stegopasswordcomparison_refusalCode: (a: number, b: number) => void;
    readonly stegorecoveryset_add: (a: number, b: number, c: number) => void;
    readonly stegorecoveryset_filesNeeded: (a: number, b: number) => void;
    readonly stegorecoveryset_new: () => number;
    readonly stegorecoveryset_recover: (a: number, b: number) => void;
    readonly stegorecoveryset_wipe: (a: number) => void;
    readonly stitchlegend_correctedRow: (a: number) => number;
    readonly stitchlegend_record: (a: number, b: number) => void;
    readonly stitchpattern_height: (a: number) => number;
    readonly stitchpattern_legend: (a: number, b: number) => void;
    readonly stitchpattern_moved: (a: number) => number;
    readonly stitchpattern_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly stitchpattern_pdf: (a: number, b: number, c: number, d: number) => void;
    readonly stitchpattern_rows: (a: number) => number;
    readonly stitchpattern_seenDifference: (a: number) => number;
    readonly stitchpattern_width: (a: number) => number;
    readonly stitchsizes_across: (a: number, b: number) => number;
    readonly stitchsizes_centimetresAcross: (a: number, b: number, c: number) => void;
    readonly stitchsizes_centimetresDown: (a: number, b: number, c: number) => void;
    readonly stitchsizes_count: (a: number) => number;
    readonly stitchsizes_detailedFrom: (a: number) => number;
    readonly stitchsizes_down: (a: number, b: number) => number;
    readonly stitchsizes_fewestAcross: (a: number) => number;
    readonly stitchsizes_fewestCentimetres: (a: number) => number;
    readonly stitchsizes_first: (a: number) => number;
    readonly stitchsizes_longSide: (a: number, b: number, c: number) => void;
    readonly stitchsizes_mostAcross: (a: number) => number;
    readonly stitchsizes_mostCentimetres: (a: number) => number;
    readonly stitchsizes_name: (a: number, b: number, c: number) => void;
    readonly stitchsizes_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly stitchsizes_shortSide: (a: number, b: number, c: number) => void;
    readonly stitchsizes_typedWidth: (a: number, b: number) => number;
    readonly typedhint_letters: (a: number, b: number) => void;
    readonly typedhint_said: (a: number, b: number) => void;
    readonly typedhint_wordEnds: (a: number) => number;
    readonly typedhint_words: (a: number, b: number) => void;
    readonly walletCoins: (a: number) => void;
    readonly walletcheck_derived: (a: number, b: number) => void;
    readonly walletcheck_matched: (a: number) => number;
    readonly walletcheck_path: (a: number, b: number) => void;
    readonly walletcheck_warning: (a: number, b: number) => void;
    readonly walletevidence_check: (a: number, b: number, c: number, d: number) => void;
    readonly walletevidence_coinAddress: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly walletevidence_coins: (a: number, b: number) => void;
    readonly walletevidence_masterFingerprint: (a: number, b: number, c: number) => void;
    readonly walletevidence_masterKey: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly walletevidence_recovery: (a: number, b: number, c: number) => void;
    readonly wordHint: (a: number, b: number, c: number) => void;
    readonly wordLookup: (a: number, b: number, c: number) => void;
    readonly wordTable: (a: number, b: number, c: number) => void;
    readonly wordrow_english: (a: number, b: number) => void;
    readonly wordrow_index: (a: number) => number;
    readonly wordrow_unicodeHex: (a: number, b: number) => void;
    readonly writeShare: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;
