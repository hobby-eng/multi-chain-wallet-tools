// The self-test of the BIP39 seed rule and the master fingerprint (core/master-fingerprint.ts):
// what the host's PBKDF2 is asked for, the fingerprint of a published seed, the refusals, and, with
// the host's PBKDF2, the seeds of every English vector of BIP39. core/self-test.ts runs the quick
// part before every command of the command line and all of it in the full self-test.
//
// From the host it needs, for the full check only, its PBKDF2-HMAC-SHA512; the quick part gives
// published seeds in place of it, so that it needs nothing. It holds public test data, no secret.
//
// Host-neutral: it imports only core/master-fingerprint.ts and core/self-test-check.ts.

import { Bip39Seed, MasterFingerprintCheck, type Pbkdf2HmacSha512 } from "./master-fingerprint.js";
import {
  bytesOfHex,
  expectRefused,
  expectRefusedLater,
  expectSame,
  hexOfBytes,
} from "./self-test-check.js";

/** The public test phrase of all-zero entropy, the first BIP39 vector. */
export const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/** The passphrase of every BIP39 vector (trezor/python-mnemonic, vectors.json). */
export const VECTOR_PASSPHRASE = "TREZOR";
/** BIP39 "From mnemonic to seed": the salt is "mnemonic" and the passphrase, 2048 rounds, 64 bytes. */
const SEED_ROUNDS = 2048;
const SEED_BYTES = 64;
const SALT_PREFIX = "mnemonic";
/**
 * The seed of the public phrase with the passphrase TREZOR: the first BIP39 vector
 * (trezor/python-mnemonic, vectors.json).
 */
const TREZOR_SEED =
  "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04";
/**
 * The master fingerprint of that seed, whose master key is the vector's xprv9s21ZrQH143K3h3fDYia…:
 * computed independently with Python's hashlib and a plain secp256k1, which first reproduce that
 * xprv and the published keys of BIP84 and BIP86.
 */
const TREZOR_FINGERPRINT = "b4e3f5ed";
/**
 * The seed of the public phrase with an empty passphrase, computed independently with Python's
 * hashlib.pbkdf2_hmac, which first reproduces every English vector of BIP39.
 */
const PUBLIC_SEED =
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4";
/**
 * A passphrase beyond ASCII, Ünïcödé ﬁ パスワード with composed letters and the ligature ﬁ, and the
 * seed of the public phrase with it: computed with Python's hashlib and unicodedata (NFKD, then
 * UTF-8), which first reproduce the published TREZOR seed of the public phrase.
 */
const UNICODE_PASSPHRASE = "\u00dcn\u00efc\u00f6d\u00e9 \ufb01 \u30d1\u30b9\u30ef\u30fc\u30c9";
const UNICODE_PASSPHRASE_SEED =
  "44bc81fa7507a9b6d45ea4c5e011daaec62aa41bfc00e123b271dabd34c6f8fec7dbf5638eade336155e9fd229257cf328ad8368cb2c17f69d5582ab2403c935";

/** A passphrase written with é composed (U+00E9), and the NFKD salt that BIP39 hashes for it. */
const COMPOSED_PASSPHRASE = "caf\u00e9";
const DECOMPOSED_SALT = "mnemoniccafe\u0301";

/**
 * The English vectors of BIP39 (trezor/python-mnemonic, vectors.json, as rust-bitcoin's bip39
 * crate and other implementations carry them): each phrase, and its seed with the passphrase
 * TREZOR.
 */
