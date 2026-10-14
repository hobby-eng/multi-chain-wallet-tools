// The self-test of the candidate list (core/candidate-list.ts, docs/CANDIDATES.md, "The list"):
// the published bytes of a list of three phrases, written and read, the padded lengths of Padmé,
// and the lists that a reader refuses. core/self-test.ts runs it before every command of the
// command line and in the full self-test.
//
// It needs nothing from the host. It holds public test data, no secret.
//
// Host-neutral: it imports only core/candidate-list.ts and core/self-test-check.ts.

import {
  decodeCandidateList,
  encodeCandidateList,
  MAX_CANDIDATE_LIST_BYTES,
  OpenedCandidateList,
  padmeLength,
} from "./candidate-list.js";
import { bytesOfHex, expectRefused, expectSame, hexOfBytes } from "./self-test-check.js";
import { defined } from "./defined.js";

/**
 * vectors/candidates-v1.json, "three phrases": the entropy of the public phrases of BIP39's first,
 * second and fourth vectors, and their list without passphrases. The bytes were written again
 * independently with Python's struct and zlib from docs/CANDIDATES.md.
 */
export const THREE_PHRASES_ENTROPY = [
  "00000000000000000000000000000000",
  "7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f",
  "ffffffffffffffffffffffffffffffff",
] as const;
/**
 * The bytes, in hexadecimal, of the list that the startup check writes of THREE_PHRASES: the known
 * answer that the writer must give and the reader take back.
 */
export const THREE_PHRASES_LIST =
  "4d4e434c01001000000003000000000000000000000000000000007f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7fffffffffffffffffffffffffffffffff98854aa000";

/**
 * vectors/candidates-v1.json, "a passphrase for all": the three phrases with the list passphrase
 * TREZOR, which every record takes.
 */
const LIST_PASSPHRASE_LIST =
  "4d4e434c0101100000000300065452455a4f52000000000000000000000000000000007f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7fffffffffffffffffffffffffffffffff969c8d9700";
const LIST_PASSPHRASE = "TREZOR";

/**
 * vectors/candidates-v1.json, "passphrases of their own, the second falling back to the one for
 * all": the list passphrase TREZOR, the first and third records with passphrases of their own, the
 * second with an empty field; and the passphrase each candidate is checked with by the rule of
 * docs/CANDIDATES.md, written by hand from that rule.
 */
const OWN_PASSPHRASES_LIST =
  "4d4e434c0103100000000300065452455a4f5200000000000000000000000000000000000a70c3a4737377c3b672647f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f0000ffffffffffffffffffffffffffffffff0011efbd90efbd81efbd93efbd9320f09f9491801cb406";
const OWN_PASSPHRASES = ["pässwörd", "TREZOR", "ｐａｓｓ 🔑"] as const;

/** Lists that a reader refuses (vectors/candidates-v1.json, "invalidLists"), and why. */
const REFUSED_LISTS: readonly (readonly [string, string, RegExp])[] = [
  [
    "a damaged record",
    "4d4e434c01001000000003010000000000000000000000000000007f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7fffffffffffffffffffffffffffffffff98854aa000",
    /CRC-32/u,
  ],
  [
    "version 2",
    "4d4e434c02001000000003000000000000000000000000000000007f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7ffffffffffffffffffffffffffffffffffe819f9000",
    /version 2/u,
  ],
  ["a byte too many", `${THREE_PHRASES_LIST}00`, /padding/u],
];

/**
 * Lengths before and after Padmé (vectors/candidates-v1.json, "padme"), computed again
 * independently with Python from the formula of docs/CANDIDATES.md.
 */
const PADME_LENGTHS: readonly (readonly [number, number])[] = [
  [100, 104],
  [4_097, 4_352],
  [8_388_623, 8_650_752],
];

/** The list of three phrases written and read, the padded lengths, and the lists refused. */
export function checkCandidateListStartup(): void {
  // Independent Python arithmetic for the maximum MNCL v1 fields, CRC and Padmé padding.
  expectSame(MAX_CANDIDATE_LIST_BYTES, 155_189_248, "Maximum candidate list bytes");
  OpenedCandidateList.assertSize(MAX_CANDIDATE_LIST_BYTES);
  expectRefused(
    () => OpenedCandidateList.assertSize(MAX_CANDIDATE_LIST_BYTES + 1),
    /supported limit/u,
    "An oversized candidate list",
  );
  const records = THREE_PHRASES_ENTROPY.map((entropy) => ({ entropy: bytesOfHex(entropy) }));
  // One above the unsigned byte range: neither a wide value nor its changed prototype may
  // silently become all-zero entropy through Uint8Array's copy constructor.
  const wider = new Uint16Array(defined(records[0]).entropy.length).fill(256);
  for (const [prototype, label] of [
    [Uint16Array.prototype, "Non-byte candidate entropy"],
    [Uint8Array.prototype, "Non-byte candidate entropy with a byte-array prototype"],
  ] as const) {
    Object.setPrototypeOf(wider, prototype);
    expectRefused(
      () => encodeCandidateList({ records: [{ entropy: wider as unknown as Uint8Array }] }),
      /one length/u,
      label,
    );
  }
  expectSame(hexOfBytes(encodeCandidateList({ records })), THREE_PHRASES_LIST, "Candidate list");
  const list = decodeCandidateList(bytesOfHex(THREE_PHRASES_LIST));
  expectSame(list.passphrase, undefined, "Candidate list passphrase");
  expectSame(
    list.records.map((record) => hexOfBytes(record.entropy)).join(" "),
    THREE_PHRASES_ENTROPY.join(" "),
    "Candidate list records",
  );
  for (const [length, padded] of PADME_LENGTHS)
    expectSame(padmeLength(length), padded, `Padmé length of ${length}`);
  for (const [name, bytes, because] of REFUSED_LISTS)
    expectRefused(() => decodeCandidateList(bytesOfHex(bytes)), because, `A list with ${name}`);
  expectSame(
    hexOfBytes(encodeCandidateList({ passphrase: LIST_PASSPHRASE, records })),
    LIST_PASSPHRASE_LIST,
    "Candidate list with a passphrase for all",
  );
  expectSame(
    decodeCandidateList(bytesOfHex(LIST_PASSPHRASE_LIST)).passphrase,
    LIST_PASSPHRASE,
    "Candidate list passphrase for all",
  );
  const opened = OpenedCandidateList.fromBytes(bytesOfHex(OWN_PASSPHRASES_LIST));
  expectSame(
    opened
      .candidates()
      .map((candidate) => candidate.passphrase)
      .join("|"),
    OWN_PASSPHRASES.join("|"),
    "Candidate list passphrase of each record",
  );
  opened.wipe();
}
