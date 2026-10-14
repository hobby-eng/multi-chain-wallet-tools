// AUD-023 selftests: recomputes a sample of the startup and full self-test known answers with an
// independent implementation. It uses only node:crypto (OpenSSL), node:zlib and BigInt arithmetic
// written here; it imports no product code and none of the product's crypto libraries (noble,
// scure, btcutil-js, age-encryption, ethers). Public data only: published vectors, the private
// key 1, BIP38's and BIP-322's published test keys, "abandon ... about", the candidate list's
// test key that the product itself embeds.
//
// For every value it also checks that the product source still pins exactly that literal, so a
// pass means "the product's literal equals an independent computation".
//
// Adapted during the AUD-023 remediation: each coin's signing and BIP38 literals are looked for in
// that coin's own module (AUD-023-BLD001), and the SSKR check restores the grouped BCR-2020-011
// vector (AUD-023-FUN004) per group and then across groups.
//
// Run from the repository root: node docs/audits/AUD-023-harnesses/selftests-independent-vectors.mjs
// Exit code 0 when every check passes, 1 when any fails. MUTATE=1 changes one expected value to
// show that the harness reports a failure.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const results = [];
// `literal` is the text that must appear in `source`: the expected value unless given.
function check(name, actual, expected, source, literal = expected) {
  const mutated = process.env.MUTATE === "1" && name === "BIP85 WIF application";
  const want = mutated ? `${expected}x` : expected;
  let pinned = true;
  if (source !== undefined) pinned = readFileSync(source, "utf8").includes(literal);
  const ok = actual === want && pinned;
  results.push({ name, ok, actual, expected: want, source, pinned });
}

// ---------------------------------------------------------------- hashes and encodings
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const dsha256 = (b) => sha256(sha256(b));
const hash160 = (b) => crypto.createHash("ripemd160").update(sha256(b)).digest();
const hmac = (alg, key, data) => crypto.createHmac(alg, key).update(data).digest();
const taggedHash = (tag, msg) => {
  const t = sha256(Buffer.from(tag));
  return sha256(Buffer.concat([t, t, msg]));
};
const hex = (b) => Buffer.from(b).toString("hex");
const fromHex = (h) => Buffer.from(h, "hex");
const be32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const varint = (n) => {
  if (n < 0xfd) return Buffer.from([n]);
  throw new Error("varint > 252 not needed here");
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = BigInt(`0x${hex(bytes) || "0"}`);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}
const base58check = (payload) => base58(Buffer.concat([payload, dsha256(payload).subarray(0, 4)]));
function unbase58check(text) {
  let n = 0n;
  for (const c of text) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(v);
  }
  let h = n.toString(16);
  if (h.length % 2) h = `0${h}`;
  let bytes = fromHex(h);
  for (const c of text) {
    if (c !== "1") break;
    bytes = Buffer.concat([Buffer.from([0]), bytes]);
  }
  const payload = bytes.subarray(0, -4);
  if (!dsha256(payload).subarray(0, 4).equals(bytes.subarray(-4))) throw new Error("checksum");
  return payload;
}

