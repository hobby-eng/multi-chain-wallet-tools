// The self-test of the encryption of candidate lists (core/candidate-encryption.ts,
// docs/CANDIDATES.md, "Encryption"): the published age files opened with the public test key and
// passphrase, a file to two keys and one at another work factor refused, one changed by a byte or
// opened with another key refused, and a list encrypted here opened again. All but the file with
// the passphrase are quick (checkCandidateEncryptionQuick), which a host may run at its start; the
// scrypt of the passphrase is slow, so the whole check runs only in the full self-test
// (core/self-test.ts).
//
// From the host it needs what candidate-encryption.ts needs: crypto.getRandomValues and WebCrypto.
// It holds public test keys and data, no secret.
//
// Host-neutral: it imports only core/candidate-encryption.ts, core/candidate-list.ts and their
// self-test modules.

import {
  CandidateFileRefusedError,
  createSessionIdentity,
  decryptCandidates,
  encryptCandidates,
  listFileLock,
  type CandidateFileProblem,
} from "./candidate-encryption.js";
import { THREE_PHRASES_LIST } from "./candidate-list-self-test.js";
import {
  bytesOfHex,
  expectRefused,
  expectRefusedLater,
  expectSame,
  hexOfBytes,
} from "./self-test-check.js";
import { CandidateFileAdmission } from "./candidate-file-admission.js";
import { defined } from "./defined.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.candidate-encryption-self-test", {
  "refused-another-reason": () => "refused for another reason",
  "malformed-identity-reached-diagnostics": () => "A malformed identity reached diagnostics",
});

/**
 * `open` refused as a CandidateFileRefusedError with `problem` and a message that `because`
 * matches; a refusal of another class or problem is another reason.
 */
function expectFileRefused(
  open: () => Promise<unknown>,
  problem: CandidateFileProblem,
  because: RegExp,
  name: string,
): Promise<void> {
  return expectRefusedLater(
    async () => {
      try {
        await open();
      } catch (error) {
        if (error instanceof CandidateFileRefusedError && error.code === problem) throw error;
        throw ERRORS.create("refused-another-reason", []);
      }
    },
    because,
    name,
  );
}

/**
 * vectors/candidates-v1.json, "age": a public test key and passphrase, never for anything real,
 * and the files that age-encryption 0.3.1 wrote once with them, each holding the list of three
 * phrases. Both files were opened again independently with Python's cryptography and hashlib.
 */
const TEST_IDENTITY = "AGE-SECRET-KEY-1J3DXH7J0XJ7HDQ5KT55PD474ZU2S9E0X7N37UZERQSWG4H3Q8NASPUWJ89";
const TEST_PASSPHRASE = "public candidate test passphrase";
const TO_THE_SESSION_KEY =
  "6167652d656e6372797074696f6e2e6f72672f76310a2d3e20583235353139206136356439553562555137474f6b35622b3652746b5963424f494650435a54716561665571764e5a4a326f0a54557678394c374742754f746a473346792f4b454f4c2b526344612f613971456c4b41552f517155306e630a2d2d2d204e363162377937377063536b6654314e34384a7177506c6b516b74723268432f71355856665a6f446275380ac627d2859a80b6da35a28846ac0b28c759492f215288a81f00fab74592a8ad30661a38e24bea23b0471d1eee33c7f03509aed8e68eab614d0fa3655102bc25272799f15a1203ceca9dcd57dc00caff920523cac73e2cac07876a7c7ea4e2c8c8";
const WITH_THE_PASSPHRASE =
  "6167652d656e6372797074696f6e2e6f72672f76310a2d3e20736372797074205870525a634577686a5772633579485174772b6843672031380a3273444e75712f66773558356f2b6169326c5244557844733753335a374b3335357a584c58536b2b4a68490a2d2d2d20756e415248654a6f756e436f303350616e58692b733030795239624e7976426849544249617250726465730a2c9d8c5ab6187d40f723d29b32b3e7a700040053411d2ab9923f2ceb2f4f9b24db3c85a38bacab3e6739f621f9b36803f0fb1114f6d9b29ddebf067e976c78439064dda175a4b27e25da4b6ba415caa4bc4128dd532df80e73545c2e5e9f29ab";
/**
 * Files that a reader refuses ("refuse"): to the session key and a second one, and scrypt at 16.
 */
const TO_TWO_KEYS =
  "6167652d656e6372797074696f6e2e6f72672f76310a2d3e20583235353139207161526c654541674e686b486a48706e634f4b624f51516e586d5570323837684572485a53484f42766e550a5a5634345857336f696e50666f394e4d4d506e5a446d7a4c6f552f6549434448614957584f32724f776c410a2d3e2058323535313920745a7472634f306274396c5466463549635238442f2b5958696c42687a75736a79447163652f55727643490a787542476b7342447658657430387266474e53514b67386e4a463064505242323636447441414e57676f380a2d2d2d206d574c39642f4a3873442f2f743251574a7a2f522f505555736b4152486d2f73643530304f4d476f4458550ab7c08cf5243c795f7035d4f881b7c460b23040a088fd25903e24b0afa075ff11188d2bfdc1dc5d61fbba8c14a6dc43696167c21a1cad40ba1099e25edacce5daf085a909d538347a257cae085ae7efc3a2a5776bc3d3f3a69029cfe19f09ee58";
