"""Independent reimplementation (standard library only) of Zcash's Sapling keys and rows, to check the
Deriver's TypeScript (packages/coin-protocols/src/zip32-sapling.ts and coins/zcash/sapling.ts): the
Jubjub curve and its group hash, ZIP-32's Sapling keys and encodings, FF1-AES256 diversifiers (AES-256
and FF1 are written here), Sapling addresses, and the unified encodings of zcash_unified_oracle.py
with the transparent keys of bip32_oracle.py. It first reproduces published vectors: FIPS-197's
AES-256 example, zcash/zcash-test-vectors @78321be (test/fixtures/zcash-test-vectors: the generators,
the ZIP-32 hardened keys, the key components, and every Sapling and P2PKH item of the unified
addresses and viewing keys), the UFVK that zcash-swift-wallet-sdk @01eb750 asserts for its seed and
the zxviews it declares, and the unified address that zcash-android-wallet-sdk @1aaf2c4 asserts for
its phrase. Then it checks the own values that the Deriver holds: the BIP39 seed of that phrase
(apps/key-derivation/src/workers/zcash-sapling-key-self-test.ts), and the rows and summary of the
"abandon … about" phrase (packages/coin-protocols/tests/zcash-sapling.test.ts; its first address also
in packages/verification/src/derivation-self-test-zcash.ts, its spending key in the worker's full
self-test), and the Wallet Matcher's own values of that phrase (matcher()). Run from this folder."""
import base64
import hashlib
import hmac

from bip32_oracle import N, b58check, h160, mul, ser
from cardano_oracle import bech32
from ed25519_oracle import bip39_seed, check
from zcash_unified_oracle import ORCHARD, P2PKH, SAPLING, item, read, rows, unified

# Jubjub ("Jubjub"): the base field q, the prime subgroup's order r, a = -1, d = -10240/10241.
Q = 0x73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000001
R = 0x0E7DB4EA6533AFA906673B0101343B00A6682093CCC81082D0970E5ED6F72CB7
D = -10240 * pow(10241, -1, Q) % Q
IDENTITY = (0, 1, 1, 0)
# The Sapling URS ("Group Hash into Jubjub"), the 64 ASCII characters of the randomness beacon.
URS = b"096b36a5804bfacef1691e173c366a47ff5ba84a44f26ddd7e8d9f79d5b42df0"


def add(p, q):
    """Twisted Edwards addition with a = -1 in extended coordinates (complete on Jubjub)."""
    x1, y1, z1, t1 = p
    x2, y2, z2, t2 = q
    a = (y1 - x1) * (y2 - x2) % Q
    b = (y1 + x1) * (y2 + x2) % Q
    c = 2 * D * t1 * t2 % Q
    d = 2 * z1 * z2 % Q
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % Q, g * h % Q, f * g % Q, e * h % Q)


def times(k, p):
    result = IDENTITY
    while k:
        if k & 1:
            result = add(result, p)
        p = add(p, p)
        k >>= 1
    return result


def is_identity(p):
    return p[0] % Q == 0 and (p[1] - p[2]) % Q == 0


def encode(p):
    inverse = pow(p[2], -1, Q)
    x, y = p[0] * inverse % Q, p[1] * inverse % Q
    return (y | (x & 1) << 255).to_bytes(32, "little")