const BIP39_VECTORS: readonly (readonly [string, string])[] = [
  [
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
  ],
  [
    "legal winner thank year wave sausage worth useful legal winner thank yellow",
    "2e8905819b8723fe2c1d161860e5ee1830318dbf49a83bd451cfb8440c28bd6fa457fe1296106559a3c80937a1c1069be3a3a5bd381ee6260e8d9739fce1f607",
  ],
  [
    "letter advice cage absurd amount doctor acoustic avoid letter advice cage above",
    "d71de856f81a8acc65e6fc851a38d4d7ec216fd0796d0a6827a3ad6ed5511a30fa280f12eb2e47ed2ac03b5c462a0358d18d69fe4f985ec81778c1b370b652a8",
  ],
  [
    "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong",
    "ac27495480225222079d7be181583751e86f571027b0497b5b5d11218e0a8a13332572917f0f8e5a589620c6f15b11c61dee327651a14c34e18231052e48c069",
  ],
  [
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon agent",
    "035895f2f481b1b0f01fcf8c289c794660b289981a78f8106447707fdd9666ca06da5a9a565181599b79f53b844d8a71dd9f439c52a3d7b3e8a79c906ac845fa",
  ],
  [
    "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal will",
    "f2b94508732bcbacbcc020faefecfc89feafa6649a5491b8c952cede496c214a0c7b3c392d168748f2d4a612bada0753b52a1c7ac53c1e93abd5c6320b9e95dd",
  ],
  [
    "letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter always",
    "107d7c02a5aa6f38c58083ff74f04c607c2d2c0ecc55501dadd72d025b751bc27fe913ffb796f841c49b1d33b610cf0e91d3aa239027f5e99fe4ce9e5088cd65",
  ],
  [
    "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo when",
    "0cd6e5d827bb62eb8fc1e262254223817fd068a74b5b449cc2f667c3f1f985a76379b43348d952e2265b4cd129090758b3e3c2c49103b5051aac2eaeb890a528",
  ],
  [
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art",
    "bda85446c68413707090a52022edd26a1c9462295029f2e60cd7c4f2bbd3097170af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8",
  ],
  [
    "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title",
    "bc09fca1804f7e69da93c2f2028eb238c227f2e9dda30cd63699232578480a4021b146ad717fbb7e451ce9eb835f43620bf5c514db0f8add49f5d121449d3e87",
  ],
  [
    "letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless",
    "c0c519bd0e91a2ed54357d9d1ebef6f5af218a153624cf4f2da911a0ed8f7a09e2ef61af0aca007096df430022f7a2b6fb91661a9589097069720d015e4e982f",
  ],
  [
    "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote",
    "dd48c104698c30cfe2b6142103248622fb7bb0ff692eebb00089b32d22484e1613912f0a5b694407be899ffd31ed3992c456cdf60f5d4564b8ba3f05a69890ad",
  ],
  [
    "ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic",
    "274ddc525802f7c828d8ef7ddbcdc5304e87ac3535913611fbbfa986d0c9e5476c91689f9c8a54fd55bd38606aa6a8595ad213d4c9c9f9aca3fb217069a41028",
  ],
  [
    "gravity machine north sort system female filter attitude volume fold club stay feature office ecology stable narrow fog",
    "628c3827a8823298ee685db84f55caa34b5cc195a778e52d45f59bcf75aba68e4d7590e101dc414bc1bbd5737666fbbef35d1f1903953b66624f910feef245ac",
  ],
  [
    "hamster diagram private dutch cause delay private meat slide toddler razor book happy fancy gospel tennis maple dilemma loan word shrug inflict delay length",
    "64c87cde7e12ecf6704ab95bb1408bef047c22db4cc7491c4271d170a1b213d20b385bc1588d9c7b38f1b39d415665b8a9030c9ec653d75e65f847d8fc1fc440",
  ],
  [
    "scheme spot photo card baby mountain device kick cradle pact join borrow",
    "ea725895aaae8d4c1cf682c1bfd2d358d52ed9f0f0591131b559e2724bb234fca05aa9c02c57407e04ee9dc3b454aa63fbff483a8b11de949624b9f1831a9612",
  ],
  [
    "horn tenant knee talent sponsor spell gate clip pulse soap slush warm silver nephew swap uncle crack brave",
    "fd579828af3da1d32544ce4db5c73d53fc8acc4ddb1e3b251a31179cdb71e853c56d2fcb11aed39898ce6c34b10b5382772db8796e52837b54468aeb312cfc3d",
  ],
  [
    "panda eyebrow bullet gorilla call smoke muffin taste mesh discover soft ostrich alcohol speed nation flash devote level hobby quick inner drive ghost inside",
    "72be8e052fc4919d2adf28d5306b5474b0069df35b02303de8c1729c9538dbb6fc2d731d5f832193cd9fb6aeecbc469594a70e3dd50811b5067f3b88b28c3e8d",
  ],
  [
    "cat swing flag economy stadium alone churn speed unique patch report train",
    "deb5f45449e615feff5640f2e49f933ff51895de3b4381832b3139941c57b59205a42480c52175b6efcffaa58a2503887c1e8b363a707256bdd2b587b46541f5",
  ],
  [
    "light rule cinnamon wrap drastic word pride squirrel upgrade then income fatal apart sustain crack supply proud access",
    "4cbdff1ca2db800fd61cae72a57475fdc6bab03e441fd63f96dabd1f183ef5b782925f00105f318309a7e9c3ea6967c7801e46c8a58082674c860a37b93eda02",
  ],
  [
    "all hour make first leader extend hole alien behind guard gospel lava path output census museum junior mass reopen famous sing advance salt reform",
    "26e975ec644423f4a4c4f4215ef09b4bd7ef924e85d1d17c4cf3f136c2863cf6df0a475045652c57eb5fb41513ca2a2d67722b77e954b4b3fc11f7590449191d",
  ],
  [
    "vessel ladder alter error federal sibling chat ability sun glass valve picture",
    "2aaa9242daafcee6aa9d7269f17d4efe271e1b9a529178d7dc139cd18747090bf9d60295d0ce74309a78852a9caadf0af48aae1c6253839624076224374bc63f",
  ],
  [
    "scissors invite lock maple supreme raw rapid void congress muscle digital elegant little brisk hair mango congress clump",
    "7b4a10be9d98e6cba265566db7f136718e1398c71cb581e1b2f464cac1ceedf4f3e274dc270003c670ad8d02c4558b2f8e39edea2775c9e232c7cb798b069e88",
  ],
  [
    "void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing screen patrol group space point ten exist slush involve unfold",
    "01f5bced59dec48e362f2c45b5de68b9fd6c92c6634f44d6d40aab69056506f0e35524a518034ddc1192e1dacd32c1ed3eaa3c3b131c88ed8e7e54c49a5d0998",
  ],
];
/** How many BIP39 vectors the full check compares, for the report. */
export const BIP39_VECTOR_COUNT = BIP39_VECTORS.length;