const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values) {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i += 1) if ((top >>> i) & 1) chk ^= gen[i];
  }
  return chk >>> 0;
}
const hrpExpand = (hrp) => [
  ...[...hrp].map((c) => c.charCodeAt(0) >> 5),
  0,
  ...[...hrp].map((c) => c.charCodeAt(0) & 31),
];
const BECH32 = 1;
const BECH32M = 0x2bc830a3;
function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & max);
  if (!pad && (bits >= from || (acc << (to - bits)) & max)) throw new Error("bad padding");
  return out;
}
function bechEncode(hrp, data5, constant) {
  const values = [...hrpExpand(hrp), ...data5];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ constant;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >>> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data5, ...checksum].map((v) => BECH[v]).join("")}`;
}
function bechDecode(text) {
  const lower = text.toLowerCase();
  const pos = lower.lastIndexOf("1");
  const hrp = lower.slice(0, pos);
  const data = [...lower.slice(pos + 1)].map((c) => BECH.indexOf(c));
  if (data.some((v) => v < 0)) throw new Error("bad char");
  const c = polymod([...hrpExpand(hrp), ...data]);
  const encoding = c === BECH32 ? "bech32" : c === BECH32M ? "bech32m" : null;
  return { hrp, data: data.slice(0, -6), encoding };
}

// ---------------------------------------------------------------- secp256k1 in BigInt
const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
];
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a, m = P) {
  let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return mod(s0, m);
}
function add(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  if (a[0] === b[0] && mod(a[1] + b[1]) === 0n) return null;
  const l =
    a[0] === b[0] && a[1] === b[1]
      ? mod(3n * a[0] * a[0] * inv(2n * a[1]))
      : mod((b[1] - a[1]) * inv(b[0] - a[0]));
  const x = mod(l * l - a[0] - b[0]);
  return [x, mod(l * (a[0] - x) - a[1])];
}
function mul(k, point = G) {
  let result = null;
  let addend = point;
  for (let n = k; n > 0n; n >>= 1n) {
    if (n & 1n) result = add(result, addend);
    addend = add(addend, addend);
  }
  return result;
}
const int = (b) => BigInt(`0x${hex(b)}`);
const ser256 = (n) => fromHex(n.toString(16).padStart(64, "0"));
const serP = (pt) => Buffer.concat([Buffer.from([pt[1] & 1n ? 3 : 2]), ser256(pt[0])]);
function liftX(x, odd) {
  const y2 = mod(x ** 3n + 7n);
  let y = 1n;
  let base = y2;
  for (let e = (P + 1n) / 4n; e > 0n; e >>= 1n) {
    if (e & 1n) y = mod(y * base);
    base = mod(base * base);
  }
  if (mod(y * y) !== y2) throw new Error("not on curve");
  return [x, (y & 1n) === BigInt(odd) ? y : P - y];
}
const pubFromKey = (k) => serP(mul(int(k)));

// RFC 6979 deterministic nonce with HMAC-SHA256, then ECDSA with a low s, as Bitcoin signs.
function signRfc6979(keyBytes, digest) {
  const d = int(keyBytes);
  const x = ser256(d);
  const h1 = ser256(mod(int(digest), N));
  let V = Buffer.alloc(32, 1);
  let K = Buffer.alloc(32, 0);
  K = hmac("sha256", K, Buffer.concat([V, Buffer.from([0]), x, h1]));
  V = hmac("sha256", K, V);
  K = hmac("sha256", K, Buffer.concat([V, Buffer.from([1]), x, h1]));
  V = hmac("sha256", K, V);
  for (;;) {
    V = hmac("sha256", K, V);
    const k = int(V);
    if (k >= 1n && k < N) {
      const R = mul(k);
      const r = mod(R[0], N);
      let s = mod(inv(k, N) * (int(digest) + r * d), N);
      if (r !== 0n && s !== 0n) {
        let recid = Number(R[1] & 1n) | (R[0] >= N ? 2 : 0);
        if (s > N / 2n) {
          s = N - s;
          recid ^= 1;
        }
        return { r, s, recid };
      }
    }
    K = hmac("sha256", K, Buffer.concat([V, Buffer.from([0])]));
    V = hmac("sha256", K, V);
  }
}
function derInt(n) {
  let b = ser256(n);
  while (b.length > 1 && b[0] === 0 && b[1] < 0x80) b = b.subarray(1);
  if (b[0] >= 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return Buffer.concat([Buffer.from([2, b.length]), b]);
}
const der = ({ r, s }) => {
  const body = Buffer.concat([derInt(r), derInt(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
};
// OpenSSL check: node:crypto hashes its input once with SHA-256, so it gets the single-SHA-256
// intermediate of a double-SHA-256 digest.
function opensslVerifies(pubPoint, singleSha, derSig) {
  const spki = Buffer.concat([
    fromHex("3056301006072a8648ce3d020106052b8104000a034200"),
    Buffer.from([4]),
    ser256(pubPoint[0]),
    ser256(pubPoint[1]),
  ]);
  const key = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  return crypto.verify("sha256", singleSha, { key, dsaEncoding: "der" }, derSig);
}
function parseDer(sig) {
  let o = 2;
  const rl = sig[o + 1];
  const r = int(sig.subarray(o + 2, o + 2 + rl));
  o += 2 + rl;
  const sl = sig[o + 1];
  const s = int(sig.subarray(o + 2, o + 2 + sl));
  return { r, s };
}

// ---------------------------------------------------------------- BIP32 and addresses
function master(seed) {
  const I = hmac("sha512", Buffer.from("Bitcoin seed"), seed);
  return { k: int(I.subarray(0, 32)), c: I.subarray(32) };
}
function ckd({ k, c }, index) {
  const hardened = index >= 0x80000000;
  const data = hardened
    ? Buffer.concat([Buffer.from([0]), ser256(k), be32(index)])
    : Buffer.concat([serP(mul(k)), be32(index)]);
  const I = hmac("sha512", c, data);
  return { k: mod(int(I.subarray(0, 32)) + k, N), c: I.subarray(32) };
}
const H = (n) => n + 0x80000000;
const derive = (node, path) => path.reduce(ckd, node);
const p2pkh = (pub, version) => base58check(Buffer.concat([Buffer.from([version]), hash160(pub)]));
const wif = (k, version) =>
  base58check(Buffer.concat([Buffer.from([version]), ser256(k), Buffer.from([1])]));

// ================================================================ checks
const W = "apps/key-derivation/src/workers/";
const PS = "apps/psbt-inspector/src/";

// BIP39 seed of the public phrase (Silent Payment self-test input).
const phrase = Array(11).fill("abandon").concat("about").join(" ");
const seed = crypto.pbkdf2Sync(phrase.normalize("NFKD"), "mnemonic", 2048, 64, "sha512");
check(
  "BIP39 seed of abandon ... about",
  hex(seed),
  "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4",
  `${W}silent-payment-self-test.ts`,
);

// BIP352 Silent Payment address of account 0 and its change address (label m = 0).
{
  const root = master(seed);
  const scan = derive(root, [H(352), H(0), H(0), H(1), 0]);
  const spend = derive(root, [H(352), H(0), H(0), H(0), 0]);
  const Bscan = serP(mul(scan.k));
  const spendPoint = mul(spend.k);
  const encode = (spendBytes) =>
    bechEncode("sp", [0, ...convertBits([...Bscan, ...spendBytes], 8, 5, true)], BECH32M);
  check(
    "BIP352 Silent Payment address (account 0)",
    encode(serP(spendPoint)),
    "sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g",
    `${W}silent-payment-self-test.ts`,
  );
  const label = mod(int(taggedHash("BIP0352/Label", Buffer.concat([ser256(scan.k), be32(0)]))), N);
  check(
    "BIP352 Silent Payment change address (label 0)",
    encode(serP(add(spendPoint, mul(label)))),
    "sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqc7cztt86v30fp7s8rdq99v4vxl5vs4r6naeha9dgwu38c2aszwlqdmad77",
    `${W}silent-payment-self-test.ts`,
  );
}

// BIP85 applications of the specification's root key.
{
  const xprv =
    "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb";
  const raw = unbase58check(xprv);
  const root = { c: raw.subarray(13, 45), k: int(raw.subarray(46, 78)) };
  const entropy = (path) =>
    hmac("sha512", Buffer.from("bip-entropy-from-k"), ser256(derive(root, path.map(H)).k));
  check(
    "BIP85 BIP39 application (12 words, entropy)",
    hex(entropy([83696968, 39, 0, 12, 0]).subarray(0, 16)),
    "6250b68daf746d12a24d58b4787a714b",
    `${W}bip85-self-test.ts`,
  );
  const english = readFileSync("node_modules/@scure/bip39/wordlists/english.js", "utf8")
    .match(/`([\s\S]*?)`/u)[1]
    .split("\n")
    .filter(Boolean);
  const ent = entropy([83696968, 39, 0, 12, 0]).subarray(0, 16);
  const bits =
    [...ent].map((b) => b.toString(2).padStart(8, "0")).join("") +
    sha256(ent)[0].toString(2).padStart(8, "0").slice(0, 4);
  const words = bits
    .match(/.{11}/gu)
    .map((b) => english[parseInt(b, 2)])
    .join(" ");
  check(
    "BIP85 BIP39 words (wordlist as data only)",
    words,
    "girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose",
    `${W}bip85-self-test.ts`,
  );
  check(
    "BIP85 WIF application",
    wif(int(entropy([83696968, 2, 0]).subarray(0, 32)), 0x80),
    "Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhp",
    `${W}bip85-self-test.ts`,
  );
  const x = entropy([83696968, 32, 0]);
  check(
    "BIP85 XPRV application",
    base58check(
      Buffer.concat([
        fromHex("0488ade4"),
        Buffer.alloc(9),
        x.subarray(0, 32),
        Buffer.from([0]),
        x.subarray(32, 64),
      ]),
    ),
    "xprv9s21ZrQH143K2srSbCSg4m4kLvPMzcWydgmKEnMmoZUurYuBuYG46c6P71UGXMzmriLzCCBvKQWBUv3vPB3m1SATMhp3uEjXHJ42jFg7myX",
    `${W}bip85-self-test.ts`,
  );
  check(
    "BIP85 HEX application (64 bytes)",
    hex(entropy([83696968, 128169, 64, 0])),
    "492db4698cf3b73a5a24998aa3e9d7fa96275d85724a91e71aa2d645442f878555d078fd1f1f67e368976f04137b1f7a0d19232136ca50c44614af72b5582a5c",
    `${W}bip85-self-test.ts`,
  );
}

// Compact message signatures of the private key 1 (Deriver signs, Inspector verifies).
{
  const one = ser256(1n);
  const message = Buffer.from("Offline message signing self-test");
  for (const [label, magic, version, address, signature, files] of [
    [
      "Bitcoin",
      "Bitcoin Signed Message:\n",
      0x00,
      "1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH",
      "H3fcO9sr+K04dbegeXN7uU1PRgo538UFG5eawYMXK8ZxfE8LegyeCj3CKIR87lMZ0xaktP65In3kejkdZhi8da8=",
      [`${W}message-signer-self-test-bitcoin.ts`, `${PS}self-test-bitcoin.ts`],
    ],
    [
      "Dash",
      "DarkCoin Signed Message:\n",
      0x4c,
      "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE",
      "H5Oj4LXfIgqbHRLIbCGux6wQGf3ZtC8iQt79foa4M9nkadAXIRsCL4X8sJWAH9iwOpV5w6N8mS1jxrRp+8Nxapc=",
      [`${W}message-signer-self-test-dash.ts`, `${PS}self-test-dash.ts`],
    ],
  ]) {
    const pub = pubFromKey(one);
    for (const file of files)
      check(`${label} address of key 1`, p2pkh(pub, version), address, file);
    const prefix = Buffer.concat([varint(magic.length), Buffer.from(magic)]);
    const body = Buffer.concat([prefix, varint(message.length), message]);
    const sig = signRfc6979(one, dsha256(body));
    const compact = Buffer.concat([Buffer.from([31 + sig.recid]), ser256(sig.r), ser256(sig.s)]);
    for (const file of files)
      check(`${label} compact signature (RFC 6979)`, compact.toString("base64"), signature, file);
    check(
      `${label} compact signature verifies in OpenSSL`,
      String(opensslVerifies(G, sha256(body), der(sig))),
      "true",
    );
    const other = Buffer.concat([prefix, varint(message.length + 1), message, Buffer.from("!")]);
    check(
      `${label} signature refused for another message (OpenSSL)`,
      String(opensslVerifies(G, sha256(other), der(sig))),
      "false",
    );
  }
}

// BIP-322 simple signature of "Hello World" by the specification's P2WPKH test key.
{
  const key = fromHex("bb051cd0dda0246f33c5a9e133ebd8e7bc02a92af6c41adc131ccd7826c5b004");
  check(
    "BIP-322 test key equals the specification's WIF",
    wif(int(key), 0x80),
    "L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k",
  );
  const pub = pubFromKey(key);
  const program = hash160(pub);
  check(
    "BIP-322 test address",
    bechEncode("bc", [0, ...convertBits([...program], 8, 5, true)], BECH32),
    "bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l",
    `${W}message-signer-self-test-bitcoin.ts`,
  );
  const scriptPubKey = Buffer.concat([Buffer.from([0, 20]), program]);
  const le32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const messageHash = taggedHash("BIP0322-signed-message", Buffer.from("Hello World"));
  const toSpend = Buffer.concat([
    le32(0),
    varint(1),
    Buffer.alloc(32),
    le32(0xffffffff),
    varint(34),
    Buffer.from([0, 32]),
    messageHash,
    le32(0),
    varint(1),
    Buffer.alloc(8),
    varint(scriptPubKey.length),
    scriptPubKey,
    le32(0),
  ]);
  const outpoint = Buffer.concat([dsha256(toSpend), le32(0)]);
  const outputs = Buffer.concat([Buffer.alloc(8), varint(1), Buffer.from([0x6a])]);
  const scriptCode = Buffer.concat([fromHex("1976a914"), program, fromHex("88ac")]);
  const preimage = Buffer.concat([
    le32(0),
    dsha256(outpoint),
    dsha256(le32(0)),
    outpoint,
    scriptCode,
    Buffer.alloc(8),
    le32(0),
    dsha256(outputs),
    le32(0),
    le32(1),
  ]);
  const sighash = dsha256(preimage);
  const witness = (sigDer) =>
    Buffer.concat([
      varint(2),
      varint(sigDer.length + 1),
      sigDer,
      Buffer.from([1]),
      varint(pub.length),
      pub,
    ]).toString("base64");
  const spec =
    "AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=";
  const specBytes = Buffer.from(spec, "base64");
  const specDer = specBytes.subarray(2, 2 + specBytes[1] - 1);
  const pubPoint = liftX(int(pub.subarray(1)), pub[0] === 3);
  check(
    "BIP-322 specification signature verifies (independent sighash, OpenSSL)",
    String(opensslVerifies(pubPoint, sha256(preimage), specDer)),
    "true",
  );
  check(
    "BIP-322 specification signature in the product",
    `smp${spec}`,
    `smp${spec}`,
    `${W}message-signer-self-test-bitcoin.ts`,
  );
  const page = signRfc6979(key, sighash);
  check(
    "BIP-322 page signature = RFC 6979 without low-R grinding",
    `smp${witness(der(page))}`,
    "smpAkgwRQIhAOzyynlqt93lOKJr+wmmxIens//zPzl9tqIOua93wO6MAiBi5n5EyAcPScOjf1lAqIUIQtr3zKNeavYabHyR8eGhowEhAsfxIAMZZEKUPYWI4BruhAQjzFT8FSFSajuFwrDL1Yhy",
    `${W}message-signer-self-test-bitcoin.ts`,
  );
  check(
    "BIP-322 page signature verifies (OpenSSL)",
    String(opensslVerifies(pubPoint, sha256(preimage), der(page))),
    "true",
  );
  const specSig = parseDer(specDer);
  check(
    "BIP-322 spec and page signatures share s-normal form",
    String(specSig.s <= N / 2n),
    "true",
  );
}

// BIP38 (no EC multiply, compressed) of BIP38's second compressed test key, Bitcoin and Dash.
{
  const key = fromHex("09c2686880095b1a4c249ee3ac4eea8a014f11e6f986d0b5025ac1f39afbd9ae");
  const pub = pubFromKey(key);
  for (const [label, version, address, encrypted, files] of [
    [
      "Bitcoin",
      0x00,
      "1HmPbwsvG5qJ3KJfxzsZRZWhbm1xBMuS8B",
      "6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7",
      [`${W}bip38-self-test-bitcoin.ts`, `${PS}self-test-bitcoin.ts`],
    ],
    [
      "Dash",
      0x4c,
      "XsTESCXpDo3tCFuFptBnH6CVS6beCGeKVh",
      "6PYMfcjoDw2h66ho6AkKVzv9tQVv5dbeBG4mUQEaTzVQtJ2A2Ts4Sn4BpH",
      [`${W}bip38-self-test-dash.ts`, `${PS}self-test-dash.ts`],
    ],
  ]) {
    const addr = p2pkh(pub, version);
    check(
      `${label} BIP38 address`,
      addr,
      address,
      label === "Dash" ? `${PS}self-test-dash.ts` : `${PS}self-test-bitcoin.ts`,
    );
    const salt = dsha256(Buffer.from(addr)).subarray(0, 4);
    const derived = crypto.scryptSync(Buffer.from("Satoshi".normalize("NFC")), salt, 64, {
      N: 16384,
      r: 8,
      p: 8,
      maxmem: 64 * 1024 * 1024,
    });
    const aes = (block) => {
      const cipher = crypto.createCipheriv("aes-256-ecb", derived.subarray(32), null);
      cipher.setAutoPadding(false);
      return Buffer.concat([cipher.update(block), cipher.final()]);
    };
    const xor = (a, b) => Buffer.from(a.map((v, i) => v ^ b[i]));
    const half1 = aes(xor(key.subarray(0, 16), derived.subarray(0, 16)));
    const half2 = aes(xor(key.subarray(16), derived.subarray(16, 32)));
    const result = base58check(Buffer.concat([fromHex("0142e0"), salt, half1, half2]));
    for (const file of files) check(`${label} BIP38 encryption`, result, encrypted, file);
  }
}

// PSBT Inspector vectors.
{
  const creator = fromHex(
    "70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd75" +
      "0000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d01000000" +
      "00ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f50500000000" +
      "16001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000",
  );
  const tx = creator.subarray(8, 8 + 0x9a);
  check(
    "BIP174 creator transaction id",
    hex(Buffer.from(dsha256(tx)).reverse()),
    "82efd652d7ab1197f01a5f4d9a30cb4c68bb79ab6fec58dfa1bf112291d1617b",
    `${PS}self-test-bitcoin.ts`,
  );
  check("BIP174 first output value", String(tx.readBigUInt64LE(5 + 2 * 41 + 1)), "149990000");
  const script = fromHex(
    "522102fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f2102ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f852ae",
  );
  const sorted = [
    "02ff12471208c14bd580709cb2358d98975247d8765f92bc25eab3b2763ed605f8",
    "02fe6f0a5a297eb38c391581c4413e084773ea23954d93f7753db7dc0adc188b2f",
  ].sort();
  check(
    "BIP67 sorted 2-of-2 script",
    hex(script),
    `5221${sorted[0]}21${sorted[1]}52ae`,
    `${PS}self-test-checks.ts`,
  );
  check(
    "BIP67 P2SH address (Bitcoin mainnet)",
    p2pkh(script, 0x05),
    "39bgKC7RFbpoCRbtD5KEdkYKtNyhpsNa3Z",
    `${PS}self-test-bitcoin.ts`,
  );
  check(
    "BIP67 P2SH address (Dash testnet, version 19)",
    p2pkh(script, 0x13),
    "8nL86iHTC8K4eVZ6YwyhRWMLhSauj8XQAK",
    `${PS}self-test-dash.ts`,
  );
  const dash = Buffer.from(
    "cHNidP8BAEICAAAAAXgRxzbShUlivVFKgoLyhk0RCCYLZKCYTl/tYRd+yGImAAAAAAD/////AQAAAAAAAAAABmoEAAECAwAAAAAAAAA=",
    "base64",
  );
  const dtx = dash.subarray(8, 8 + dash[7]);
  check(
    "Dash documentation PSBT: magic, version 2 type 0, 1 input, 1 OP_RETURN output",
    [
      hex(dash.subarray(0, 5)),
      dtx.readUInt16LE(0),
      dtx.readUInt16LE(2),
      dtx[4],
      dtx[4 + 1 + 36 + 1 + 4],
      hex(dtx.subarray(4 + 1 + 36 + 1 + 4 + 1 + 8, 4 + 1 + 36 + 1 + 4 + 1 + 8 + 7)),
    ].join(" "),
    "70736274ff 2 0 1 1 066a0400010203",
  );
}

// BIP380 descriptor checksum, implemented from the specification's reference algorithm.
{
  const INPUT =
    "0123456789()[],'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#\"\\ ";
  const CHECK = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const pm = (c, val) => {
    const c0 = c >> 35n;
    c = ((c & 0x7ffffffffn) << 5n) ^ val;
    if (c0 & 1n) c ^= 0xf5dee51989n;
    if (c0 & 2n) c ^= 0xa9fdca3312n;
    if (c0 & 4n) c ^= 0x1bab10e32dn;
    if (c0 & 8n) c ^= 0x3706b1677an;
    if (c0 & 16n) c ^= 0x644d626ffdn;
    return c;
  };
  const checksum = (s) => {
    let c = 1n;
    let cls = 0n;
    let clscount = 0;
    for (const ch of s) {
      const pos = BigInt(INPUT.indexOf(ch));
      c = pm(c, pos & 31n);
      cls = cls * 3n + (pos >> 5n);
      if (++clscount === 3) {
        c = pm(c, cls);
        cls = 0n;
        clscount = 0;
      }
    }
    if (clscount > 0) c = pm(c, cls);
    for (let j = 0; j < 8; j++) c = pm(c, 0n);
    c ^= 1n;
    return [...Array(8)]
      .map((_, j) => CHECK[Number((c >> (5n * (7n - BigInt(j)))) & 31n)])
      .join("");
  };
  check(
    "BIP380 descriptor checksum of raw(deadbeef)",
    `raw(deadbeef)#${checksum("raw(deadbeef)")}`,
    "raw(deadbeef)#89f8spxm",
    `${PS}self-test-checks.ts`,
  );
}