def sqrt(n):
    """A square root modulo q by Tonelli-Shanks, or None."""
    n %= Q
    if n == 0:
        return 0
    if pow(n, (Q - 1) // 2, Q) != 1:
        return None
    s, odd = 0, Q - 1
    while odd % 2 == 0:
        s, odd = s + 1, odd // 2
    z = next(z for z in range(2, Q) if pow(z, (Q - 1) // 2, Q) == Q - 1)
    m, c, t, root = s, pow(z, odd, Q), pow(n, odd, Q), pow(n, (odd + 1) // 2, Q)
    while t != 1:
        i, square = 0, t
        while square != 1:
            i, square = i + 1, square * square % Q
        b = pow(c, 1 << (m - i - 1), Q)
        m, c, t, root = i, b * b % Q, t * b * b % Q, root * b % Q
    return root


def decode(data):
    """abst_J: the point of a canonical encoding, or None."""
    value = int.from_bytes(data, "little")
    sign, y = value >> 255, value & (2**255 - 1)
    if y >= Q:
        return None
    x = sqrt((y * y - 1) * pow(D * y * y + 1, -1, Q))
    if x is None or (x == 0 and sign == 1):
        return None
    if x & 1 != sign:
        x = Q - x
    return (x, y, 1, x * y % Q)


def group_hash(personalization, message):
    """GroupHash^J_URS: [8]·abst_J(BLAKE2s-256(D, URS ‖ M)), or None (⊥)."""
    point = decode(hashlib.blake2s(URS + message, person=personalization).digest())
    if point is None:
        return None
    point = times(8, point)
    return None if is_identity(point) else point


def find_group_hash(personalization, message):
    return next(p for i in range(256) if (p := group_hash(personalization, message + bytes([i]))) is not None)


G = find_group_hash(b"Zcash_G_", b"")
H = find_group_hash(b"Zcash_H_", b"")


def prf_expand(key, data):
    return hashlib.blake2b(key + data, person=b"Zcash_ExpandSeed").digest()


def to_scalar(data):
    return int.from_bytes(data, "little") % R


def le(value, length=32):
    return value.to_bytes(length, "little")


def components(ask, nsk, ovk):
    """ak, nk and ivk of an expanded spending key ("Sapling Key Components")."""
    ak, nk = encode(times(ask, G)), encode(times(nsk, H))
    ivk = int.from_bytes(hashlib.blake2s(ak + nk, person=b"Zcashivk").digest(), "little") % 2**251
    return ak, nk, ivk


def master(seed):
    i = hashlib.blake2b(seed, person=b"ZcashIP32Sapling").digest()
    sk = i[:32]
    return {
        "ask": to_scalar(prf_expand(sk, b"\x00")),
        "nsk": to_scalar(prf_expand(sk, b"\x01")),
        "ovk": prf_expand(sk, b"\x02")[:32],
        "dk": prf_expand(sk, b"\x10")[:32],
        "c": i[32:],
        "depth": 0,
        "tag": bytes(4),
        "index": 0,
    }


def fingerprint(key):
    ak, nk, _ = components(key["ask"], key["nsk"], key["ovk"])
    return hashlib.blake2b(ak + nk + key["ovk"], digest_size=32, person=b"ZcashSaplingFVFP").digest()


def child(key, index):
    """ZIP-32's hardened child CKDsk."""
    i = prf_expand(key["c"], b"\x11" + le(key["ask"]) + le(key["nsk"]) + key["ovk"] + key["dk"] + le(index, 4))
    left = i[:32]
    return {
        "ask": (to_scalar(prf_expand(left, b"\x13")) + key["ask"]) % R,
        "nsk": (to_scalar(prf_expand(left, b"\x14")) + key["nsk"]) % R,
        "ovk": prf_expand(left, b"\x15" + key["ovk"])[:32],
        "dk": prf_expand(left, b"\x16" + key["dk"])[:32],
        "c": i[32:],
        "depth": key["depth"] + 1,
        "tag": fingerprint(key)[:4],
        "index": index,
    }


def derive(seed, path):
    key = master(seed)
    for level in path:
        key = child(key, level + 2**31)
    return key


def header(key):
    return bytes([key["depth"]]) + key["tag"] + le(key["index"], 4) + key["c"]


def xsk(key):
    return header(key) + le(key["ask"]) + le(key["nsk"]) + key["ovk"] + key["dk"]


def fvk_parts(key):
    ak, nk, _ = components(key["ask"], key["nsk"], key["ovk"])
    return ak + nk + key["ovk"] + key["dk"]


def ivk_parts(key):
    return key["dk"] + le(components(key["ask"], key["nsk"], key["ovk"])[2])


# AES-256 (FIPS-197), encryption only, which FF1 needs.
def _gf_mul(a, b):
    product = 0
    while b:
        if b & 1:
            product ^= a
        a = (a << 1) ^ (0x11B if a & 0x80 else 0)
        b >>= 1
    return product


def _sbox():
    box = []
    for x in range(256):
        inverse = 0 if x == 0 else next(y for y in range(1, 256) if _gf_mul(x, y) == 1)
        value = inverse
        for shift in range(1, 5):
            value ^= ((inverse << shift) | (inverse >> (8 - shift))) & 0xFF
        box.append(value ^ 0x63)
    return box


SBOX = _sbox()


def _expand_key(key):
    words = [list(key[4 * i : 4 * i + 4]) for i in range(8)]
    rcon = 1
    for i in range(8, 60):
        word = list(words[i - 1])
        if i % 8 == 0:
            word = [SBOX[b] for b in word[1:] + word[:1]]
            word[0] ^= rcon
            rcon = _gf_mul(rcon, 2)
        elif i % 8 == 4:
            word = [SBOX[b] for b in word]
        words.append([a ^ b for a, b in zip(words[i - 8], word)])
    return [sum(words[4 * r : 4 * r + 4], []) for r in range(15)]


def aes256(key, block):
    keys = _expand_key(key)
    state = [a ^ b for a, b in zip(block, keys[0])]
    for round_ in range(1, 15):
        state = [SBOX[b] for b in state]
        state = [state[(r + 4 * (c + r)) % 16] for c in range(4) for r in range(4)]
        if round_ < 14:
            mixed = []
            for c in range(4):
                a = state[4 * c : 4 * c + 4]
                mixed += [
                    _gf_mul(a[0], 2) ^ _gf_mul(a[1], 3) ^ a[2] ^ a[3],
                    a[0] ^ _gf_mul(a[1], 2) ^ _gf_mul(a[2], 3) ^ a[3],
                    a[0] ^ a[1] ^ _gf_mul(a[2], 2) ^ _gf_mul(a[3], 3),
                    _gf_mul(a[0], 3) ^ a[1] ^ a[2] ^ _gf_mul(a[3], 2),
                ]
            state = mixed
        state = [a ^ b for a, b in zip(state, keys[round_])]
    return bytes(state)


def ff1_encrypt(key, tweak, numerals, radix):
    """FF1.Encrypt of NIST SP 800-38G (Algorithm 7) over AES-256."""
    n = len(numerals)
    u, v = n // 2, n - n // 2
    a, b = numerals[:u], numerals[u:]
    b_bytes = ((radix**v - 1).bit_length() + 7) // 8
    d = 4 * ((b_bytes + 3) // 4) + 4
    p = bytes([1, 2, 1]) + radix.to_bytes(3, "big") + bytes([10, u % 256]) + n.to_bytes(4, "big") + len(tweak).to_bytes(4, "big")
    number = lambda digits: sum(digit * radix ** (len(digits) - 1 - k) for k, digit in enumerate(digits))
    for i in range(10):
        q = tweak + bytes((-len(tweak) - b_bytes - 1) % 16) + bytes([i]) + number(b).to_bytes(b_bytes, "big")
        r = bytes(16)
        for at in range(0, len(p + q), 16):
            r = aes256(key, bytes(x ^ y for x, y in zip(r, (p + q)[at : at + 16])))
        s = r
        for j in range(1, (d + 15) // 16):
            s += aes256(key, bytes(x ^ y for x, y in zip(r, j.to_bytes(16, "big"))))
        m = u if i % 2 == 0 else v
        c = (number(a) + int.from_bytes(s[:d], "big")) % radix**m
        a, b = b, [c // radix ** (m - 1 - k) % radix for k in range(m)]
    return a + b


def diversifier(dk, j):
    """d_j = FF1-AES256(dk, "", I2LEBSP_88(j)) (ZIP-32), as 11 bytes, least significant bit first."""
    bits = ff1_encrypt(dk, b"", [(j >> k) & 1 for k in range(88)], 2)
    return bytes(sum(bits[8 * i + k] << k for k in range(8)) for i in range(11))


def address(key, j):
    """d ‖ pk_d at diversifier index j, or None where d_j is not valid."""
    d = diversifier(key["dk"], j)
    base = group_hash(b"Zcash_gd", d)
    if base is None:
        return None
    return d + encode(times(components(key["ask"], key["nsk"], key["ovk"])[2], base))


def bip32_node(seed, path):
    """The BIP32 (key, chain code) at `path` of `seed`, from bip32_oracle.py's child derivation."""
    out = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    node = (int.from_bytes(out[:32], "big"), out[32:])
    for part in path.split("/")[1:]:
        index = int(part.rstrip("'")) + (2**31 if part.endswith("'") else 0)
        k, chain = node
        parent = b"\0" + k.to_bytes(32, "big") if index >= 2**31 else ser(mul(k))
        out = hmac.new(chain, parent + index.to_bytes(4, "big"), hashlib.sha512).digest()
        node = ((int.from_bytes(out[:32], "big") + k) % N, out[32:])
    return node


def transparent_item(seed, path):
    k, chain = bip32_node(seed, path)
    return chain + ser(mul(k))


def receiver(seed, account, j):
    return h160(ser(mul(bip32_node(seed, f"m/44'/133'/{account}'/0/{j}")[0])))


def t1(hash_):
    return b58check(b"\x1c\xb8" + hash_)


def published():
    check("AES-256 of FIPS-197 C.3", aes256(bytes(range(32)), bytes.fromhex("00112233445566778899aabbccddeeff")).hex(), "8ea2b7ca516745bfeafc49904b496089")
    generators = rows("sapling_generators")[0]
    check("Sapling generator G (skb)", encode(G).hex(), generators["skb"])
    check("Sapling generator H (pkb)", encode(H).hex(), generators["pkb"])
    seed = bytes(range(32))
    for path, row in zip([[], [1], [1, 2], [1, 2, 3]], rows("sapling_zip32_hard")):
        key = derive(seed, path)
        ak, nk, ivk = components(key["ask"], key["nsk"], key["ovk"])
        got = {
            "ask": le(key["ask"]).hex(), "nsk": le(key["nsk"]).hex(), "ovk": key["ovk"].hex(), "dk": key["dk"].hex(),
            "c": key["c"].hex(), "ak": ak.hex(), "nk": nk.hex(), "ivk": le(ivk).hex(), "fp": fingerprint(key).hex(),
            "xsk": xsk(key).hex(), "xfvk": (header(key) + fvk_parts(key)).hex(),
        }
        for j, column in [(0, "d0"), (1, "d1"), (2, "d2"), (2**88 - 1, "dmax")]:
            got[column] = None if (a := address(key, j)) is None else a[:11].hex()
        for column, value in got.items():
            check(f"sapling_zip32_hard {path} {column}", value, row[column])
    for row in rows("sapling_key_components"):
        sk = bytes.fromhex(row["sk"])
        ask, nsk, ovk = to_scalar(prf_expand(sk, b"\x00")), to_scalar(prf_expand(sk, b"\x01")), prf_expand(sk, b"\x02")[:32]
        ak, nk, ivk = components(ask, nsk, ovk)
        pk_d = encode(times(ivk, group_hash(b"Zcash_gd", bytes.fromhex(row["default_d"]))))
        check(f"key components of {row['sk'][:4]}", [le(ask).hex(), le(nsk).hex(), ovk.hex(), ak.hex(), nk.hex(), le(ivk).hex(), pk_d.hex()],
              [row["ask"], row["nsk"], row["ovk"], row["ak"], row["nk"], row["ivk"], row["default_pk_d"]])
    accounts = {}
    for row in rows("unified_address"):
        account, j = row["account"], row["diversifier_index"]
        if row["sapling_raw_addr"]:
            if account not in accounts:
                accounts[account] = derive(seed, [32, 133, account])
            check(f"unified_address account {account} j {j} Sapling", address(accounts[account], j).hex(), row["sapling_raw_addr"])
        if row["p2pkh_bytes"]:
            check(f"unified_address account {account} j {j} P2PKH", receiver(seed, account, j).hex(), row["p2pkh_bytes"])
    for name, sapling_column, parts, transparent in [
        ("unified_full_viewing_keys", "sapling_fvk_bytes", fvk_parts, lambda a: f"m/44'/133'/{a}'"),
        ("unified_incoming_viewing_keys", "sapling_ivk_bytes", ivk_parts, lambda a: f"m/44'/133'/{a}'/0"),
    ]:
        for row in rows(name):
            account = row["account"]
            if row[sapling_column]:
                check(f"{name} account {account} Sapling", parts(derive(seed, [32, 133, account])).hex(), row[sapling_column])
            if row["t_key_bytes"]:
                check(f"{name} account {account} P2PKH", transparent_item(seed, transparent(account)).hex(), row["t_key_bytes"])
    # zcash-swift-wallet-sdk @01eb750 Tests/OfflineTests/DerivationToolTests/DerivationToolMainnetTests.swift:
    # seedData (L14) and expectedViewingKey (L32-38), asserted by testDeriveViewingKeysFromSeed.
    swift = base64.b64decode(SWIFT_SEED)
    found = read("full-viewing-key", SWIFT_UFVK)
    check("Swift SDK UFVK Sapling item", found[SAPLING].hex(), fvk_parts(derive(swift, [32, 133, 0])).hex())
    check("Swift SDK UFVK P2PKH item", found[P2PKH].hex(), transparent_item(swift, "m/44'/133'/0'").hex())
    check("Swift SDK UFVK has an Orchard item", ORCHARD in found, True)
    # The same file's zxviews of that account (L41-46), declared there but not asserted; the
    # worker's full self-test holds it (zcash-sapling-key-self-test.ts).
    key = derive(swift, [32, 133, 0])
    check("Swift SDK declared zxviews", bech32("zxviews", header(key) + fvk_parts(key)), SWIFT_ZXVIEWS)
    # zcash-android-wallet-sdk @1aaf2c4 sdk-lib/src/androidTest/java/cash/z/ecc/android/sdk/jni/TransparentTest.kt:
    # PHRASE (L49-51) and ExpectedMainnet.uAddr (L59), asserted by deriveUnifiedFullViewingKeysFromSeedTest.
    android = bip39_seed(ANDROID_PHRASE)
    # The worker's full self-test holds the phrase as this seed (zcash-sapling-key-self-test.ts).
    check("Android SDK phrase seed", android.hex(), ANDROID_SEED)
    found = read("address", ANDROID_UA)
    key = derive(android, [32, 133, 0])
    check("Android SDK phrase has no Sapling address at j = 0", address(key, 0), None)
    check("Android SDK UA Sapling receiver at j = 1", found[SAPLING].hex(), address(key, 1).hex())
    check("Android SDK UA P2PKH receiver at m/44'/133'/0'/0/1", found[P2PKH].hex(), receiver(android, 0, 1).hex())


def own():
    """The own values of "abandon … about" (no passphrase), account 0, that zcash-sapling.test.ts holds."""
    seed = bip39_seed("abandon " * 11 + "about")
    key = derive(seed, [32, 133, 0])
    for j in range(4):
        raw = address(key, j)
        got = None
        if raw is not None:
            hash_ = receiver(seed, 0, j)
            got = {
                "address": bech32("zs", raw),
                "unifiedAddress": unified("u", item(SAPLING, raw)),
                "unifiedTransparentAddress": unified("u", item(P2PKH, hash_) + item(SAPLING, raw)),
                "transparentReceiver": t1(hash_),
                "diversifier": raw[:11].hex(),
            }
        check(f"own row j = {j}", got, OWN_ROWS[j])
    summary = {
        "unifiedFullViewingKey": unified("uview", item(P2PKH, transparent_item(seed, "m/44'/133'/0'")) + item(SAPLING, fvk_parts(key))),
        "saplingFullViewingKey": bech32("zxviews", header(key) + fvk_parts(key)),
        "unifiedIncomingViewingKey": unified("uivk", item(P2PKH, transparent_item(seed, "m/44'/133'/0'/0")) + item(SAPLING, ivk_parts(key))),
        "saplingSpendingKey": bech32("secret-extended-key-main", xsk(key)),
    }
    check("own account summary", summary, OWN_SUMMARY)


SWIFT_SEED = "9VDVOZZZOWWHpZtq1Ebridp3Qeux5C+HwiRR0g7Oi7HgnMs8Gfln83+/Q1NnvClcaSwM4ADFL1uZHxypEWlWXg=="
SWIFT_UFVK = (
    "uview17fme6ux853km45g9ep07djpfzeydxxgm22xpmr7arzxyutlusalgpqlx7suga4ahzywfuwz4jclm00u7g8u65qvvdt45kttnfunvschssg3h3g06txs9ja32vx3xa8dej3unnat"
    "gzjvd0vumk37t8es3ludldrtse3q6226ws7eq4q0ywz78nudwpepgdn7jmxz8yvp7k6gxkeynkam0f8aqf9qpeaej55zhkw39x7epayhndul0j4xjttdxxlnwcd09nr8svyx8j0zng0w6"
    "scx3m5unpkaqxcm3hslhlfg4caz7r8d4xy9wm7klkg79w7j0uyzec5s3yje20eg946r6rmkf532nfydu26s8q9ua7mwxw2j2ag7hfcuu652gw6uta03vlm05zju3a9rwc4h367kqzfqrc"
    "z35pdwdk2a7yqnk850un3ujxcvve45ueajgvtr6dj4ufszgqwdy0aedgmkalx2p7qed2suarwkr35dl0c8dnqp3"
)
SWIFT_ZXVIEWS = (
    "zxviews1qw28psv0qqqqpqr2ru0kss5equx6h0xjsuk5299xrsgdqnhe0cknkl8uqff34prwkysswfhjk79n8l99f2grd26dqg6dy3jcmxsaypxfsu6ara6vsk3x8l544uaksstx9zre879md"
    "g7s9a7zurrx6pf5qg2n323js2s3zlu8tn3848yyvlg4w38gx75cyv9jdpve77x9eq6rtl6d9qyh8det4edevlnc70tg5kse670x50764gzhy60dta0yv3wsd4fsuaz686lgszcq7kwxy"
)
ANDROID_PHRASE = "deputy visa gentle among clean scout farm drive comfort patch skin salt ranch cool ramp warrior drink narrow normal lunch behind salt deal person"
ANDROID_SEED = "6ef5f84def6f4b9d38f466586a8380a38593bd47c8cda77f091856176da47f26b5bd1c8d097486e5635df5a66e820d28e1d73346f499801c86228d43f390304f"
ANDROID_UA = "u1t23erzgkn7c6c2jn66rspl4m45lg8rn3f7mn7le4yxk7693wr7sgx472jn95s00x8kx3hct5ej4tf76k59dfhsd809t7mzt9ldzw8f5083fw4xqvxfshl9u7ed2wyv6ypmzny0px0nvszslr5kr7fgk2zgfnlycddzqak4adsqjdzp76y7fl0k4ygamjr43t6rpxsf6xql8g20rdk0h"

def matcher():
    """The Wallet Matcher's own values (packages/wallet-recovery/tests/zcash-matcher.test.ts, and the
    forged address in the worker's full self-test), of "abandon … about"'s account 0: its address at
    the last index a row has, j = 2^31 - 1, its first address past it, and a forged address of its
    diversifier at j = 7 with the transmission key that the Android SDK phrase's ivk gives it."""
    seed = bip39_seed("abandon " * 11 + "about")
    key = derive(seed, [32, 133, 0])
    check("own address at j = 2^31 - 1", bech32("zs", address(key, 2**31 - 1)), MATCHER_OWN["last"])
    j = 2**31
    while address(key, j) is None:
        j += 1
    check("own first index from 2^31 with an address", j, MATCHER_OWN["beyondIndex"])
    check("own address at that index", bech32("zs", address(key, j)), MATCHER_OWN["beyond"])
    d = address(key, 7)[:11]
    android = derive(bytes.fromhex(ANDROID_SEED), [32, 133, 0])
    ivk = components(android["ask"], android["nsk"], android["ovk"])[2]
    forged = d + encode(times(ivk, group_hash(b"Zcash_gd", d)))
    check("own forged address (j = 7's d, the Android ivk's pk_d)", bech32("zs", forged), MATCHER_OWN["forged"])


# The Wallet Matcher's own values of zcash-matcher.test.ts and the worker's full self-test.
MATCHER_OWN = {
    "last": "zs198j9j768r6fzetaak6f824ww0a8qctjdfuepdnqdycuuqawgsgsvl2rpr9v67p502u62glumvrn",
    "beyondIndex": 2**31,
    "beyond": "zs1wqzggcepa7zfvjn2hjdnkzzlftd6548kmgqsjhfxzvnsrzlp6w8ykfvlt4qz5qh27rj6kttfl6s",
    "forged": "zs1yjx25acnu8kzlhg2t63evmvess8l4g2565nl6g550ktp3pqa79ycgzu8ecydflluuw5vz5hczlh",
}

# The own values of zcash-sapling.test.ts: rows j = 0 to 3 (None: no Sapling address) and the summary.
OWN_ROWS = {
    0: {
        "address": "zs188wzupg00tqs3y5reyjc758c6vhl8qm2kg4k43mcp533ytrdkwpy8xjdk3zqtek0ng0cv7f0nta",
        "unifiedAddress": "u1rzu6upvddzeedfl66g2lykaturxws9xxjlc2vdz8hyu2n0qymcfjd4ufrgafp9kxpe8r20wpessjsjf6gpsre6chkvayj53gycuyr55r",
        "unifiedTransparentAddress": "u1jl6ww3ud2f6dsu5ekr5cf2myfputgz0s3tqt8ur8zesq3fs6vudh9xyne8p8yha2cd56kzlnrjunc822ue97shduwcnnhyfdlmnh2dzp7jnd0u70tedenafz036flat3jfc273rdj32",
        "transparentReceiver": "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
        "diversifier": "39dc2e050f7ac1089283c9",
    },
    1: {
        "address": "zs18mf5cfxk86548936crvphcfsfemgq20j67sgdgn9wu465hgwy8n3jmavx55pmezxkutrj98kjqf",
        "unifiedAddress": "u1k52dmgg6wt2vavju2f7latk9808h9t6a5teeyex7ndadz2j4utpk0w4zdlnd4t6dpe9jdpvfredp37hx8493ccdf49fdc940ygrwhcwn",
        "unifiedTransparentAddress": "u1503wmgy5rgyqd4kdumd353qu6hycvx6kzsg0d5u29gynxcz083l7yfayexqj8c568pz46d0svvn2m8x4pjk0crw06zdwh3m3t87gtq5y6yfk0fznqknmnygqgnujc5v3f2yvj0c3e27",
        "transparentReceiver": "t1aQ2b1XszNVo15BguYLbQGqETBL9QZA8Jq",
        "diversifier": "3ed34c24d63ea953963ac0",
    },
    2: None,
    3: {
        "address": "zs1c2wlrsejawrdxcmz4sn84ms5myyhs59ez9dpjfjh5rf674hkpwfqgj8qy95q6euj6p82w33psvr",
        "unifiedAddress": "u1tugn8hee4xku237444radlr7ptz5fs8t7cqcpzcmvvxan5ts835ah62nvs9jn4pxaamgn966v9mgfdepldqzr36334kxm4naxsvqll73",
        "unifiedTransparentAddress": "u1l6cnsly2vzfjhjfnmg904qakqp9yjw2scjmvy3lj34954eztny02d2erkw3t8k0nc75d9v2j8g8uhtx6e8ealhdm9gujzwmhrzwzufl8ag0pwujzq7dckpv6e8k6udcu9v8uzpf7apz",
        "transparentReceiver": "t1M4FWL2VYmWy5qEuPUHrhEEcxsdkZ79xYn",
        "diversifier": "c29df1c332eb86d36362ac",
    },
}
OWN_SUMMARY = {
    "unifiedFullViewingKey": "uview1ug8krfwhlae5gs222wu5skekpjarn7garssal4zldex6dkdhgespjcq0cdf53j5y066mv6lnkznv2u3gke2vjxv9m5aq4tsu33wh2y3xuqu9evkmh4z0a3xgjgqxfh09qv7jq3mdf0j3dcyn0tckxgjtfmhrv3f2z7ap9ngjzzglla2x6hz6p9ln7g2hsljpk6aaafmut65sj2ma9d38t2ryn0cntapgrg5m4d24mcs6wa8ty6z0zzhsupr2vmpmfe7x2ng0ujplthjzw2ydllzmfw9rrmrqttlwl50gs4as8k9r06yxwkw3v0v72lpagxq2efjjz0ejy65tnpwd6g7wlux",
    "saplingFullViewingKey": "zxviews1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjd5k8kq2gx555yanx7mv0hsgyw8nn4dmsl44afssw5whnkfqxrgcs343rpv59a97w4320fa3m6jderp4y8rhywd3edkvqetmt9wtde7yx0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qw2wx7h",
    "unifiedIncomingViewingKey": "uivk1lsy9eyhhrm7s6sl283xle9z6k7e072jsaurtwxyhhd0937wq6v92gfm86pc53y0es4nrq0jj9w6rhytfxf4kcz34ngt3xunt706plxclnf9tyt6r36em9y7m3fuf4gt80vdp4nnw6f43jgke4wxjcxkwlzdqlk6z9r8actg5sjjj0h8vxnmqjgauffac6ev2p6ae0q7r0peyckp70yt4se8mxj3td3sygk7lusc3xam0tnqzlq8u7",
    "saplingSpendingKey": "secret-extended-key-main1q00pkhghqqqqpqpjr7aphsx37860r2y85wfgq66meql6jw69ls69aztxjhq8cmnjdhc9v7jnk3utf4g66ddp6cll6fw0vqthr9vnczdjqkxyelkjxgtq2a5g5w6ngqj4rnewvnf3ehh7fzftv4jpkgzrtv4jqjej6zdge4gr0se3lftqty8gvymk3097nzt4mdy34ftxea0yfwg84tgmyjckvpngs4zkwfleqwvd9n870zkjgt5d5s4uxyqcwsh8t298lgl5vf95g9qdtz6vv",
}


if __name__ == "__main__":
    published()
    own()
    matcher()
