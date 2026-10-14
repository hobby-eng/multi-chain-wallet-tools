// Checks the embedded MHFE 0.6.0 browser package with Node: suite MHFE-BIP39-256-EXPERIMENTAL-3 for
// 24-word containers, MHFE-BIP39-LP-EXPERIMENTAL-4 for containers of the phrase's own length, and
// the repair, wallet and password modules, all with public vectors.
//
//   node tooling/verify-mhfe-vector.mjs          a few seconds, reduced Argon2 cost
//   node tooling/verify-mhfe-vector.mjs --full   also the full-size public vectors (2 GiB, minutes)
//
// It runs the vendored WebAssembly and the vendored single-threaded Argon2 build exactly as the
// page's worker does. The fast check lowers the Argon2 cost in a wrapper; each container must then
// equal the one the mhfe repository's own tests give at that cost (REDUCED_COST_CONTAINER and
// REDUCED_COST_SAME_LENGTH_CONTAINER in mhfe/src/mhfe.rs). The full check reproduces the published
// zero-12 vectors of suites 3 and 4.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDirectory = resolve(root, "packages/recovery-mhfe-wasm/generated");
const read = (path) => readFileSync(resolve(packageDirectory, path));
const encode = (text) => new TextEncoder().encode(text);
const noBytes = () => new Uint8Array();

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = encode("public test password");
/** The master key fingerprint of PHRASE without a passphrase (BIP32 test vectors). */
const PHRASE_FINGERPRINT = "73c5da0a";
/** Four Argon2 lanes need at least 32 KiB; 256 KiB and one pass match the mhfe unit tests. */
const REDUCED_MEMORY_KIB = 256;
const REDUCED_PASSES = 1;
const REDUCED_COST_CONTAINER =
  "slush crime nose carry menu cabbage already cart lock intact focus siren filter crouch buyer toward topple cup holiday avoid mango envelope dream sweet";
const REDUCED_COST_SAME_LENGTH_CONTAINER =
  "program adjust rain raven flip eternal spider bulb under soup enrich ensure";
/** The published zero-12 vectors: the same phrase and password at the suite defaults. */
const FULL_SIZE_CONTAINER =
  "donate stove tower picnic iron rescue trick shrimp roof rib home cigar bag pledge also nerve cycle famous provide heart ahead chunk caution peace";
const FULL_SIZE_SAME_LENGTH_CONTAINER =
  "renew alert there knife dose allow fashion casino kiwi lens sister bless";
/**
 * The master key fingerprint of FULL_SIZE_CONTAINER read as a wallet of its own, without a
 * passphrase: the one the page shows under the container (mhfe's zero-12 vector).
 */
const FULL_SIZE_CONTAINER_FINGERPRINT = "487a156e";
/** Repair words of FULL_SIZE_CONTAINER, from an independent implementation (mhfe/src/repair.rs). */
const FULL_SIZE_REPAIR_WORDS = "shaft pupil patient jewel";
/** Passes the wallet check with "TREZOR" (TREZOR_COUNTER in mhfe/src/wallet_check.rs). */
const WALLET_CHECKED_PHRASE = `${"abandon ".repeat(21)}above proof fatigue`;
const FULL_SUITE = "MHFE-BIP39-256-EXPERIMENTAL-3";
const SAME_LENGTH_SUITE = "MHFE-BIP39-LP-EXPERIMENTAL-4";
/** The page's own limits, which must equal the package's: the PIM inputs' max and memory level 0. */
const PAGE_MAX_PIM = 1023;
const PAGE_MEMORY_LEVEL = 0;

const manifest = JSON.parse(read("modules.json").toString());

// The worker script defines `mhfe`, the bindings of every module, and the Argon2 bridge; its
// message handler is not used here. Under Node the Emscripten build takes the Node path, which
// reads `require` and `__dirname` as a CommonJS script would find them; it reads no file, because
// its WebAssembly is embedded.
globalThis.self = {};
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = resolve(packageDirectory, "core");
vm.runInThisContext(read("runtime/worker.js").toString(), { filename: "worker.js" });
vm.runInThisContext(read("core/argon2-st.js").toString(), { filename: "argon2-st.js" });
const mhfe = vm.runInThisContext("mhfe");
const argon2Engine = vm.runInThisContext("argon2Engine");
const createArgon2St = vm.runInThisContext("createArgon2St");
mhfe.initSync({ module: read("runtime/mhfe.wasm") });

const parameters = JSON.parse(mhfe.suiteParameters());
assert.equal(parameters.version, manifest.version, "the package reports its release version");
assert.equal(mhfe.packageVersion(), manifest.version);
assert.equal(parameters.apiVersion, undefined, "the release version replaced the API counter");
assert.equal(parameters.suiteId, FULL_SUITE);
assert.equal(parameters.sameLengthSuiteId, SAME_LENGTH_SUITE);
assert.equal(parameters.maxPim, PAGE_MAX_PIM);
assert.equal(parameters.highestBrowserMemoryLevel, PAGE_MEMORY_LEVEL);