/**
 * A PBKDF2 for the quick checks: it answers each request that `expected` lists with its published
 * seed, a fresh copy that the caller may wipe, and refuses any other, so that a request with
 * another phrase, salt, round count or length fails the check.
 */
function publishedSeeds(
  expected: readonly { readonly phrase: string; readonly salt: string; readonly seed: string }[],
): Pbkdf2HmacSha512 {
  return (password, salt, rounds, bytes) => {
    const known = expected.find((entry) => entry.phrase === password && entry.salt === salt);
    if (known === undefined || rounds !== SEED_ROUNDS || bytes !== SEED_BYTES)
      throw new Error("The BIP39 seed was asked for with other parameters.");
    return bytesOfHex(known.seed);
  };
}

/**
 * A PBKDF2 for quick checks that answers the published seeds of the public phrase, without a
 * passphrase or with TREZOR, and refuses every other request: the wallet and coin checks derive
 * from it without the host's PBKDF2.
 */
export const PUBLIC_PHRASE_SEEDS: Pbkdf2HmacSha512 = publishedSeeds([
  { phrase: PUBLIC_MNEMONIC, salt: SALT_PREFIX, seed: PUBLIC_SEED },
  { phrase: PUBLIC_MNEMONIC, salt: `${SALT_PREFIX}${VECTOR_PASSPHRASE}`, seed: TREZOR_SEED },
]);