// Activity Viewer address checks and the public-input guard samples.
{
  const valid = bechDecode("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4");
  check("BIP173 upper-case vector is valid bech32", valid.encoding, "bech32");
  const taproot = bechDecode("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0");
  check("BIP350 taproot vector is valid bech32m", taproot.encoding, "bech32m");
  const changed = bechDecode("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5");
  check("BIP173 vector with t4 -> t5 fails both checksums", String(changed.encoding), "null");
  const eip55 = (address) => {
    const lower = address.slice(2).toLowerCase();
    const h = crypto.createHash("keccak-256").update(lower).digest("hex");
    return `0x${[...lower].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join("")}`;
  };
  check(
    "EIP-55 example address",
    eip55("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"),
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "apps/activity-viewer/src/activity-ethereum.ts",
  );
  check(
    "EIP-55 mutated case differs from the checksum",
    String(
      eip55("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD") ===
        "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD",
    ),
    "false",
  );
  check(
    "Dash WIF of the private key 1 (guard sample)",
    wif(1n, 0xcc),
    "XBHddvWWiMu3nZhhpTXBQWJMmdz5JNKJD85b9fgKAckCT2coW3Y4",
    "packages/secret-boundary/src/public-input-guard-self-test.ts",
  );
  const bip32 = derive(master(fromHex("000102030405060708090a0b0c0d0e0f")), []);
  check(
    "BIP32 test vector 1 master xprv (guard sample)",
    base58check(
      Buffer.concat([
        fromHex("0488ade4"),
        Buffer.alloc(9),
        bip32.c,
        Buffer.from([0]),
        ser256(bip32.k),
      ]),
    ),
    "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi",
    "packages/secret-boundary/src/public-input-guard-self-test.ts",
  );
  check(
    "Public sample is a valid Dash P2PKH address",
    String(unbase58check("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5")[0]),
    "76",
    "packages/secret-boundary/src/public-input-guard-self-test.ts",
    "XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5",
  );
}