const engine = argon2Engine(await createArgon2St());
/** The suite defaults that both suites share with suite 3: 2 GiB and 12 passes. */
const SUITE_MEMORY_KIB = 2097152;
const SUITE_PASSES = 12;
let suiteCalls = 0;
const reduced = {
  derive: (password, salt, memoryKib, passes, key) => {
    // Since 0.6.0 the core checks its Argon2 build with a known answer at 1 MiB before its first
    // round and after its last; that call runs as asked. Only the rounds' calls are reduced.
    if (memoryKib !== SUITE_MEMORY_KIB || passes !== SUITE_PASSES) {
      engine.derive(password, salt, memoryKib, passes, key);
      return;
    }
    suiteCalls += 1;
    engine.derive(password, salt, REDUCED_MEMORY_KIB, REDUCED_PASSES, key);
  },
};

/** Encrypts the test phrase with repair words; the arguments are positional in the bindings. */
function encrypt(argon2, sameLength, repairWordCount = 0) {
  return JSON.parse(
    // Since 0.6.0 the bindings take every secret phrase as UTF-8 bytes, which they wipe.
    mhfe.encrypt(
      encode(PHRASE),
      PASSWORD,
      PASSWORD.slice(),
      "",
      0,
      0,
      PAGE_MEMORY_LEVEL,
      sameLength,
      repairWordCount,
      false,
      argon2,
      () => {},
      () => {},
    ),
  );
}

function decrypt(container) {
  return JSON.parse(
    mhfe.decrypt(container, PASSWORD, "", 0, 0, PAGE_MEMORY_LEVEL, 0, noBytes(), reduced, () => {}),
  );
}

for (const [sameLength, expected, suiteId, status] of [
  [false, REDUCED_COST_CONTAINER, FULL_SUITE, "verified"],
  // A same-length container has no built-in check, so its recovery is never verified.
  [true, REDUCED_COST_SAME_LENGTH_CONTAINER, SAME_LENGTH_SUITE, "noBuiltInCheck"],
]) {
  const made = encrypt(reduced, sameLength, 4);
  assert.equal(made.container, expected, "the embedded package gives the reference container");
  assert.equal(made.suiteId, suiteId);
  assert.equal(made.repairWords.split(" ").length, 4);
  assert.equal(made.repairProfile, "MHFE-REPAIR-1");
  assert.deepEqual(made.keep.at(-1), { item: "repairWords" });
  const recovery = decrypt(made.container);
  assert.equal(recovery.kind, "phrase");
  assert.deepEqual(
    [recovery.candidates[0].phrase, recovery.candidates[0].status],
    [PHRASE, status],
  );
  assert.equal(recovery.candidates[0].fingerprintWithoutPassphrase, PHRASE_FINGERPRINT);
}

assert.deepEqual(JSON.parse(mhfe.repairWords(FULL_SIZE_CONTAINER, 4)), {
  profile: "MHFE-REPAIR-1",
  words: FULL_SIZE_REPAIR_WORDS,
  repairsUnreadable: 4,
  repairsWrong: 2,
});
const written = FULL_SIZE_CONTAINER.split(" ");
written[2] = "?";
written[16] = "?";
const repaired = JSON.parse(mhfe.repairContainer(written.join(" "), FULL_SIZE_REPAIR_WORDS));
assert.equal(repaired.container, FULL_SIZE_CONTAINER);
assert.deepEqual(repaired.containerWords, [3, 17]);

// A container phrase as typed, and the search for words marked ? without the repair words.
const markedAt = (...places) =>
  FULL_SIZE_CONTAINER.split(" ")
    .map((word, index) => (places.includes(index + 1) ? "?" : word))
    .join(" ");
const reading = (text) => JSON.parse(mhfe.inspectContainer(text));
assert.deepEqual(reading(FULL_SIZE_CONTAINER), {
  reading: "container",
  wordCount: 24,
  unreadable: [],
});
assert.deepEqual(reading(markedAt(3, 17)), {
  reading: "marked",
  wordCount: 24,
  unreadable: [3, 17],
});
// Another valid word in place of the first fails the container's checksum.
assert.equal(
  reading(["abandon", ...FULL_SIZE_CONTAINER.split(" ").slice(1)].join(" ")).reading,
  "notAContainer",
);
assert.equal(reading(FULL_SIZE_CONTAINER.split(" ").slice(0, 5).join(" ")).reading, "wrongLength");
// One missing word: every search applies; two: only the container's own wallet (the library's
// ContainerSearch, which the Deriver reads instead of deciding itself).
assert.deepEqual(JSON.parse(mhfe.searchCandidates(markedAt(24))), {
  missing: [24],
  candidates: 8,
  offersWalletSearch: true,
  offersOwnChecks: true,
});
assert.deepEqual(
  (({ offersWalletSearch, offersOwnChecks }) => ({ offersWalletSearch, offersOwnChecks }))(
    JSON.parse(mhfe.searchCandidates(markedAt(5, 16))),
  ),
  { offersWalletSearch: false, offersOwnChecks: false },
);
/** The default scan gap of a two-word decoy search, the package's own value. */
const DECOY_SCAN_GAP = parameters.decoyScanGap;
assert.equal(DECOY_SCAN_GAP, 20, "the usual 20 addresses of a wallet");
const decoySearch = (fingerprint, passphrase = noBytes()) =>
  JSON.parse(
    mhfe.searchDecoy(
      markedAt(24),
      "fingerprint",
      fingerprint,
      "",
      "",
      passphrase,
      DECOY_SCAN_GAP,
      () => {},
    ),
  );
