"""AUD-026 functional reviewer: an independent reference implementation in pure Python.

It shares no code with the production TypeScript (which uses @noble/@scure): secp256k1 point
arithmetic, BIP39, BIP32, Base58Check, Bech32/Bech32m (BIP173/BIP350 reference algorithm),
BIP86 Taproot tweak, Keccak-256 and EIP-55 are written here from the specifications. Only
Python's hashlib (SHA-256, SHA-512, RIPEMD-160, PBKDF2-HMAC) and hmac are used as primitives.

Self-checks at import time reproduce published vectors (BIP39 Trezor vector 0, BIP32 test
vector 1, BIP84/BIP86/BIP49 published first addresses, Keccak-256 empty string, EIP-55
examples) so a mistake here fails loudly instead of agreeing with production by accident.
"""

import hashlib
import hmac
import os
import unicodedata

# --- secp256k1 (SEC 2) -------------------------------------------------------------------------
P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)


def point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % P == 0:
        return None
    if a == b:
        lam = 3 * a[0] * a[0] * pow(2 * a[1], P - 2, P) % P
    else:
        lam = (b[1] - a[1]) * pow(b[0] - a[0], P - 2, P) % P
    x = (lam * lam - a[0] - b[0]) % P
    return (x, (lam * (a[0] - x) - a[1]) % P)


def _jac_double(p):
    x, y, z = p
    if y == 0:
        return (0, 0, 0)
    s = 4 * x * y * y % P
    m = 3 * x * x % P
    nx = (m * m - 2 * s) % P
    return (nx, (m * (s - nx) - 8 * y**4) % P, 2 * y * z % P)


def _jac_add(p, q):
    if p[2] == 0:
        return q
    if q[2] == 0:
        return p
    u1 = p[0] * q[2] ** 2 % P
    u2 = q[0] * p[2] ** 2 % P
    s1 = p[1] * q[2] ** 3 % P
    s2 = q[1] * p[2] ** 3 % P
    if u1 == u2:
        return _jac_double(p) if s1 == s2 else (0, 0, 0)
    h = u2 - u1
    r = s2 - s1
    h2 = h * h % P
    h3 = h * h2 % P
    nx = (r * r - h3 - 2 * u1 * h2) % P
    return (nx, (r * (u1 * h2 - nx) - s1 * h3) % P, h * p[2] * q[2] % P)


def point_mul(k, point=G):
    """Double-and-add in Jacobian coordinates; the affine point_add above stays the reference
    for single additions (Taproot tweak, public CKD)."""
    acc = (0, 0, 0)
    add = (point[0], point[1], 1)
    while k:
        if k & 1:
            acc = _jac_add(acc, add)
        add = _jac_double(add)
        k >>= 1
    if acc[2] == 0:
        return None
    zi = pow(acc[2], P - 2, P)
    return (acc[0] * zi * zi % P, acc[1] * zi * zi * zi % P)


def ser_compressed(point):
    return bytes([2 + (point[1] & 1)]) + point[0].to_bytes(32, "big")


def ser_uncompressed(point):
    return b"\x04" + point[0].to_bytes(32, "big") + point[1].to_bytes(32, "big")


def parse_compressed(data):
    x = int.from_bytes(data[1:], "big")
    y = pow((pow(x, 3, P) + 7) % P, (P + 1) // 4, P)
    if (y & 1) != (data[0] & 1):
        y = P - y
    assert (y * y - x**3 - 7) % P == 0
    return (x, y)


# --- hashes --------------------------------------------------------------------------------------
def sha256(data):
    return hashlib.sha256(data).digest()


def hash160(data):
    return hashlib.new("ripemd160", sha256(data)).digest()


def tagged_hash(tag, data):
    t = sha256(tag.encode())
    return sha256(t + t + data)


_KECCAK_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_KECCAK_ROT = [
    [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
]
_M64 = (1 << 64) - 1


def _rol(v, n):
    return ((v << n) | (v >> (64 - n))) & _M64 if n else v


def _keccak_f(a):
    for rc in _KECCAK_RC:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(a[x][y], _KECCAK_ROT[x][y])
        a = [[b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y]) for y in range(5)] for x in range(5)]
        a[0][0] ^= rc
    return a


