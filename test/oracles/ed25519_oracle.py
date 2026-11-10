"""Independent reimplementation (standard library only) of BIP39 seeds, SLIP-10 Ed25519 and the
address forms of Stellar, Solana, NEAR and Hedera, to check the Deriver's TypeScript. Ed25519 follows
RFC 8032's reference arithmetic. It first reproduces published vectors, then prints the Deriver's
startup vectors for the "abandon ... about" phrase."""
import base64
import hashlib
import hmac
import sys

P = 2**255 - 19
D = -121665 * pow(121666, P - 2, P) % P
GY = 4 * pow(5, P - 2, P) % P


def _xrecover(y):
    xx = (y * y - 1) * pow(D * y * y + 1, P - 2, P)
    x = pow(xx, (P + 3) // 8, P)
    if (x * x - xx) % P != 0:
        x = x * pow(2, (P - 1) // 4, P) % P
    return P - x if x % 2 else x


G = (_xrecover(GY), GY, 1, _xrecover(GY) * GY % P)


def _add(a, b):
    x1, y1, z1, t1 = a
    x2, y2, z2, t2 = b
    aa = (y1 - x1) * (y2 - x2) % P
    bb = (y1 + x1) * (y2 + x2) % P
    cc = t1 * 2 * D * t2 % P
    dd = z1 * 2 * z2 % P
    e, f, g, h = bb - aa, dd - cc, dd + cc, bb + aa
    return (e * f % P, g * h % P, f * g % P, e * h % P)


def _mul(s, point):
    q = (0, 1, 1, 0)
    while s:
        if s & 1:
            q = _add(q, point)
        point = _add(point, point)
        s >>= 1
    return q


def ed25519_public(seed32):
    h = hashlib.sha512(seed32).digest()
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    x, y, z, _ = _mul(a, G)
    zi = pow(z, P - 2, P)
    x, y = x * zi % P, y * zi % P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def bip39_seed(phrase, passphrase=""):
    return hashlib.pbkdf2_hmac("sha512", phrase.encode(), ("mnemonic" + passphrase).encode(), 2048)


def slip10(seed, path):
    i = hmac.new(b"ed25519 seed", seed, hashlib.sha512).digest()
    key, chain = i[:32], i[32:]
    for index in path:
        data = b"\x00" + key + (index + 0x80000000).to_bytes(4, "big")
        i = hmac.new(chain, data, hashlib.sha512).digest()
        key, chain = i[:32], i[32:]
    return key


B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58(data):
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\x00"))) + out


def crc16_xmodem(data):
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def strkey(version, payload):
    body = bytes([version]) + payload
    crc = crc16_xmodem(body)
    return base64.b32encode(body + bytes([crc & 0xFF, crc >> 8])).decode().rstrip("=")


def check(label, got, want):
    if got != want:
        sys.exit(f"MISMATCH {label}: {got} != {want}")
    print(f"ok {label}")


def main():
    ABOUT = "abandon " * 11 + "about"
    # Published vectors first (SEP-0005 tests 1 and 5, near-seed-phrase, Hiero SDK).
    k = slip10(bip39_seed("illness spike retreat truth genius clock brain pass fit cave bargain toe"), [44, 148, 0])
    check("SEP-0005 test 1 G", strkey(6 << 3, ed25519_public(k)), "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6")
    check("SEP-0005 test 1 S", strkey(18 << 3, k), "SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN")
    k = slip10(bip39_seed(ABOUT), [44, 148, 0])
    check("SEP-0005 test 5 G", strkey(6 << 3, ed25519_public(k)), "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX")
    k = slip10(bip39_seed("shoot island position soft burden budget tooth cruel issue economy destroy above"), [44, 397, 0])
    check("near-seed-phrase public", "ed25519:" + base58(ed25519_public(k)), "ed25519:r4yuiZE45mzeZAENDEF2pWeFBJkW8mQYGx3rU46zCqh")
    check("near-seed-phrase secret", "ed25519:" + base58(k + ed25519_public(k)), "ed25519:3jFpZEcbhcjpqVE27zU3d7WHcS7Wq716v5WryU8Tj4EaNTHTj8iAhtPW7KCdFV2fnjNf9toawUbdqZnhrRtLKe6w")
    HIERO = "inmate flip alley wear offer often piece magnet surge toddler submit right radio absent pear floor belt raven price stove replace reduce plate home"
    k = slip10(bip39_seed(HIERO), [44, 3030, 0, 0, 0])
    check("Hiero ed25519 private", k.hex(), "f8dcc99a1ced1cc59bc2fee161c26ca6d6af657da9aa654da724441343ecd16f")
    check("Hiero ed25519 public", ed25519_public(k).hex(), "2e42c9f5a5cdbde64afa65ce3dbaf013d5f9ff8d177f6ef4eb89fbe8c084ec0d")
    k = slip10(bip39_seed(HIERO, "some pass"), [44, 3030, 0, 0, 0])
    check("Hiero ed25519 public, passphrase", ed25519_public(k).hex(), "fd311925a7a04b38f7508931c6ae6a93e5dc4394d83dafda49b051c0017d3380")
    check("wallet-core Solana (key 0x46)", base58(ed25519_public(bytes([0x46] * 32))), "H4JcMPicKkHcxxDjkyyrLoQj7Kcibd9t815ak4UvTr9M")
    check("wallet-core Stellar (key 0x46)", strkey(6 << 3, ed25519_public(bytes([0x46] * 32))), "GDXJHJHWN6GRNOAZXON6XH74ZX6NYFAS5B7642RSJQVJTIPA4ZYUQLEB")
    # The Deriver's startup and test values for the public phrase.
    seed = bip39_seed(ABOUT)
    DERIVER = [
        ("solana m/44'/501'/0'/0'", [44, 501, 0, 0], "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk"),
        ("solana m/44'/501'/0'", [44, 501, 0], "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL"),
        ("solana m/44'/501'/1'/0'", [44, 501, 1, 0], "Hh8QwFUA6MtVu1qAoq12ucvFHNwCcVTV7hpWjeY1Hztb"),
    ]
    for name, path, expected in DERIVER:
        check(name, base58(ed25519_public(slip10(seed, path))), expected)
    check(
        "near m/44'/397'/0'",
        ed25519_public(slip10(seed, [44, 397, 0])).hex(),
        "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
    )
    check(
        "hedera m/44'/3030'/0'/0'/0'",
        ed25519_public(slip10(seed, [44, 3030, 0, 0, 0])).hex(),
        "10fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
    )


if __name__ == "__main__":
    main()