const SCRYPT_WORK_FACTOR_16 =
  "6167652d656e6372797074696f6e2e6f72672f76310a2d3e2073637279707420614d4a6152324771436b374170506164695665374d672031360a755157313975444d6d374143356566516442306639436d637673317542426a4a43412b364a76766b2b6c630a2d2d2d204c71354e462f35396b5476666f2b74544b3730474c4b625033574f65472f74614d4d3678446f7a68694a510adb9d94bc3bcfdec5b7f0c9a34c398ceabaeff4cf8edad31c4a5520b9625fecfd7d9e244681d0db65b5b344fc209bda3587dafe5b4dcef06f6f0cae8f10c406e7bb4cb1166ff33db277bf3a3bcbf32bc0e187ac4d7af32e3a0b878a47f67ab813";

/** The file with its last byte changed: a byte of the encrypted list, which age authenticates. */
function changedLastByte(hex: string): Uint8Array {
  const bytes = bytesOfHex(hex);
  bytes[bytes.length - 1] = defined(bytes[bytes.length - 1]) ^ 1;
  return bytes;
}

/**
 * The quick checks, without scrypt: the published file to the session key opened, the files to
 * two keys and at another work factor refused before any scrypt, one changed by a byte refused,
 * and a list encrypted to a one-time key opened again with it but not with another. Asynchronous,
 * since WebCrypto answers later; it needs crypto.getRandomValues and WebCrypto.
 */
export async function checkCandidateEncryptionQuick(): Promise<void> {
  // Independent Python arithmetic: maximum MNCL v1 bytes plus the age v1 STREAM framing.
  const admission = CandidateFileAdmission.parameters();
  expectSame(admission.headerBytes, 65_536, "Maximum age header prefix bytes");
  expectSame(admission.encryptedBytes, 155_292_688, "Maximum encrypted candidate file bytes");
  expectSame(listFileLock(bytesOfHex(WITH_THE_PASSPHRASE)), "passphrase", "A scrypt header");
  expectRefused(
    () => CandidateFileAdmission.assertSize(admission.encryptedBytes + 1, "age"),
    /supported limit/u,
    "An oversized encrypted candidate file",
  );
  const identity = { identity: TEST_IDENTITY };
  const malformed = `${TEST_IDENTITY.slice(0, -1)}A`;
  await expectFileRefused(
    async () => {
      try {
        await decryptCandidates(bytesOfHex(TO_THE_SESSION_KEY), { identity: malformed });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message.includes(malformed) ||
          error.cause !== undefined
        )
          throw ERRORS.create("malformed-identity-reached-diagnostics", []);
        throw error;
      }
    },
    "key",
    /not a valid age identity/u,
    "A malformed Scanner identity",
  );
  expectSame(
    hexOfBytes(await decryptCandidates(bytesOfHex(TO_THE_SESSION_KEY), identity)),
    THREE_PHRASES_LIST,
    "Candidate file to the session key",
  );
  await expectFileRefused(
    () => decryptCandidates(bytesOfHex(TO_TWO_KEYS), identity),
    "unsupported",
    /exactly one X25519 recipient/u,
    "A candidate file to two keys",
  );
  await expectFileRefused(
    () => decryptCandidates(bytesOfHex(SCRYPT_WORK_FACTOR_16), { passphrase: TEST_PASSPHRASE }),
    "unsupported",
    /scrypt work factor 18/u,
    "A candidate file at the scrypt work factor 16",
  );
  // The words of age-encryption 0.3.1: the Poly1305 tag of the changed chunk does not fit.
  await expectFileRefused(
    () => decryptCandidates(changedLastByte(TO_THE_SESSION_KEY), identity),
    "damaged",
    /invalid tag/u,
    "A candidate file changed by a byte",
  );
  const session = await createSessionIdentity();
  const encrypted = await encryptCandidates(bytesOfHex(THREE_PHRASES_LIST), session.recipient);
  expectSame(
    hexOfBytes(await decryptCandidates(encrypted, { identity: session.identity })),
    THREE_PHRASES_LIST,
    "Candidate file encrypted to a one-time key",
  );
  await expectFileRefused(
    () => decryptCandidates(encrypted, identity),
    "key",
    /no identity matched/u,
    "A candidate file opened with another key",
  );
}

/** Every check: the quick ones, and the published file opened with the passphrase (scrypt). */
export async function checkCandidateEncryption(): Promise<void> {
  await checkCandidateEncryptionQuick();
  expectSame(
    hexOfBytes(
      await decryptCandidates(bytesOfHex(WITH_THE_PASSPHRASE), { passphrase: TEST_PASSPHRASE }),
    ),
    THREE_PHRASES_LIST,
    "Candidate file with the passphrase",
  );
}