def keccak256(data):
    """Original Keccak-256 (pad 0x01), as Ethereum uses, not FIPS 202 SHA3-256 (pad 0x06)."""
    rate = 136
    msg = bytearray(data) + b"\x01"
    while len(msg) % rate:
        msg += b"\x00"
    msg[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off : off + rate]
        for i in range(rate // 8):
            x, y = i % 5, i // 5
            a[x][y] ^= int.from_bytes(block[8 * i : 8 * i + 8], "little")
        a = _keccak_f(a)
    out = b""
    for i in range(4):
        x, y = i % 5, i // 5
        out += a[x][y].to_bytes(8, "little")
    return out


# --- Base58Check and Bech32 ------------------------------------------------------------------------
B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58encode(data):
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + out


def b58check(data):
    return b58encode(data + sha256(sha256(data))[:4])


def b58decode_check(text):
    n = 0
    for ch in text:
        n = n * 58 + B58.index(ch)
    pad = len(text) - len(text.lstrip("1"))
    body = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    raw = b"\x00" * pad + body
    assert sha256(sha256(raw[:-4]))[:4] == raw[-4:], "bad base58 checksum"
    return raw[:-4]


CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values):
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if ((top >> i) & 1) else 0
    return chk


def _hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]


def bech32_encode(hrp, data5, m):
    const = 0x2BC830A3 if m else 1
    poly = _polymod(_hrp_expand(hrp) + data5 + [0] * 6) ^ const
    checksum = [(poly >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(CHARSET[d] for d in data5 + checksum)


def convertbits(data, frombits, tobits, pad=True):
    acc = bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    for value in data:
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad and bits:
        ret.append((acc << (tobits - bits)) & maxv)
    return ret


def segwit_address(hrp, version, program):
    return bech32_encode(hrp, [version] + convertbits(program, 8, 5), version != 0)


# --- BIP39 ------------------------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
WORDLIST_SHA256 = "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda"


def load_wordlist():
    """The English list, read from any copy on disk and accepted only by its published SHA-256."""
    path = os.path.join(_HERE, "../../../node_modules/@scure/bip39/wordlists/english.js")
    text = open(path, encoding="utf-8").read()
    words = text[text.index("`") + 1 : text.rindex("`")].strip().split("\n")
    raw = ("\n".join(words) + "\n").encode()
    assert len(words) == 2048
    assert hashlib.sha256(raw).hexdigest() == WORDLIST_SHA256, "wordlist is not the BIP39 list"
    return words


WORDS = load_wordlist()
WORD_INDEX = {w: i for i, w in enumerate(WORDS)}


def entropy_to_mnemonic(entropy):
    bits = len(entropy) * 8
    cs = bits // 32
    value = (int.from_bytes(entropy, "big") << cs) | (sha256(entropy)[0] >> (8 - cs))
    count = (bits + cs) // 11
    return " ".join(WORDS[(value >> (11 * (count - 1 - i))) & 2047] for i in range(count))


def mnemonic_to_entropy(mnemonic):
    words = mnemonic.split(" ")
    assert len(words) in (12, 15, 18, 21, 24)
    value = 0
    for w in words:
        value = (value << 11) | WORD_INDEX[w]
    total = len(words) * 11
    cs = total // 33
    ent_bits = total - cs
    entropy = (value >> cs).to_bytes(ent_bits // 8, "big")
    if (value & ((1 << cs) - 1)) != (sha256(entropy)[0] >> (8 - cs)):
        raise ValueError("checksum")
    return entropy


def mnemonic_to_seed(mnemonic, passphrase=""):
    m = unicodedata.normalize("NFKD", mnemonic).encode()
    s = ("mnemonic" + unicodedata.normalize("NFKD", passphrase)).encode()
    return hashlib.pbkdf2_hmac("sha512", m, s, 2048)


# --- BIP32 ------------------------------------------------------------------------------------------
HARDENED = 2**31
XPRV, XPUB = 0x0488ADE4, 0x0488B21E
TPRV, TPUB = 0x04358394, 0x043587CF


class Node:
    def __init__(self, key, chain, depth=0, parent_fp=b"\0\0\0\0", index=0, private=True):
        self.key = key  # int for private, point for public
        self.chain = chain
        self.depth = depth
        self.parent_fp = parent_fp
        self.index = index
        self.private = private

    @classmethod
    def from_seed(cls, seed):
        i = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
        k = int.from_bytes(i[:32], "big")
        assert 0 < k < N
        return cls(k, i[32:])

    def point(self):
        if not self.private:
            return self.key
        if getattr(self, "_point", None) is None:
            self._point = point_mul(self.key)
        return self._point

    def pub(self):
        return ser_compressed(self.point())

    def fingerprint(self):
        return hash160(self.pub())[:4]

    def child(self, index):
        if index >= HARDENED:
            assert self.private
            data = b"\0" + self.key.to_bytes(32, "big") + index.to_bytes(4, "big")
        else:
            data = self.pub() + index.to_bytes(4, "big")
        i = hmac.new(self.chain, data, hashlib.sha512).digest()
        il = int.from_bytes(i[:32], "big")
        assert il < N
        if self.private:
            k = (il + self.key) % N
            assert k
            key = k
        else:
            key = point_add(point_mul(il), self.key)
        return Node(key, i[32:], self.depth + 1, self.fingerprint(), index, self.private)

    def derive(self, path):
        node = self
        parts = path.split("/")
        assert parts[0] == "m"
        for part in parts[1:]:
            hard = part.endswith("'") or part.endswith("h")
            idx = int(part.rstrip("'h"))
            node = node.child(idx + (HARDENED if hard else 0))
        return node

    def neuter(self):
        return Node(self.point(), self.chain, self.depth, self.parent_fp, self.index, False)

    def serialize(self, version_private, version_public, private=None):
        private = self.private if private is None else private
        version = version_private if private else version_public
        body = (
            version.to_bytes(4, "big")
            + bytes([self.depth])
            + self.parent_fp
            + self.index.to_bytes(4, "big")
            + self.chain
        )
        body += (b"\0" + self.key.to_bytes(32, "big")) if private else self.pub()
        return b58check(body)


def wif(privkey_int, prefix, compressed=True):
    return b58check(bytes([prefix]) + privkey_int.to_bytes(32, "big") + (b"\x01" if compressed else b""))


def p2pkh(pub, version):
    return b58check(bytes([version]) + hash160(pub))


def p2sh_p2wpkh(pub, version):
    redeem = b"\x00\x14" + hash160(pub)
    return b58check(bytes([version]) + hash160(redeem))


def p2wpkh(pub, hrp):
    return segwit_address(hrp, 0, hash160(pub))


def taproot_output(pub_point):
    """BIP86: Q = lift_x(P) + int(TapTweak(x(P)))G, with no script tree."""
    p = pub_point if pub_point[1] % 2 == 0 else (pub_point[0], P - pub_point[1])
    xonly = p[0].to_bytes(32, "big")
    t = int.from_bytes(tagged_hash("TapTweak", xonly), "big")
    assert t < N
    q = point_add(p, point_mul(t))
    return xonly, t, q


def p2tr(pub_point, hrp):
    _, _, q = taproot_output(pub_point)
    return segwit_address(hrp, 1, q[0].to_bytes(32, "big"))


def eth_address(pub_point):
    raw = keccak256(ser_uncompressed(pub_point)[1:])[-20:].hex()
    h = keccak256(raw.encode()).hex()
    return "0x" + "".join(c.upper() if c in "abcdef" and int(h[i], 16) >= 8 else c for i, c in enumerate(raw))


def descriptor_checksum(desc):
    """BIP380 descriptor checksum, transcribed from the BIP's reference algorithm."""
    input_charset = (
        "0123456789()[],'/*abcdefgh@:$%{}"
        "IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~"
        'ijklmnopqrstuvwxyzABCDEFGH`#"\\ '
    )
    checksum_charset = CHARSET

    def polymod(c, val):
        c0 = c >> 35
        c = ((c & 0x7FFFFFFFF) << 5) ^ val
        for i, g in enumerate([0xF5DEE51989, 0xA9FDCA3312, 0x1BAB10E32D, 0x3706B1677A, 0x644D626FFD]):
            if c0 & (1 << i):
                c ^= g
        return c

    c = 1
    cls = 0
    clscount = 0
    for ch in desc:
        pos = input_charset.find(ch)
        assert pos != -1
        c = polymod(c, pos & 31)
        cls = cls * 3 + (pos >> 5)
        clscount += 1
        if clscount == 3:
            c = polymod(c, cls)
            cls = 0
            clscount = 0
    if clscount > 0:
        c = polymod(c, cls)
    for _ in range(8):
        c = polymod(c, 0)
    c ^= 1
    return desc + "#" + "".join(checksum_charset[(c >> (5 * (7 - j))) & 31] for j in range(8))


# --- self-checks against published vectors ---------------------------------------------------------
def _self_check():
    abandon = "abandon " * 11 + "about"
    # BIP39 Trezor vector 0 (python-mnemonic vectors.json).
    assert entropy_to_mnemonic(bytes(16)) == abandon
    assert mnemonic_to_seed(abandon, "TREZOR").hex() == (
        "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553"
        "1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04"
    )
    # BIP32 test vector 1, chain m/0H.
    m = Node.from_seed(bytes.fromhex("000102030405060708090a0b0c0d0e0f"))
    assert m.key.to_bytes(32, "big").hex() == (
        "e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35"
    )
    assert m.chain.hex() == "873dff81c02f525623fd1fe5167eac3a55a049de3d314bb42ee227ffed37d508"
    assert m.serialize(XPRV, XPUB, private=False) == (
        "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8"
    )
    m0h = m.derive("m/0'")
    assert m0h.serialize(XPRV, XPUB, private=False) == (
        "xpub68Gmy5EdvgibQVfPdqkBBCHxA5htiqg55crXYuXoQRKfDBFA1WEjWgP6LHhwBZeNK1VTsfTFUHCdrfp1bgwQ9xv5ski8PX9rL2dZXvgGDnw"
    )
    # BIP84 published first receive address of the abandon mnemonic.
    root = Node.from_seed(mnemonic_to_seed(abandon))
    assert root.fingerprint().hex() == "73c5da0a"
    assert p2wpkh(root.derive("m/84'/0'/0'/0/0").pub(), "bc") == "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
    # BIP86 published first receive address.
    assert p2tr(root.derive("m/86'/0'/0'/0/0").point(), "bc") == (
        "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"
    )
    # BIP49 published test vector uses testnet coin 1 ("abandon ... about").
    assert p2sh_p2wpkh(root.derive("m/49'/1'/0'/0/0").pub(), 0xC4) == "2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2"
    # BIP44 first legacy address of the abandon mnemonic (widely published).
    assert p2pkh(root.derive("m/44'/0'/0'/0/0").pub(), 0) == "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA"
    # Keccak-256 of the empty string, and an EIP-55 example from the EIP.
    assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    raw = "5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"
    h = keccak256(raw.encode()).hex()
    eip = "0x" + "".join(c.upper() if c in "abcdef" and int(h[i], 16) >= 8 else c for i, c in enumerate(raw))
    assert eip == "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
    # BIP380 checksum example from the descriptor documentation.
    assert descriptor_checksum("addr(mkmZxiEcEd8ZqjQWVZuC6so5dFMKEFpN2j)") == (
        "addr(mkmZxiEcEd8ZqjQWVZuC6so5dFMKEFpN2j)#02wpgw69"
    )


_self_check()