// RFC 7914 scrypt vector (Discovery startup).
check(
  "RFC 7914 scrypt (empty, N=16, r=1, p=1)",
  hex(crypto.scryptSync("", "", 64, { N: 16, r: 1, p: 1 })),
  "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442" +
    "fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906",
);

// Candidate list: age X25519 decryption written from age's specification, then MNCL decoding.
{
  const source = readFileSync("apps/discovery-scanner/src/candidate-list-self-test.ts", "utf8");
  const identity = source.match(/AGE-SECRET-KEY-1[0-9A-Z]+/u)[0];
  const listB64 = [...source.matchAll(/^\s+"([A-Za-z0-9+/=]+)"/gmu)].map((m) => m[1]).join("");
  const file = Buffer.from(listB64, "base64");
  const id = bechDecode(identity);
  const scalar = Buffer.from(convertBits(id.data, 5, 8, false));
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([fromHex("302e020100300506032b656e04220420"), scalar]),
    format: "der",
    type: "pkcs8",
  });
  const recipient = crypto
    .createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  const headerEnd = file.indexOf("\n---") + 4;
  const macLineEnd = file.indexOf("\n", headerEnd);
  const header = file.subarray(0, macLineEnd).toString("latin1").split("\n");
  const stanza = header[1].split(" ");
  const share = Buffer.from(stanza[2], "base64");
  const body = Buffer.from(header[2], "base64");
  const hkdf = (ikm, salt, info) =>
    Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from(info), 32));
  const shared = crypto.diffieHellman({
    privateKey,
    publicKey: crypto.createPublicKey({
      key: Buffer.concat([fromHex("302a300506032b656e032100"), share]),
      format: "der",
      type: "spki",
    }),
  });
  const open = (key, nonce, data) => {
    const decipher = crypto.createDecipheriv("chacha20-poly1305", key, nonce, {
      authTagLength: 16,
    });
    decipher.setAuthTag(data.subarray(-16));
    return Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  };
  const fileKey = open(
    hkdf(shared, Buffer.concat([share, recipient]), "age-encryption.org/v1/X25519"),
    Buffer.alloc(12),
    body,
  );
  const mac = hmac("sha256", hkdf(fileKey, Buffer.alloc(0), "header"), file.subarray(0, headerEnd));
  check("age header MAC", mac.toString("base64").replace(/=+$/u, ""), header[3].slice(4));
  const nonce = file.subarray(macLineEnd + 1, macLineEnd + 17);
  const payload = file.subarray(macLineEnd + 17);
  const plain = open(
    hkdf(fileKey, nonce, "payload"),
    Buffer.concat([Buffer.alloc(11), Buffer.from([1])]),
    payload,
  );
  // MNCL: magic, version 1, flags, entropy length, count, global passphrase, records, CRC-32.
  const flags = plain[5];
  const length = plain[6];
  const count = plain.readUInt32BE(7);
  let offset = 11;
  let passphrase = "";
  if (flags & 1) {
    const n = plain.readUInt16BE(offset);
    passphrase = plain.subarray(offset + 2, offset + 2 + n).toString("utf8");
    offset += 2 + n;
  }
  const records = [];
  for (let i = 0; i < count; i += 1) {
    records.push(hex(plain.subarray(offset, offset + length)));
    offset += length;
  }
  const crcOk = plain.readUInt32BE(offset) === zlib.crc32(plain.subarray(0, offset));
  check(
    "Candidate list decrypts (independent age) to MNCL v1 with the expected records",
    [
      plain.subarray(0, 4).toString("latin1"),
      plain[4],
      flags,
      records.join(","),
      passphrase,
      crcOk,
    ].join(" "),
    "MNCL 1 1 00000000000000000000000000000000,000102030405060708090a0b0c0d0e0f TREZOR true",
  );
}

