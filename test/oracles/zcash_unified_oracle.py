"""Independent reimplementation (standard library only) of ZIP-316's unified encodings, Revision 0, to
check the Deriver's TypeScript (packages/coin-protocols/src/coins/zcash/unified.ts): F4Jumble and its
inverse, the items as CompactSize typecode, CompactSize length and bytes, the HRP padded to 16 bytes,
and Bech32m without a length limit. It first reproduces the published vectors of
zcash/zcash-test-vectors @78321be (test/fixtures/zcash-test-vectors): F4Jumble both ways, the hashes
of the two long F4Jumble vectors, and every unified address, full viewing key and incoming viewing
key, built from its items and read back. Then it builds the own fixtures that
packages/coin-protocols/tests/zcash-unified-fixtures.ts holds, checks each against its literal, and
checks that its own reading refuses each one for the reason the test expects, or reads it. Bech32
comes from cardano_oracle.py. Run from this folder."""
import hashlib
import json
from pathlib import Path

from cardano_oracle import CHARSET, _expand, _polymod, _words
from ed25519_oracle import check

VECTORS = Path(__file__).resolve().parents[1] / "fixtures/zcash-test-vectors"
BECH32M = 0x2BC830A3
L_H = 64
MAX_M = (2**16 + 1) * L_H
MAX_FIELD = 0x2000000
P2PKH, P2SH, SAPLING, ORCHARD = 0, 1, 2, 3
# Jubjub's base field q (protocol specification, "Jubjub") and secp256k1's field p (SEC 2).
JUBJUB_Q = 0x73EDA753299D7D483339D80809A1D80553BDA402FFFE5BFEFFFFFFFF00000001
SECP256K1_P = 2**256 - 2**32 - 977


def rows(name):
    data = json.loads((VECTORS / f"{name}.json").read_text(encoding="utf8"))
    columns = data[1][0].split(", ")
    return [dict(zip(columns, row)) for row in data[2:]]


def xor(left, right):
    return (int.from_bytes(left, "little") ^ int.from_bytes(right, "little")).to_bytes(len(left), "little")


def jumble_h(i, u, length):
    return hashlib.blake2b(u, digest_size=length, person=b"UA_F4Jumble_H" + bytes([i, 0, 0])).digest()


def jumble_g(i, u, length):
    blocks = (length + L_H - 1) // L_H
    return b"".join(
        hashlib.blake2b(u, digest_size=L_H, person=b"UA_F4Jumble_G" + bytes([i]) + j.to_bytes(2, "little")).digest()
        for j in range(blocks)
    )[:length]