const found = decoySearch(FULL_SIZE_CONTAINER_FINGERPRINT);
assert.deepEqual(
  [found.found, found.container, found.words],
  [true, FULL_SIZE_CONTAINER, [{ position: 24, word: "peace" }]],
);
// The search can fail: another wallet's fingerprint finds no candidate.
assert.equal(decoySearch(PHRASE_FINGERPRINT).found, false);
// The container's own wallet is compared with exactly the passphrase given: one the container
// phrase is not used with finds nothing (mhfe's final search, 2026-10-08).
assert.equal(decoySearch(FULL_SIZE_CONTAINER_FINGERPRINT, encode("TREZOR")).found, false);
// The search with the owner's wallet recovers every candidate, so it looks for one word only.
assert.throws(
  () =>
    mhfe.searchWallet(
      markedAt(3, 24),
      PASSWORD.slice(),
      "asTyped",
      0,
      0,
      PAGE_MEMORY_LEVEL,
      "builtInCheck",
      "",
      "",
      "",
      noBytes(),
      reduced,
      () => {},
      () => {},
    ),
  /TOO_MANY_MISSING_WORDS/u,
);
// The Deriver's own generator holds copies of MHFE's limits of wishes, since it also runs in builds
// without MHFE (packages/crypto-core/src/bip39-chosen-words.ts): each pair must stay equal.
const chosenWordsSource = readFileSync(
  resolve(root, "packages/crypto-core/src/bip39-chosen-words.ts"),
  "utf8",
);
const walletParameters = JSON.parse(mhfe.walletParameters());
for (const [deriver, package_] of [
  ["MOST_CHOSEN_WORDS", "maxChosenWords"],
  ["MOST_NEVER_USE_WORDS", "maxNeverUseWords"],
]) {
  const copy = Number(
    new RegExp(`^export const ${deriver} = (\\d+);$`, "mu").exec(chosenWordsSource)?.[1],
  );
  assert.equal(
    walletParameters[package_],
    copy,
    `the Deriver's ${deriver} equals MHFE's ${package_}`,
  );
}
assert.equal(mhfe.walletFingerprint(encode(PHRASE), noBytes()), PHRASE_FINGERPRINT);
assert.equal(mhfe.walletCheck(encode(WALLET_CHECKED_PHRASE), encode("TREZOR")), true);
assert.equal(mhfe.walletCheck(encode(WALLET_CHECKED_PHRASE), encode("trezor")), false);
assert.ok(suiteCalls > 0, "the rounds asked for the suite defaults");
console.log(
  `Verified the embedded MHFE ${manifest.version} package: suites 3 and 4 at reduced cost, repair words, ` +
    "container phrase repair, the search for missing words, the wallet check, fingerprints and the limits of a new phrase's wishes.",
);

if (process.argv.includes("--full")) {
  assert.equal(encrypt(engine, false).container, FULL_SIZE_CONTAINER);
  assert.equal(encrypt(engine, true).container, FULL_SIZE_SAME_LENGTH_CONTAINER);
  // Two missing words by an address of the container's own wallet, its first 20 receiving and
  // change addresses: minutes in WebAssembly, one candidate after another (mhfe's regression; the
  // address is nested SegWit at m/49'/0'/0'/0/9 of FULL_SIZE_CONTAINER, derived independently).
  const twoMissing = JSON.parse(
    mhfe.searchDecoy(
      markedAt(5, 16),
      "address",
      "3FWJwUxDaXoGrxZQHT4EHBDZCZw7iHUaRn",
      "bitcoin",
      "",
      noBytes(),
      DECOY_SCAN_GAP,
      () => {},
    ),
  );
  assert.deepEqual(
    [twoMissing.found, twoMissing.words, twoMissing.path],
    [
      true,
      [
        { position: 5, word: "iron" },
        { position: 16, word: "nerve" },
      ],
      "m/49'/0'/0'/0/9",
    ],
  );
  console.log(
    `Verified the embedded MHFE ${manifest.version} package against the published full-size zero-12 vectors of suites 3 and 4, and two missing words found by an address of the container's own wallet.`,
  );
}
PASSWORD.fill(0);