/** The same, and the TREZOR seed for the decomposed salt: whether the salt arrives in NFKD. */
const NFKD_SEEDS = publishedSeeds([
  { phrase: PUBLIC_MNEMONIC, salt: `${SALT_PREFIX}${VECTOR_PASSPHRASE}`, seed: TREZOR_SEED },
  { phrase: PUBLIC_MNEMONIC, salt: DECOMPOSED_SALT, seed: TREZOR_SEED },
]);

/**
 * The quick known answers: the fingerprint of the first BIP39 vector from its published seed, the
 * NFKD salt, and the refusals of a phrase of no BIP39 length, of a host that gives a seed of
 * another length, and of a fingerprint that is not the phrase's.
 */
export function checkMasterFingerprintStartup(): void {
  const fingerprints = new MasterFingerprintCheck(NFKD_SEEDS);
  expectSame(
    fingerprints.fingerprint(PUBLIC_MNEMONIC, VECTOR_PASSPHRASE),
    TREZOR_FINGERPRINT,
    "Master fingerprint of the first BIP39 vector",
  );
  expectSame(
    fingerprints.match(PUBLIC_MNEMONIC, TREZOR_FINGERPRINT.toUpperCase(), VECTOR_PASSPHRASE)
      .matched,
    true,
    "Master fingerprint match",
  );
  expectSame(
    fingerprints.match(PUBLIC_MNEMONIC, "00000000", VECTOR_PASSPHRASE).matched,
    false,
    "Master fingerprint of another wallet",
  );
  // The stub answers only the NFKD salt: a composed é passed on unchanged would be refused.
  expectSame(
    fingerprints.fingerprint(PUBLIC_MNEMONIC, COMPOSED_PASSPHRASE),
    TREZOR_FINGERPRINT,
    "NFKD passphrase of the BIP39 seed",
  );
  expectRefused(
    () => fingerprints.fingerprint(PUBLIC_MNEMONIC.replace(/ about$/u, "")),
    /Invalid mnemonic/u,
    "A phrase of eleven words",
  );
  expectRefused(
    () => new Bip39Seed(() => new Uint8Array(SEED_BYTES / 2)).now(PUBLIC_MNEMONIC, ""),
    /gave 32 bytes/u,
    "A host seed of 32 bytes",
  );
  expectRefused(
    () => fingerprints.match(PUBLIC_MNEMONIC, "73c5da0", VECTOR_PASSPHRASE),
    /eight hexadecimal/u,
    "A fingerprint of seven characters",
  );
}

/**
 * Every check: the quick ones, and with the host's PBKDF2 the seed of every English BIP39 vector,
 * the seed of the public phrase without a passphrase, which a wrong passphrase must not give, and
 * with a passphrase beyond ASCII.
 */
export async function checkMasterFingerprint(pbkdf2?: Pbkdf2HmacSha512): Promise<void> {
  checkMasterFingerprintStartup();
  if (pbkdf2 === undefined) return;
  const seeds = new Bip39Seed(pbkdf2);
  for (const [mnemonic, seed] of BIP39_VECTORS) {
    const derived = await seeds.later(mnemonic, VECTOR_PASSPHRASE);
    try {
      expectSame(hexOfBytes(derived), seed, "BIP39 seed vector");
    } finally {
      derived.fill(0);
    }
  }
  const withoutPassphrase = await seeds.later(PUBLIC_MNEMONIC, "");
  try {
    expectSame(hexOfBytes(withoutPassphrase), PUBLIC_SEED, "BIP39 seed without a passphrase");
  } finally {
    withoutPassphrase.fill(0);
  }
  // Whether the host's PBKDF2 takes the salt as UTF-8, which only a passphrase beyond ASCII shows.
  const unicode = await seeds.later(PUBLIC_MNEMONIC, UNICODE_PASSPHRASE);
  try {
    expectSame(hexOfBytes(unicode), UNICODE_PASSPHRASE_SEED, "BIP39 seed of a Unicode passphrase");
  } finally {
    unicode.fill(0);
  }
  await expectRefusedLater(
    () => seeds.later(PUBLIC_MNEMONIC.replace(/ about$/u, ""), ""),
    /Invalid mnemonic/u,
    "A phrase of eleven words",
  );
}