def f4jumble(message, inverse=False):
    assert 38 <= len(message) <= MAX_M
    split = min(L_H, len(message) // 2)
    left, right = message[:split], message[split:]
    if not inverse:
        right = xor(right, jumble_g(0, left, len(right)))
        left = xor(left, jumble_h(0, right, len(left)))
        right = xor(right, jumble_g(1, left, len(right)))
        left = xor(left, jumble_h(1, right, len(left)))
    else:
        left = xor(left, jumble_h(1, right, len(left)))
        right = xor(right, jumble_g(1, left, len(right)))
        left = xor(left, jumble_h(0, right, len(left)))
        right = xor(right, jumble_g(0, left, len(right)))
    return left + right


def bech32m(hrp, data, words=None):
    words = _words(data) if words is None else words
    polymod = _polymod(_expand(hrp) + words + [0] * 6) ^ BECH32M
    return hrp + "1" + "".join(CHARSET[w] for w in words + [(polymod >> 5 * (5 - i)) & 31 for i in range(6)])


def compact_size(value):
    if value < 0xFD:
        return bytes([value])
    if value <= 0xFFFF:
        return b"\xfd" + value.to_bytes(2, "little")
    return b"\xfe" + value.to_bytes(4, "little")


def item(typecode, value):
    return compact_size(typecode) + compact_size(len(value)) + value


def padding(hrp):
    return hrp.encode() + bytes(16 - len(hrp))


def unified(hrp, raw, pad=None):
    return bech32m(hrp, f4jumble(raw + padding(pad or hrp)))


def read_compact(raw, at):
    first = raw[at]
    if first < 0xFD:
        return first, at + 1
    size = {0xFD: 2, 0xFE: 4, 0xFF: 8}[first]
    if at + 1 + size > len(raw):
        raise ValueError("encoding")
    value = int.from_bytes(raw[at + 1 : at + 1 + size], "little")
    if value < {2: 0xFD, 4: 0x10000, 8: 0x100000000}[size]:
        raise ValueError("encoding")
    return value, at + 1 + size


def read(kind, text):
    """Reads `text` as Revision 0 of `kind`, refusing with ZIP-316's reason. Items are checked only as
    far as these fixtures need: their lengths, and the encodings that are invalid by definition."""
    hrp = {"address": "u", "full-viewing-key": "uview", "incoming-viewing-key": "uivk"}[kind]
    if text.lower() != text and text.upper() != text:
        raise ValueError("bech32m")
    text = text.lower()
    prefix, _, rest = text.rpartition("1")
    words = [CHARSET.index(c) for c in rest]
    if _polymod(_expand(prefix) + words) != BECH32M:
        raise ValueError("bech32m")
    bits = "".join(format(w, "05b") for w in words[:-6])
    if len(bits) % 8 > 4 or "1" in bits[len(bits) - len(bits) % 8 :]:
        raise ValueError("bech32m")
    data = bytes(int(bits[i : i + 8], 2) for i in range(0, len(bits) - len(bits) % 8, 8))
    if prefix != hrp:
        if prefix.removesuffix("test") in ("zu", "tu", "uvf", "uvi"):
            raise ValueError("revision")
        raise ValueError("network" if prefix == hrp + "test" else "prefix")
    if not 38 <= len(data) <= MAX_M:
        raise ValueError("length")
    raw = f4jumble(data, inverse=True)
    if raw[-16:] != padding(hrp):
        raise ValueError("padding")
    raw, at, previous, found = raw[:-16], 0, -1, {}
    while at < len(raw):
        typecode, at = read_compact(raw, at)
        length, at = read_compact(raw, at)
        if typecode > MAX_FIELD or length > MAX_FIELD or at + length > len(raw):
            raise ValueError("encoding")
        if typecode <= previous:
            raise ValueError("duplicate" if typecode == previous else "order")
        if 0xE0 <= typecode <= 0xFC:
            raise ValueError("must-understand")
        found[typecode], at, previous = raw[at : at + length], at + length, typecode
    for typecode, value in found.items():
        if not valid(kind, typecode, value):
            raise ValueError("item")
    if kind == "address" and P2PKH in found and P2SH in found:
        raise ValueError("transparent")
    if SAPLING not in found and ORCHARD not in found:
        raise ValueError("shielded")
    return found


def valid(kind, typecode, value):
    """The checks of the items these fixtures and vectors hold; True for an item not read."""
    if typecode == P2PKH and kind != "address":
        x = int.from_bytes(value[33:], "big") if len(value) == 65 else 0
        return len(value) == 65 and value[32] in (2, 3) and x < SECP256K1_P
    if typecode in (P2PKH, P2SH) and kind == "address":
        return len(value) == 20
    if typecode == ORCHARD:
        # Only the length of an Orchard item is checked: its encodings are 43, 96 and 64 bytes.
        return len(value) == {"address": 43, "full-viewing-key": 96, "incoming-viewing-key": 64}[kind]
    if typecode != SAPLING:
        return True
    if kind == "address":
        # pk_d must be a canonical encoding: v below q.
        return len(value) == 43 and int.from_bytes(value[11:], "little") & (2**255 - 1) < JUBJUB_Q
    if kind == "full-viewing-key":
        # ak must not be the identity, (0, 1), whose encoding is 01 00 … 00.
        return len(value) == 128 and value[:32] != b"\x01" + bytes(31)
    ivk = int.from_bytes(value[32:], "little")
    return len(value) == 64 and 0 < ivk < 2**251


def published():
    for row in rows("f4jumble"):
        normal, jumbled = bytes.fromhex(row["normal"]), bytes.fromhex(row["jumbled"])
        check(f"F4Jumble of {len(normal)} bytes", f4jumble(normal).hex(), row["jumbled"])
        check(f"F4Jumble inverse of {len(normal)} bytes", f4jumble(jumbled, inverse=True).hex(), row["normal"])
    for row in rows("f4jumble_long"):
        message = bytes(i & 0xFF for i in range(row["length"]))
        jumbled = f4jumble(message)
        check(f"F4Jumble of {row['length']} bytes", hashlib.blake2b(jumbled).hexdigest(), row["jumbled_hash"])
        check(f"F4Jumble inverse of {row['length']} bytes", f4jumble(jumbled, inverse=True) == message, True)
    for name, hrp, kind, text_column, columns in [
        ("unified_address", "u", "address", "unified_addr",
         [(P2PKH, "p2pkh_bytes"), (P2SH, "p2sh_bytes"), (SAPLING, "sapling_raw_addr"), (ORCHARD, "orchard_raw_addr")]),
        ("unified_full_viewing_keys", "uview", "full-viewing-key", "unified_fvk",
         [(P2PKH, "t_key_bytes"), (SAPLING, "sapling_fvk_bytes"), (ORCHARD, "orchard_fvk_bytes")]),
        ("unified_incoming_viewing_keys", "uivk", "incoming-viewing-key", "unified_ivk",
         [(P2PKH, "t_key_bytes"), (SAPLING, "sapling_ivk_bytes"), (ORCHARD, "orchard_ivk_bytes")]),
    ]:
        for index, row in enumerate(rows(name)):
            items = {typecode: bytes.fromhex(row[column]) for typecode, column in columns if row[column]}
            # An unknown item: its typecode column is filled even where its bytes are null.
            unknown = next(key for key in row if key.startswith("unknown") and key.endswith("typecode"))
            if row[unknown.replace("typecode", "bytes")]:
                items[row[unknown]] = bytes.fromhex(row[unknown.replace("typecode", "bytes")])
            raw = b"".join(item(typecode, items[typecode]) for typecode in sorted(items))
            check(f"{name} row {index}", unified(hrp, raw), row[text_column])
            check(f"{name} row {index} read back", read(kind, row[text_column]), items)


def fixtures():
    """The own fixtures of zcash-unified-fixtures.ts: each built from published items, its literal, and
    the reason it is refused for (None when it is read)."""
    address = rows("unified_address")[0]
    sapling, p2pkh = bytes.fromhex(address["sapling_raw_addr"]), bytes.fromhex(address["p2pkh_bytes"])
    # A receiver whose pk_d's v plus q stays below 2^255: the same point written a second way.
    receiver = next(bytes.fromhex(row["sapling_raw_addr"]) for row in rows("unified_address") if (row["sapling_raw_addr"] or "").startswith("9f6e0bf9"))
    v = int.from_bytes(receiver[11:], "little")
    sign, v = v >> 255, v & (2**255 - 1)
    assert v + JUBJUB_Q < 2**255
    second = receiver[:11] + ((v + JUBJUB_Q) | sign << 255).to_bytes(32, "little")
    full = next(row for row in rows("unified_full_viewing_keys") if row["sapling_fvk_bytes"] and row["t_key_bytes"])
    fvk, t_fvk = bytes.fromhex(full["sapling_fvk_bytes"]), bytes.fromhex(full["t_key_bytes"])
    incoming = next(row for row in rows("unified_incoming_viewing_keys") if row["sapling_ivk_bytes"] and row["t_key_bytes"])
    ivk, t_ivk = bytes.fromhex(incoming["sapling_ivk_bytes"]), bytes.fromhex(incoming["t_key_bytes"])
    jumbled = f4jumble(item(SAPLING, sapling) + padding("u"))
    words = _words(jumbled)
    padded_bits = len(words) * 5 - len(jumbled) * 8
    words[-1] |= (1 << padded_bits) - 1
    return [
        ("unordered", "address", unified("u", item(SAPLING, sapling) + item(P2PKH, p2pkh)), "order"),
        ("duplicate", "address", unified("u", item(SAPLING, sapling) * 2), "duplicate"),
        ("Orchard before Sapling", "address", unified("u", item(ORCHARD, sapling) + item(SAPLING, sapling)), "order"),
        ("both transparent", "address", unified("u", item(P2PKH, p2pkh) + item(P2SH, p2pkh) + item(SAPLING, sapling)), "transparent"),
        ("transparent only", "address", unified("u", item(P2PKH, p2pkh)), "shielded"),
        ("must-understand", "address", unified("u", item(SAPLING, sapling) + item(0xE0, bytes(4))), "must-understand"),
        ("must-understand 0xFC", "address", unified("u", item(SAPLING, sapling) + item(0xFC, b"")), "must-understand"),
        ("typecodes 0xDF and 0xFD", "address", unified("u", item(SAPLING, sapling) + item(0xDF, b"") + item(0xFD, b"")), None),
        ("birthday metadata", "address", unified("u", item(SAPLING, sapling) + item(0xC0, bytes(4))), None),
        ("padding of uview", "address", unified("u", item(SAPLING, sapling), pad="uview"), "padding"),
        ("long CompactSize", "address", unified("u", b"\xfd\x02\x00" + compact_size(43) + sapling), "encoding"),
        ("truncated item", "address", unified("u", item(SAPLING, sapling)[:-1]), "encoding"),
        ("typecode above 0x2000000", "address", unified("u", b"\xfe\x01\x00\x00\x02" + compact_size(43) + sapling), "encoding"),
        ("typecode 0x2000000", "address", unified("u", item(SAPLING, sapling) + item(MAX_FIELD, b"")), None),
        ("short Sapling receiver", "address", unified("u", item(SAPLING, sapling[:42])), "item"),
        ("pk_d plus q", "address", unified("u", item(SAPLING, second)), "item"),
        ("P2PKH receiver of 21 bytes", "address", unified("u", item(P2PKH, p2pkh + b"\x00") + item(SAPLING, sapling)), "item"),
        ("Orchard item of 5 bytes", "address", unified("u", item(SAPLING, sapling) + item(ORCHARD, b"\x07" * 5)), "item"),
        ("Orchard item of 22 bytes alone", "address", unified("u", item(ORCHARD, b"\x07" * 22)), "item"),
        ("37 bytes", "address", bech32m("u", bytes(range(37))), "length"),
        ("testnet", "address", unified("utest", item(SAPLING, sapling)), "network"),
        ("Revision 2", "address", unified("zu", item(SAPLING, sapling)), "revision"),
        ("Revision 2 testnet", "address", unified("zutest", item(SAPLING, sapling)), "revision"),
        ("padding bits set", "address", bech32m("u", b"", words), "bech32m"),
        ("identity ak", "full-viewing-key", unified("uview", item(SAPLING, b"\x01" + bytes(31) + fvk[32:])), "item"),
        ("P2PKH key, then identity ak", "full-viewing-key", unified("uview", item(P2PKH, t_fvk) + item(SAPLING, b"\x01" + bytes(31) + fvk[32:])), "item"),
        ("invalid P2PKH key", "full-viewing-key", unified("uview", item(P2PKH, t_fvk[:32] + b"\x02" + b"\xff" * 32) + item(SAPLING, fvk)), "item"),
        ("P2SH in a viewing key", "full-viewing-key", unified("uview", item(P2PKH, t_fvk) + item(P2SH, p2pkh) + item(SAPLING, fvk)), None),
        ("zero ivk", "incoming-viewing-key", unified("uivk", item(SAPLING, ivk[:32] + bytes(32))), "item"),
        ("ivk of 2^251", "incoming-viewing-key", unified("uivk", item(SAPLING, ivk[:32] + bytes(31) + b"\x08")), "item"),
        ("P2PKH key only", "incoming-viewing-key", unified("uivk", item(P2PKH, t_ivk)), "shielded"),
    ]


def own():
    for name, kind, text, reason in fixtures():
        check(f"fixture {name}", text, LITERALS[name])
        try:
            read(kind, text)
            outcome = None
        except ValueError as refusal:
            outcome = str(refusal)
        check(f"fixture {name} outcome", outcome, reason)


# The literals of the own fixtures in zcash-unified-fixtures.ts.
LITERALS = {
    "unordered": "u1rans3uu7cj0xyc7t7wfwqh65pau3aslpksy8jxpay5jf0q4cak9p4masfgl88tsnkh5nr9ly8cp29kv6q2qsdvxcjkc4x78540my82enpg4xv7zpwqeycwvcru38fq4eeqlv5dsfuz6",
    "duplicate": "u1kdqxafj5ev2hln8y7wr9k77gd4jg4gjhnjnsa3vxs4eylz6xpsksf20638ed0uqs3f2wzcfl8vq90h25t0p75t009ljt4k3g7j5rwc6rnmk6gl87zv3vkz3tgp23274kgzwmvhl3sqgeak45wskyhky90ue333ya4s4ul53zhuzjy83g",
    "Orchard before Sapling": "u1hyc9pxt3kjr7a0e2a2faays9x07ze75zfjaqruz9f82at7w6fmxzxkuq8sgzdw54vrdzafkzge3yccu03upjpjah4nrk8d96qmsx08gfj3rqxqweg3u0p43vhfwwq3p00ku4p28rqwjpn804hhdql9mgxp8tgsm764mau0l0ly6t242s",
    "both transparent": "u1seencrsknk7cr82rkjnz4zzjp7ztmamshe0z8rlnegfcn0lvh3ht8lsel77m8xday9esv3g3snky454k0rfaygdqd6kxvlmtr7relgv99qdwzw6v3ftq658j9le9nemgxmz83cjv8u38c4k3ar06vpqkc4pcnkpka7p94tt644q8pk",
    "transparent only": "u1uptfvk09nqmf26h3vtved67enyxqezeknsa43cvafpmyfk5gkmszm36m8jpd2nvzu3u",
    "must-understand": "u14jrf0w38qn8nfe6mc9at8tn5c6gu3zvk5gsr7l7s45vm96plrsh23uqsa0h7ehpqne5ufsmm3xwan85cttrudpk4vyhs52c5z27nn7ctpc0s25w5rd",
    "must-understand 0xFC": "u1htc26ef386l3gdhmlmfsxpy6nee245jgugtsh3ql3u050wc5wyfzh24eqzzrs9hz5lga7yvp33v77scq538y87ykeqzsy0702wccq6ka4qz",
    "typecodes 0xDF and 0xFD": "u10xr7r7atxwtd03j3km3gl6cy989pce2npayk3rpja0uezwwsudrksy2jd9uwz7yyzeqv8rgzmdr50pe8sy6wjldh9xugmkml48mnj2telfaslv6v5w",
    "birthday metadata": "u1tnc89yss69ke5n738gdgl2emtwrudz58fwk8hdz48qfzdljk3rnxqrh66fp9j4vrxfnfn68s22gm5z25rfq09zwnv7jzfqnr2nfevcl672csyvv5sv",
    "padding of uview": "u1h2nngdf6et5s5g6fhe3kguft3558qjq84u6xae0sldkgesynl3scw2894wkytsz66m7p75sry3n7v4ldz3hefmz8qw8rtnfqt50fvf6x",
    "long CompactSize": "u1ev68fjgq3p0eupkhl2qz7v4ntxesf209hk7ywtdnfv4jv0pkv4ckv6jwlnclt54pcuplwd7wmdtvua6t52zar0mnkqjzmgvh00a4j78f60j",
    "truncated item": "u18nlqsj4utjsz5zxjwp7mdjp6eqynacwaqmvxc894ln9pkjajashpxxypt6jn9mr9xnh469dtawep9am2yau2c03g2cq8chm697wvnz",
    "typecode above 0x2000000": "u1jg7ny7vxxddwz6n24yy8ym8t3as2v6r7jylxcus7qs8xyyhm6c2zhcww0gq4srwdg0xrwndy6ssyp797e99y05seevs0w299cm36l3zcnmep98",
    "typecode 0x2000000": "u1ur8w0n4gr9sjes8jrnze8q4h4d2ywwapc4um92jzpu5k0rmjekse5xve783pc7m4r0yk3u8twnk5ygt0mzv3rl4ze7yz72rnps2ehvnct79smfk0t0",
    "short Sapling receiver": "u1nnn8g5tayk45259wg2h78gzqrkv57p8fj6x50l4hdnu4kwecf2g3fs5re7qsm3c84z446x048as6pw9pk7eyl2h32mw6s0l5e92l4m",
    "pk_d plus q": "u1yudmu9fz5xt7myrwr9pwqs9sy4ztnyqvhlmkjhk7pn8hs4januacez9kkqxnhm2tjpy38nzrzs5nl0e4kdhejac46g6m5wcdjux7afz7",
    "P2PKH receiver of 21 bytes": "u14z6ed3r9wjkm4rcnkpe8v4vgfxzdhqqmrrl08ceqcg0kzxrxnkjthtc0cn0mzfzpw8jh9x0kh2fd58pmx7gn2t7dsn0r6csqfqpe67d2am3fxgn99f6cnmhn3txfpxjjyyexd4cpqpp73",
    "Orchard item of 5 bytes": "u1mx0ck0qhnahl2drvhpvkd3d36tw9c48k8a2mthvg8hq4vkj5wc89ykfme9vcvp3qsp4ysulz5zz2jx7ktxkgl6j9pcj26kqspjrgjny6nrg0jqe6dlx",
    "Orchard item of 22 bytes alone": "u104pppykulu0f7xrxk7sj0ytmfykx7pmc73hvds9lr7xsul2f2gtrtj99mgu620z9w8pqze",
    "37 bytes": "u1qqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0jqgfzyvjqfxlp5c",
    "testnet": "utest1eg8xn8elv57zj668gquxekx0hp9j66mczqunfnct6wptr7qc5hgydzzea89sftc9zqw08akv8a85l2jsyfshdgnquyclkadely0zta30",
    "Revision 2": "zu1f6j724maqljlkjmhrs2l5rwwm9lede59ltmgqg706p8axyh25gccjl2k37ywskgu07rlhclqd2swwn02vyxa7yzwvhq68mwkgu4uw2hw",
    "Revision 2 testnet": "zutest1v8s2lnn3pjafxph4fm3p0r7yxnsvsdsada4uzlxvc3s3jan4wh736slserd8uaa3hyrd987u8tr9k6mfa0tlgg3q29kklfzksqsv5s7l",
    "padding bits set": "u1eu3dyegpyue9fkk6e0ac8x3jdylk90uu8uxfvwshwd4xylgfc9h8x2wfxvrttgf5xrfr2je9w8ur8qgrc29cex2ddd6gwhfxg0993xvk",
    "identity ak": "uview1uaeulq98v3mjwvxq5np3qe5s0snftp0plxxpqcn88ue45e5eeuqmptel5xflqax2wnyeennyst5pejw3nj60phpknsggyfwm4zsannzeuw00yg7xssamwcz3yc6tffadpxkt542e6q0vp7x8wwlkr8yguu8cjaak4hg0wk0n2cnjydhz5fqr5jnt675pjfcaf9uvmwejd89znk8ftwxskhq5v0phg8rxvh9v7ymzevlh30t3",
    "P2PKH key, then identity ak": "uview18c7zj697v597dtftqwquevl4tm07e20au48yq043c667raz39k72vrjgsgw0wpzc4yvl9nf6htk9rhe4fdlr2nj4g9fprtzru0de2l0dlzj5paesz9cf92y6rujrvspwxs5vyc4p6kn3m8gy2jstsp4ll7ljedzdej847xp44ffc6nm82jcz2c4gc53evlkawmwuvydaf8zvq6tmtw7jtv6r8j5egtjt99wpvujdyz07wsdh4j578z9rlna3z4wjtq3nhke5s6hxukuhk5fc8cqd9xzpn7ucyvdp694mzpme9j35y3r5ma9qd6vqnh6rxm08fpwcp4h8kmy6jr6zwr4tjsc",
    "invalid P2PKH key": "uview1p4svflm7f76ug4nf4e4smfjrqh2vnrrz4k4rllhmstf3dsy9xftcyqk2g773gappe6j2azdm47zn29ftu6s9phg9jcfd9rhwu7n50vs8a49v3s5gq0mmd9yn9ke7ml338f5ax5pt3hmcnuv6g2xca9dxws0da79fqsktjunr90xd4lcm07u2dwapn38f6rgdwak78n9plazall9vxm3lpe5ut4nvx0mqzm9u55n9l79e8h9msvcelqecgttmpdzckmlfs84cc3430szhmyaql9svdexs4me3tygs84d9wpkvcswll2ly2946fnug4rjlqdk8l7fx3kr3e56vn7eqsycamwh",
    "P2SH in a viewing key": "uview1m4wpnaqnxnx2p5xt067mjl5yywhv5ypgvtlvr4he4ayug60uahf9hsua7nlm55uqr0nyuuaw8w4ytenhn6ffv389mkrr3p02h42dcnvud89jtvkwjrkjapsm60quf5rlczjjcghv2c8uaaslt0nthes5xm4349nwqxsdz82cus3udp9rxpefs3m5k4qtv4v39yh476gkqazezw25gxknmc9zztkl7ahg7y9zek4rq6knp29mmrypamfnx78cd7rsv8ygrkkuame3df6v72zw5ha3lufhrl7jg86v55tyak6v4kzplulekr69dy2csmuxj9q3plgymrv7kyyunr8j3ekqmnvtmsujcpr6rxfdcpzn66lp29pnqvh87s2aft",
    "zero ivk": "uivk1s8vsdlnr3rkvkp2evq2p7cmcrgvkhugp272lmhq6jp860m2sj24mjs9tg42splfk2j85af0jp3qlzcye9pnjymdnucxrkhljaemw0hlls6ewdhpur8plw5tv24kk3dgpse3s0fuy6z",
    "ivk of 2^251": "uivk1mesu8kz89d5nx46glghk7tejfa3gqez3q7hm4y4vneu5d4wp7p6vs0m6n9z3y2ruulcf049ymyv6c4q46yl3hejrks80wv3l4422x4zpkvj6h2dv8au3xsgpd0jsgs4a30psnserq5",
    "P2PKH key only": "uivk16lp2p7txn4wgerc25v9eycgwt0g05nf8lrf0jvt9apha2lpw94nkge8zhngq99pu3hqf9y287wzgud6ttr388tgwj9st3hegwc2u6ttcrwpmg6frml7sd9slde46d56n2m7tu78wy7c",
}


if __name__ == "__main__":
    published()
    own()