// SSKR: the shares of the Deriver's SSKR check, restored by Shamir interpolation written here
// (GF(2^8) with the Rijndael polynomial, secret at x = 255, digest at x = 254).
{
  const listSource = readFileSync(
    "packages/recovery-mnemocode/source/sskr/bytewords-list.ts",
    "utf8",
  );
  const words = [...listSource.matchAll(/"([a-z]{4})"/gu)].map((m) => m[1]);
  const minimal = new Map(words.map((w, i) => [w[0] + w[3], i]));
  const shareSource = readFileSync("packages/recovery-backup/src/self-test-sskr.ts", "utf8");
  const urs = [...shareSource.matchAll(/"ur:sskr\/([a-z]+)"/gu)].map((m) => m[1]);
  const decode = (text) => {
    const bytes = [];
    for (let i = 0; i < text.length; i += 2) bytes.push(minimal.get(text.slice(i, i + 2)));
    const b = Buffer.from(bytes);
    const crcOk = zlib.crc32(b.subarray(0, -4)) === b.readUInt32BE(b.length - 4);
    if (!crcOk || b[0] !== 0x55) throw new Error("unexpected SSKR UR body");
    return b.subarray(1, -4);
  };
  const shares = urs.map(decode);
  const gmul = (a, b) => {
    let p = 0;
    for (let i = 0; i < 8; i += 1) {
      if (b & 1) p ^= a;
      const hi = a & 0x80;
      a = (a << 1) & 0xff;
      if (hi) a ^= 0x1b;
      b >>= 1;
    }
    return p;
  };
  const ginv = (a) => {
    for (let x = 1; x < 256; x += 1) if (gmul(a, x) === 1) return x;
    throw new Error("no inverse");
  };
  // Adapted during the AUD-023 remediation: the self-test now restores the grouped vector of
  // BCR-2020-011 (AUD-023-FUN004), so the shares are combined per group and then across groups.
  // Header: identifier (2 bytes), group threshold - 1 | group count - 1, group index | member
  // threshold - 1, reserved | member index; then the share value.
  const interpolate = (xs, ys, x) =>
    Buffer.from(
      ys[0].map((_, byte) => {
        let sum = 0;
        for (let i = 0; i < xs.length; i += 1) {
          let term = ys[i][byte];
          for (let j = 0; j < xs.length; j += 1)
            if (j !== i) term = gmul(term, gmul(x ^ xs[j], ginv(xs[i] ^ xs[j])));
          sum ^= term;
        }
        return sum;
      }),
    );
  // One level of the scheme: a threshold of one stores the secret itself; otherwise the secret
  // lies at x = 255 and its digest at x = 254.
  let digestsOk = true;
  const recover = (xs, ys, threshold) => {
    if (threshold === 1) return ys[0];
    const secret = interpolate(xs, ys, 255);
    const digest = interpolate(xs, ys, 254);
    digestsOk &&= hmac("sha256", digest.subarray(4), secret)
      .subarray(0, 4)
      .equals(digest.subarray(0, 4));
    return secret;
  };
  const groups = new Map();
  for (const share of shares) {
    const group = share[3] >> 4;
    if (!groups.has(group)) groups.set(group, { threshold: (share[3] & 0x0f) + 1, members: [] });
    groups.get(group).members.push(share);
  }
  const groupThreshold = (shares[0][2] >> 4) + 1;
  const groupXs = [];
  const groupYs = [];
  for (const [index, { threshold, members }] of groups) {
    if (members.length < threshold) continue;
    groupXs.push(index);
    groupYs.push(
      recover(
        members.map((m) => m[4] & 0x0f),
        members.map((m) => m.subarray(5)),
        threshold,
      ),
    );
  }
  const secret = recover(groupXs.slice(0, groupThreshold), groupYs.slice(0, groupThreshold), groupThreshold);
  check(
    "SSKR BCR-2020-011 grouped shares restore 7daa...b1 with valid digests (independent Shamir)",
    `${hex(secret)} ${digestsOk} ${urs.length}`,
    "7daa851251002874e1a1995f0897e6b1 true 5",
    "packages/recovery-backup/src/self-test-sskr.ts",
    "7daa851251002874e1a1995f0897e6b1",
  );
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  const where = r.source ? ` [${r.source}${r.pinned ? "" : ": literal NOT found"}]` : "";
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${where}`);
  if (!r.ok) console.log(`     actual:   ${r.actual}\n     expected: ${r.expected}`);
}
console.log(`${results.length - failed}/${results.length} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
