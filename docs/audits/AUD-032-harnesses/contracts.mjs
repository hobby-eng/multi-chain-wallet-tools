/** User inputs/outcomes of the reconciled operation areas; limits and arithmetic stay in owners. */
const groups = [
  {
    rows: [0, 29, 30, 31, 34, 35, 36],
    inputs: [
      "Phrase or represented share source",
      "Offered template and layout",
      "Page size/orientation, PDF/PNG/JPEG, QR option",
      "Own or generated identity/copy/title; retained source/settings capture",
    ],
    outcomes: [
      "Fresh owned file bytes and format/keeping metadata",
      "Refusal with no successful publication",
      "Changed/cleared capture suppresses late output and clears bytes",
    ],
    ownerPolicy:
      "CardPreview, CardRenderer, ShareCardSet, shared layout/format registry and host output owner",
  },
  {
    rows: [1],
    inputs: [
      "Actual build-selected feature checks",
      "Startup quick answers or explicit full-self-test button",
    ],
    outcomes: [
      "Self-test report",
      "Failure closes secret operations; full PDF/vector costs remain user initiated",
    ],
    ownerPolicy: "MnemoCodeSelfTest and selectedRecoverySelfTestSource",
  },
  {
    rows: [2, 3, 4, 5],
    inputs: [
      "Candidate phrase and BIP39 passphrase",
      "Master fingerprint or offered coin/network/reference kind",
      "Profile/account/change/index/address-count scope where applicable",
    ],
    outcomes: [
      "Matched/unmatched wallet result and optional path",
      "Input refusal before work",
      "Stopped comparison remains distinct from unmatched",
    ],
    ownerPolicy:
      "MasterFingerprintCheck, WalletEvidenceCheck, CoinAddressComparison; edition composition",
  },
  {
    rows: [6, 7, 10],
    inputs: [
      "All five BIP39 lengths and offered representation",
      "Direct/Seedshift/legacy/legacy-valid masking mode",
      "Whole dates, header/plain/QR input, format and declared words as applicable",
    ],
    outcomes: [
      "MNC1/payload and explicit JSON-with-dates export",
      "Decoded original or legacy candidate alternatives",
      "Refused invalid/ambiguous input; no silent default on malformed selectors",
    ],
    ownerPolicy: "Masking, EncodedForm, EncodedBackup, BackupReading",
  },
  {
    rows: [8, 9, 12, 13],
    inputs: [
      "Marked words or encoded codes, including symbolic Color Unicode patterns",
      "Date digits/patterns, selected mode/form and known phrase length",
      "Wallet evidence, range, consent/work limit and optional candidate-list protection",
    ],
    outcomes: [
      "Found candidate(s), question/consent, several or no match",
      "Progress and complete bounded list when asked for",
      "Stopped/partial work cannot publish as completed/no matches",
    ],
    ownerPolicy:
      "MissingCodes, MissingCodesSearch, WordCandidateSearch, DateSearch and shared worker job",
  },
  {
    rows: [11],
    inputs: [
      "Encoded backup, mode/form/dates/word count",
      "Legacy last-word choice where needed",
      "Explicit person confirmation or wallet comparison",
    ],
    outcomes: [
      "Unconfirmed session, then confirmed original passed to Encode",
      "Failed/stopped wallet check leaves confirmation unavailable",
    ],
    ownerPolicy: "ReEncoding",
  },
  {
    rows: [14],
    inputs: ["Local uploaded/pasted QR image", "Bounded PNG/JPEG decoding and capture state"],
    outcomes: [
      "Locally decoded text to the same owner parser",
      "Malformed/oversized/changed input refusal or cancelled acquisition",
    ],
    ownerPolicy: "Shared PngAdmission/QR acquisition; no remote decoder",
  },
  {
    rows: [15, 16, 17],
    inputs: [
      "Ordered candidate entropy and optional per-record/list BIP39 passphrase",
      "Explicit plaintext consent, passphrase protection or Scanner recipient key",
      "File-size/protection admission; remove/replace/clear lifecycle",
    ],
    outcomes: [
      "MNCL/age bytes or opened Scanner candidate source",
      "Malformed/wrong-protection refusal without format fallback",
      "Terminal wipe; no candidates after disposal; save failure never labelled success",
    ],
    ownerPolicy:
      "ListProtection, CandidateListWriter, CandidateFileAdmission, OpenedCandidateList and Scanner vault",
  },
  {
    rows: [18, 19, 22, 23, 27],
    inputs: [
      "Validated BIP39 phrase or represented masked backup",
      "Group/member quorum and set count",
      "Offered standard/represented share form and masking dates",
      "Explicit secure random callback and share export choice",
    ],
    outcomes: [
      "Validated share set and typed/text/QR transfer",
      "Re-encoded complete shares without requiring a restore quorum where permitted",
      "Coded refusal before byte narrowing or unsupported export",
    ],
    ownerPolicy: "ShareSplit, ShareSetChoice, ShareExport, checked SSKR bridge",
  },
  {
    rows: [20, 21, 24, 25, 26],
    inputs: [
      "Typed/file/QR complete or damaged shares and marked repair patterns",
      "Group/member constraints, duplicate/mixed records and search limits",
      "Whole/marked dates, wallet evidence and list retention/protection choices",
    ],
    outcomes: [
      "Assessment/repair question and progress",
      "Restored original, repaired sets or explicitly no match",
      "Stopped outcome suppresses late candidates and is not a completed repair plan",
    ],
    ownerPolicy: "ShareInput, ShareRestore, JointRepair, RepairReport, ShareUnmasking",
  },
  {
    rows: [28],
    inputs: [
      "Created encoded backup or represented shares",
      "Written copy read back through the same parser",
      "Original source, dates and share platform where applicable",
    ],
    outcomes: [
      "Read-back match or mismatch",
      "Refusal of malformed/wrong metadata; no stronger authentication claim",
    ],
    ownerPolicy: "EncodedBackupCheck, ShareBackupCheck",
  },
  {
    rows: [32, 33],
    inputs: ["Actual backup/share/card facts", "Host recovery route and A5/A6 choice"],
    outcomes: [
      "Instructions file with no seed phrase",
      "Refusal of incompatible facts or stale publication",
    ],
    ownerPolicy: "HeirInstructions, HeirRoute and renderHeirSheet",
  },
  {
    rows: [37],
    inputs: ["BIP39 word, word index or Unicode code", "Lookup or complete public TSV export"],
    outcomes: ["Matching public row/table", "Invalid lookup refusal"],
    ownerPolicy: "WordList, wordTableRow, wordTableText",
  },
];

/** Gives each area one explicit input/outcome contract; helpers are not extra end-user operations. */
export class OperationContract {
  static at(index) {
    const matches = groups.filter(({ rows }) => rows.includes(index));
    if (matches.length !== 1) throw new Error(`Operation contract missing or duplicated: ${index}`);
    const { rows: _rows, ...contract } = matches[0];
    return contract;
  }
}
