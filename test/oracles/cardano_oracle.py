"""Independent reimplementation (standard library only) of Cardano's keys and addresses, to check the
Deriver's TypeScript: BIP39 entropy, CIP-3's Icarus, Icarus-Trezor and Ledger roots, BIP32-Ed25519
(Khovratovich and Law, the "V2" children of cardano-serialization-lib and Trezor), CIP-19 addresses,
CIP-5 bech32 texts and CIP-8's signatures in deterministic CBOR. It first reproduces published
vectors (CIP-3, CIP-11, CIP-19, cardano-serialization-lib, cardano-addresses, Trezor's fixtures,
BIP85's 12-word child, and the CIP-8 signatures of cardano-signer and Trezor, byte for byte), then
checks the inputs and the own values that the Deriver's Cardano self-tests, unit tests and browser
case hold (packages/verification/src/derivation-self-test-cardano.ts,
apps/key-derivation/src/workers/message-signer-self-test-cardano.ts,
packages/coin-protocols/tests/cardano*.test.ts, tooling/browser-cases/cardano.mjs); BIP85's BIP39
application uses bip32_oracle.py's BIP32 derivation. The English BIP39 word list is the installed
@scure/bip39 one, refused unless its SHA-256 is that of BIP39's english.txt. Run from this folder."""
import hashlib
import hmac
import re
from pathlib import Path

from bip32_oracle import B58, ckd
from ed25519_oracle import G, P, _mul, bip39_seed, check

WORDLIST = Path(__file__).resolve().parents[2] / "node_modules/@scure/bip39/wordlists/english.js"
WORDS = re.search(r"`([^`]*)`", WORDLIST.read_text(encoding="utf8")).group(1).split()
# bitcoin/bips bip-0039/english.txt, one word per line.
ENGLISH_SHA256 = "2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda"
assert hashlib.sha256(("\n".join(WORDS) + "\n").encode()).hexdigest() == ENGLISH_SHA256
INDEX = {word: index for index, word in enumerate(WORDS)}
L = 2**252 + 27742317777372353535851937790883648493
HARDENED = 2**31


def entropy_of(phrase):
    words = phrase.split()
    bits = "".join(format(INDEX[word], "011b") for word in words)
    checksum = len(words) // 3
    entropy = int(bits[:-checksum], 2).to_bytes((len(bits) - checksum) // 8, "big")
    assert format(hashlib.sha256(entropy).digest()[0], "08b")[:checksum] == bits[-checksum:]
    return entropy


def phrase_of(entropy):
    bits = "".join(format(byte, "08b") for byte in entropy)
    bits += "".join(format(byte, "08b") for byte in hashlib.sha256(entropy).digest())[: len(entropy) // 4]
    return " ".join(WORDS[int(bits[i : i + 11], 2)] for i in range(0, len(bits), 11))


def bip85_phrase(master, words, index):
    """BIP85's BIP39 application: the English phrase of m/83696968'/39'/0'/words'/index'."""
    node = master
    for level in (83696968, 39, 0, words, index):
        node = ckd(node, level + HARDENED)
    k = hmac.new(b"bip-entropy-from-k", node[0].to_bytes(32, "big"), hashlib.sha512).digest()
    return phrase_of(k[: words * 4 // 3])


def root_bits(key):
    key = bytearray(key)
    key[0] &= 0b1111_1000
    key[31] = (key[31] & 0b0001_1111) | 0b0100_0000
    return bytes(key)


def icarus_root(entropy, password=b"", trezor=False):
    salt = entropy + hashlib.sha256(entropy).digest()[:1] if trezor and len(entropy) == 32 else entropy
    return root_bits(hashlib.pbkdf2_hmac("sha512", password, salt, 4096, 96))


def ledger_root(seed):
    i = hmac.new(b"ed25519 seed", seed, hashlib.sha512).digest()
    while i[31] & 0b0010_0000:
        i = hmac.new(b"ed25519 seed", i, hashlib.sha512).digest()
    chain = hmac.new(b"ed25519 seed", b"\x01" + seed, hashlib.sha256).digest()
    return root_bits(i[:32]) + i[32:] + chain


def point_bytes(scalar):
    x, y, z, _ = _mul(scalar % L, G)
    inverse = pow(z, P - 2, P)
    x, y = x * inverse % P, y * inverse % P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


def public(kl):
    return point_bytes(int.from_bytes(kl, "little"))


def sign(kl, kr, message):
    """Ed25519 by an extended key (the paper's §III.B): r = SHA-512(kR ‖ M), S = r + SHA-512(R ‖ A ‖ M) · kL."""
    r = int.from_bytes(hashlib.sha512(kr + message).digest(), "little") % L
    commitment = point_bytes(r)
    x = int.from_bytes(hashlib.sha512(commitment + public(kl) + message).digest(), "little") % L
    return commitment + ((r + x * int.from_bytes(kl, "little")) % L).to_bytes(32, "little")


def child(key, index):
    kl, kr, chain = key[:32], key[32:64], key[64:]
    number = index.to_bytes(4, "little")
    body = kl + kr + number if index >= HARDENED else public(kl) + number
    tags = (b"\x00", b"\x01") if index >= HARDENED else (b"\x02", b"\x03")
    z = hmac.new(chain, tags[0] + body, hashlib.sha512).digest()
    c = hmac.new(chain, tags[1] + body, hashlib.sha512).digest()
    kl = (int.from_bytes(kl, "little") + 8 * int.from_bytes(z[:28], "little")) % 2**256
    kr = (int.from_bytes(kr, "little") + int.from_bytes(z[32:], "little")) % 2**256
    return kl.to_bytes(32, "little") + kr.to_bytes(32, "little") + c[32:]


def derive(root, path):
    for level in path.split("/")[1:]:
        root = child(root, int(level.rstrip("'")) + (HARDENED if level.endswith("'") else 0))
    return root


CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values):
    chk = 1
    for value in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ value
        for i, gen in enumerate((0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)):
            chk ^= gen if (top >> i) & 1 else 0
    return chk


def _expand(prefix):
    return [ord(c) >> 5 for c in prefix] + [0] + [ord(c) & 31 for c in prefix]


def _words(data):
    bits = "".join(format(byte, "08b") for byte in data)
    bits += "0" * (-len(bits) % 5)
    return [int(bits[i:i + 5], 2) for i in range(0, len(bits), 5)]


def bech32(prefix, data):
    words = _words(data)
    polymod = _polymod(_expand(prefix) + words + [0] * 6) ^ 1
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return prefix + "1" + "".join(CHARSET[w] for w in words + checksum)


def unbech32(text):
    prefix, _, rest = text.rpartition("1")
    words = [CHARSET.index(c) for c in rest]
    assert _polymod(_expand(prefix) + words) == 1, "bech32 checksum"
    bits = "".join(format(w, "05b") for w in words[:-6])
    return bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits) - len(bits) % 8, 8))


def key_hash(public_key):
    return hashlib.blake2b(public_key, digest_size=28).digest()


def base(payment, stake):
    return bech32("addr", b"\x01" + key_hash(payment) + key_hash(stake))


def enterprise(payment):
    return bech32("addr", b"\x61" + key_hash(payment))


def reward(stake):
    return bech32("stake", b"\xe1" + key_hash(stake))


def address(root, account, role, index):
    """The base address of m/1852'/1815'/account'/role/index, or the reward address for role 2."""
    stake = public(derive(root, f"m/1852'/1815'/{account}'/2/0")[:32])
    if role == 2:
        return reward(public(derive(root, f"m/1852'/1815'/{account}'/2/{index}")[:32]))
    return base(public(derive(root, f"m/1852'/1815'/{account}'/{role}/{index}")[:32]), stake)


def xvk(key):
    return public(key[:32]) + key[64:]


def published():
    # CIP-3 Icarus.md and Ledger_BitBox02.md "Test vectors" (cardano-foundation/CIPs @7720fed).
    eight = entropy_of("eight country switch draw meat scout mystery blade tip drift useless good keep usage title")
    check("CIP-3 Icarus", icarus_root(eight).hex(), "c065afd2832cd8b087c4d9ab7011f481ee1e0721e78ea5dd609f3ab3f156d245d176bd8fd4ec60b4731c3918a2a72a0226c0cd119ec35b47e4d55884667f552a23f7fdcd4a10c6cd2c7393ac61d877873e248f417634aa3d812af327ffe9d620")
    check("CIP-3 Icarus, passphrase foo", icarus_root(eight, b"foo").hex(), "70531039904019351e1afb361cd1b312a4d0565d4ff9f8062d38acf4b15cce41d7b5738d9c893feea55512a3004acb0d222c35d3e3d5cde943a15a9824cbac59443cf67e589614076ba01e354b1a432e0e6db3b59e37fc56b5fb0222970a010e")
    for phrase, passphrase, root in [
        ("recall grace sport punch exhibit mad harbor stand obey short width stem awkward used stairs wool ugly trap season stove worth toward congress jaguar", "", "a08cf85b564ecf3b947d8d4321fb96d70ee7bb760877e371899b14e2ccf88658104b884682b57efd97decbb318a45c05a527b9cc5c2f64f7352935a049ceea60680d52308194ccef2a18e6812b452a5815fbd7f5babc083856919aaf668fe7e4"),
        ("correct cherry mammal bubble want mandate polar hazard crater better craft exotic choice fun tourist census gap lottery neglect address glow carry old business", "", "587c6774357ecbf840d4db6404ff7af016dace0400769751ad2abfc77b9a3844cc71702520ef1a4d1b68b91187787a9b8faab0a9bb6b160de541b6ee62469901fc0beda0975fe4763beabd83b7051a5fd5cbce5b88e82c4bbaca265014e524bd"),
        ("abandon " * 23 + "art", "foo", "f053a1e752de5c26197b60f032a4809f08bb3e5d90484fe42024be31efcba7578d914d3ff992e21652fee6a4d99f6091006938fac2c0c0f9d2de0ba64b754e92a4f3723f23472077aa4cd4dd8a8a175dba07ea1852dad1cf268c61a2679c3890"),
    ]:
        check("CIP-3 Ledger " + phrase.split()[0], ledger_root(bip39_seed(phrase, passphrase)).hex(), root)
    # CIP-19 README "Test Vectors"; CIP-11 README "Test vectors".
    payment, stake = unbech32("addr_vk1w0l2sr2zgfm26ztc6nl9xy8ghsk5sh6ldwemlpmp9xylzy4dtf7st80zhd"), unbech32("stake_vk1px4j0r2fk7ux5p23shz8f3y5y2qam7s954rgf3lg5merqcj6aetsft99wu")
    check("CIP-19 type 0", base(payment, stake), "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x")
    check("CIP-19 type 6", enterprise(payment), "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8")
    check("CIP-19 type 14", reward(stake), "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw")
    cip11 = icarus_root(entropy_of("prevent company field green slot measure chief hero apple task eagle sunset endorse dress seed"))
    check("CIP-11 reward", address(cip11, 0, 2, 0), "stake1uy8ykk8dzmeqxm05znz65nhr80m0k3gxnjvdngf8azh6sjc6hyh36")
    # Emurgo/cardano-serialization-lib @6b42538 rust/src/tests/{crypto,address}.rs.
    check("CSL xprv_128 root", icarus_root(bytes.fromhex("0ccb74f36b7da1649a8144675522d4d8097c6412")).hex(), "b8f2bece9bdfe2b0282f5bad705562ac996efb6af96b648f4445ec44f47ad95c10e3d72f26ed075422a36ed8585c745a0e1150bcceba2357d058636991f38a3791e248de509c070d812ab2fda57860ac876bc489192c1ef4ce253c197ee219a4")
    walk = icarus_root(bytes.fromhex("df9ed25ed146bf43336a5d7cf7395994"))
    check("CSL bip32_12 base", address(walk, 0, 0, 0), "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7")
    check("CSL bip32_12 enterprise", enterprise(public(derive(walk, "m/1852'/1815'/0'/0/0")[:32])), "addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8")
    check("CSL bip32_12 reward", address(walk, 0, 2, 0), "stake1uyevw2xnsc0pvn9t9r9c7qryfqfeerchgrlm3ea2nefr9hqxdekzz")
    check("CSL bip32_24 base", address(icarus_root(bytes.fromhex("4e828f9a67ddcff0e6391ad4f26ddb7579f59ba14b6dd4baf63dcfdb9d2420da")), 0, 0, 0), "addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nfawemmn8k8ttq8f3gag0h89aepvx3xf69g0l9pf80tqv7cve0l33sdn8p3d")
    # IntersectMBO/cardano-addresses @27a2776 test/golden/addresses_5574d91d/golden (its phrase is
    # CSL bip32_12's) and addresses_775fd04c/golden.
    check("cardano-addresses 5574d91d rootXPrv", bech32("root_xsk", walk), "root_xsk1vzrzr76vqyqlavclduhawqvtae2pq8lk0424q7t8rzfjyhhp530zxv2fwq5a3pd4vdzqtu6s2zxdjhww8xg4qwcs7y5dqne5k7mz27p6rcaath83rl20nz0v9nwdaga9fkufjuucza8vmny8qpkzwstk5qh7s88m")
    golden = unbech32("root_xsk1nzwq05qw3573slqc2he9g68qz0a3hjkexsc0ck3f3gjesqs33az3aprtwwnz0322ky75navetwzk8ve2mpsvqxdz3v9e2vsfe5gmcxzr2j9pn432xnghzjc6cgvsx5jwllat5qxy7n7tyqmyjesmv83v5cg2v2tz")
    check("cardano-addresses 775fd04c accXPrv0", bech32("acct_xsk", derive(golden, "m/1852'/1815'/0'")), "acct_xsk1grmww8c9yftkd6nlmuh7wypx46duh8az7sxyg88fr4k3qpc33azk8gc5ntllturxzee5gj2zd5dy48f0ehp6lqudkwvacxjznz8j0mzd2ad0t2fmmaystgms97k7maz3afvy0ywjxwk7jzt96cyt43tnqsr5dmk0")
    check("cardano-addresses 775fd04c addrXPub0", bech32("addr_xvk", xvk(derive(golden, "m/1852'/1815'/0'/0/0"))), "addr_xvk1lytzhygjvgftw9gqazwu0k33zywlc9rx48ey7j9rfel222wj6vup0mpq663q84emmgc9vw7jpu5uswnn972jfst2jwccz7v2ltmcsrgmnsayh")
    # trezor-firmware @433075c common/tests/fixtures/cardano/get_public_key.derivations.json and
    # get_base_address.derivations.json: one 24-word phrase under each master key.
    very = "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north"
    roots = {
        "Icarus": icarus_root(entropy_of(very)),
        "Icarus-Trezor": icarus_root(entropy_of(very), trezor=True),
        "Ledger": ledger_root(bip39_seed(very)),
    }
    for name, account, addr in [
        ("Icarus", "8946b80aaa2ab0839276ca373d0b7845803ae39e452ac2469986bf8b360b217f85e096c7789c5aa29012633044750b1a79ab5ac2eb7189c91113e8ffbadd550f", "addr1q996av5n0379tp8yllaxtgj3ffntmlrsl9sah237h65x6yt76a24dxtkgy59n8tvk00jf5dwfp8cz50g0uheuzfddcnqxp4njq"),
        ("Icarus-Trezor", "8a97a956fadbc79e09a867ed1e829af4f66a34903c9194de44c87262dfe19111dd97903ff01f4fcb6375c8252b31a59d9b170c1b61f5786304dc676270f44a90", "addr1q8g9th06vccxzl96nr905al0vgg2t0fqfxrxmv7ecye3x2e66sl9kvzd905ad5natzd5wghy2w3a9lm0y7u7c5sv0c2snql3c4"),
        ("Ledger", "09a48c3390586bf1b5141e141fd2045b54f0a100af4254abb9bcf124eb82b078abb4f1731e9bb4151fb8bbe4a63c64b84a6e6193ef2b97edd4176136d55c235f", "addr1q8afdsv8q9hr4z8qljl3qz3rvm048g8j506j6umrpg63nytg4txp8fd25x5lnmkdh5p9wudkh4llu4dxyc3jyjef0gwqa5dzfd"),
    ]:
        check(f"Trezor {name} account key", xvk(derive(roots[name], "m/1852'/1815'/0'")).hex(), account)
        check(f"Trezor {name} base address", address(roots[name], 0, 0, 0), addr)


def deriver():
    # The inputs of the Deriver's startup self-test: the BIP39 entropy and seed of Trezor's phrase,
    # the entropy of CIP-3's Icarus phrase, and that of "abandon ... about".
    very = "very improve such purity recipe deer giggle shuffle bamboo sorry galaxy damp confirm note easy pause coast purse often hint west angle spare north"
    check("Trezor phrase entropy", entropy_of(very).hex(), "f2ee4361d72b3a72987e3b1219ed7b9b92ef2d51750b2cd5d266b5ef9611b41c")
    check("Trezor phrase seed", bip39_seed(very).hex(), "426bd949026f254474036a979a70382ecb17da226cf86e3eb4528f5de603ce52f4d1427ce54fff64c35320fd5643534c6f4ec047b2cecd6322a07f1bea789ee1")
    eight = entropy_of("eight country switch draw meat scout mystery blade tip drift useless good keep usage title")
    check("CIP-3 phrase entropy", eight.hex(), "46e62370a138a182a498b8e2885bc032379ddf38")
    check("Icarus-Trezor below 24 words is Icarus", icarus_root(eight, b"foo", trezor=True).hex(), icarus_root(eight, b"foo").hex())
    about = "abandon " * 11 + "about"
    check("abandon ... about entropy", entropy_of(about).hex(), "00" * 16)
    # The own values: a change address and receive address #5 of "abandon ... about" under Icarus and
    # Ledger, which no published vector covers.
    for name, root, change, fifth in [
        ("Icarus", icarus_root(entropy_of(about)), "addr1qykhadtnvjpkxh76xgr0mu4huc9tg800x2sxsqemn9uz8jh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq28kufu", "addr1q9pydq93mn8yahz7zkzh80tfla330pjruy9r7975uk5nu7l927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq8vtmft"),
        ("Ledger", ledger_root(bip39_seed(about)), "addr1qx666n5qs5c8gjqjfr2v4c3ny209ng5s0rsthnuels0el0sayfawlf9hwv2fzuygt2km5v92kvf8e3s3mk7ynxw77cwq6avqke", "addr1q8muu868678ae33qfj2ccu6fu4t0492eewtujzq09kyrwwgayfawlf9hwv2fzuygt2km5v92kvf8e3s3mk7ynxw77cwq5kt7sh"),
    ]:
        check(f"{name} m/1852'/1815'/0'/1/0", address(root, 0, 1, 0), change)
        check(f"{name} m/1852'/1815'/0'/0/5", address(root, 0, 0, 5), fifth)


def child_wallet():
    # BIP85's published 12-word child of its xprv (bitcoin/bips bip-0085.mediawiki), then the own
    # value of the browser case (tooling/browser-cases/cardano.mjs): the 12-word child, index 0, of
    # cardano-serialization-lib's phrase, and its first base address under Ledger.
    xprv = 0
    for char in "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb":
        xprv = xprv * 58 + B58.index(char)
    data = xprv.to_bytes(82, "big")
    assert hashlib.sha256(hashlib.sha256(data[:78]).digest()).digest()[:4] == data[78:]
    check("BIP85 12-word child", bip85_phrase((int.from_bytes(data[46:78], "big"), data[13:45]), 12, 0), "girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose")
    seed = hmac.new(b"Bitcoin seed", bip39_seed("test walk nut penalty hip pave soap entry language right filter choice"), hashlib.sha512).digest()
    child = bip85_phrase((int.from_bytes(seed[:32], "big"), seed[32:]), 12, 0)
    check("BIP85 12-word child of the CSL phrase", child, "bike relax legend rely potato boat pulp journey barrel decorate two bring")
    check("Its Ledger m/1852'/1815'/0'/0/0", address(ledger_root(bip39_seed(child)), 0, 0, 0), "addr1qyrsgsdts7tgf5xsrfuq2u3anyq2wtwehtkyd58qy44vh6kgca7ldrtxc4lrlltnmwv04cn5a8j86qzaqvcsfjz9ccssdum093")


def cbor(value):
    """RFC 8949's deterministic encoding of the values CIP-8 uses: integers, bytes, text, arrays,
    maps (keys sorted by their encodings) and booleans."""
    def head(major, n):
        if n < 24:
            return bytes([major << 5 | n])
        for info, size in ((24, 1), (25, 2), (26, 4), (27, 8)):
            if n < 1 << 8 * size:
                return bytes([major << 5 | info]) + n.to_bytes(size, "big")
        raise ValueError(n)
    if value is False or value is True:
        return b"\xf5" if value else b"\xf4"
    if isinstance(value, int):
        return head(0, value) if value >= 0 else head(1, -1 - value)
    if isinstance(value, bytes):
        return head(2, len(value)) + value
    if isinstance(value, str):
        return head(3, len(value.encode())) + value.encode()
    if isinstance(value, list):
        return head(4, len(value)) + b"".join(cbor(item) for item in value)
    items = sorted((cbor(key), cbor(item)) for key, item in value.items())
    return head(5, len(items)) + b"".join(key + item for key, item in items)


def cip8(kl, kr, address, payload):
    """CIP-30 signData's COSE_Sign1 and COSE_Key (CIP-8) of `payload` for `address`, and the signature."""
    protected = cbor({1: -8, "address": address})
    signature = sign(kl, kr, cbor(["Signature1", protected, b"", payload]))
    sign1 = cbor([protected, {"hashed": False}, payload, signature])
    return sign1, cbor({1: 1, 3: -8, -1: 6, -2: public(kl)}), signature


def data_signature(kl, kr, address, message):
    """The DataSignature that the Deriver writes: CIP-30's object, its members in hex."""
    sign1, key, _ = cip8(kl, kr, address, message)
    return '{"signature":"%s","key":"%s"}' % (sign1.hex(), key.hex())


def message_signing():
    # gitmachtl/cardano-signer @3cc4a74 README.md "Hello world": a plain Ed25519 key; RFC 8032's
    # expansion of it (kL clamped, kR) is the extended key that signs, the input of the worker's
    # startup answer.
    digest = hashlib.sha512(bytes.fromhex("16275bd6647f94a53e9fe1c71439a258a03c13cadf32935ed5388972ebd7e53f")).digest()
    kl = bytearray(digest[:32])
    kl[0] &= 0b1111_1000
    kl[31] = (kl[31] & 0b0111_1111) | 0b0100_0000
    kl, kr = bytes(kl), digest[32:]
    signer_address = bytes.fromhex("617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8")
    check("cardano-signer public key", public(kl).hex(), "755b017578b701dc9ddd4eaee67015b4ca8baf66293b7b1d204df426c0ceccb9")
    check("cardano-signer address is the key's", key_hash(public(kl)), signer_address[1:])
    check("cardano-signer Sig_structure", cbor(["Signature1", cbor({1: -8, "address": signer_address}), b"", b"Hello world"]).hex(), "846a5369676e617475726531582aa201276761646472657373581d617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8404b48656c6c6f20776f726c64")
    sign1, key, _ = cip8(kl, kr, signer_address, b"Hello world")
    check("cardano-signer COSE_Sign1", sign1.hex(), "84582aa201276761646472657373581d617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8a166686173686564f44b48656c6c6f20776f726c645840fc58155f0cee05bc00e7299af1df1f159ac82a46a055786b259657934eff346eec81349d4678ceabc79f213c66a2bdbfd4ea5d9ebdc630bee5ac9cce75cfc001")
    check("cardano-signer COSE_Key", key.hex(), "a4010103272006215820755b017578b701dc9ddd4eaee67015b4ca8baf66293b7b1d204df426c0ceccb9")
    check("cardano-signer key as kL ‖ kR", (kl + kr).hex(), "6844e21291a90fcd57b8472a707fea2758e315411fe809ac17a4c3b12476944a1ff5a381b976d133e6d16f7d834695a523a76ddb3153bb51c4e6e620db67fb1f")
    check("cardano-signer address", bech32("addr", signer_address), "addr1v9ux8dwy800s5pnq327g9uzh8f2fw98ldytxqaxumh3e8kqumfr6d")
    # trezor-firmware @433075c common/tests/fixtures/cardano/sign_message.json: the key of
    # m/1852'/1815'/4'/0/0 of "all ... all" signs "ff00" for account 0's base address, and "Test"
    # with its own key hash in the header.
    trezor = derive(icarus_root(entropy_of(" ".join(["all"] * 12))), "m/1852'/1815'/4'/0/0")
    check("Trezor sign_message public key", public(trezor[:32]).hex(), "67e3d14e1e0db2a6ff68832994451f63d3e92a4ee85c3681d72634ccfe889f2c")
    check("Trezor sign_message for an address", cip8(trezor[:32], trezor[32:64], bytes.fromhex("0180f9e2c88e6c817008f3a812ed889b4a4da8e0bd103f86e7335422aa122a946b9ad3d2ddf029d3a828f0468aece76895f15c9efbd69b4277"), bytes.fromhex("ff00"))[2].hex(), "9efaff0b74c0beb2cadd727d8bafe13b31107235c5fc46c6c33e596e024d391c9fbe37072e43965add6ee0a4788562382031486b74fd59d636aa1ca3b1ddfe06")
    check("Trezor sign_message for a key hash", cip8(trezor[:32], trezor[32:64], key_hash(public(trezor[:32])), b"Test")[2].hex(), "2201b8e7fa9ea919935e06ecc3e845433855066acaaf61cb8e624a2eb7139b73a9d126e7ee04548fff06ac933bd5419fc78c5aebee9b536cbee1481b52ec3e03")
    # The own values of the unit tests and the full self-test: the self-test message signed by
    # "abandon ... about"'s Icarus receive key 0 for its base address, and by its stake key for its
    # reward address.
    about = icarus_root(entropy_of("abandon " * 11 + "about"))
    message = b"Offline message signing self-test"
    for name, path, role, public_key, answer in [
        ("base", "m/1852'/1815'/0'/0/0", 0, "7ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a", '{"signature":"845846a2012767616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d7465737458401e9079ca1f27e29008c5616764a82e02efeb03765c2df7258a59672d22987f2bfe2348a6753fedcdc1fe36b7722b219e4e2e067dd86af075945bbeb0af53c607","key":"a40101032720062158207ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a"}'),
        ("reward", "m/1852'/1815'/0'/2/0", 2, "012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160", '{"signature":"84582aa201276761646472657373581de1e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d746573745840dce6f448d1f69cbc7b4aac5e169d3068a509a4b72c6ea99c01880479d6bd6ee8136826199a2ca4ec0155971844871eaf6405c04f03bdb108d57af3eec8181002","key":"a4010103272006215820012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160"}'),
    ]:
        key = derive(about, path)
        check(f"own {name} key", public(key[:32]).hex(), public_key)
        check(f"own {name} DataSignature", data_signature(key[:32], key[32:64], unbech32(address(about, 0, role, 0)), message), answer)
    # The stake key's signature for the base address, which names it as the base address does but is
    # no signature of the base address's payment key: the verifier must refuse it.
    stake = derive(about, "m/1852'/1815'/0'/2/0")
    base_address = unbech32(address(about, 0, 0, 0))
    check("own stake key's COSE_Sign1 for the base address", cip8(stake[:32], stake[32:64], base_address, message)[0].hex(), "845846a2012767616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d74657374584011a9600c20f2feeb2a2dad910cf1c5faa19ae6a5e4f61b56f16d95d49f4196fa841f757c94f76a7ed20dd582408e012c434bf5981e9df604c54161976d2ed100")
    # Lace's shape (cardano-js-sdk through emurgo's message-signing): the address also as the key id,
    # 4 in the protected header and 2 in the COSE_Key, which the Deriver reads but never writes.
    pay = derive(about, "m/1852'/1815'/0'/0/0")
    protected = cbor({1: -8, 4: base_address, "address": base_address})
    signature = sign(pay[:32], pay[32:64], cbor(["Signature1", protected, b"", message]))
    check("own Lace-shaped COSE_Sign1", cbor([protected, {"hashed": False}, message, signature]).hex(), "845882a30127045839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d17667616464726573735839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176a166686173686564f458214f66666c696e65206d657373616765207369676e696e672073656c662d746573745840fd34eee083f107a3f39791bfe62609cc45efb7e2083e0dd6fef00ca78d03ca9e257edb6f924aed6ace1323262c64c91cd921c4760550f05669821770de33220e")
    check("own Lace-shaped COSE_Key", cbor({1: 1, 2: base_address, 3: -8, -1: 6, -2: public(pay[:32])}).hex(), "a50101025839010fdc780023d8be7c9ff3a6bdc0d8d3b263bd0cc12448c40948efbf42e557890352095f1cf6fd2b7d1a28e3c3cb029f48cf34ff890a28d176032720062158207ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a")


if __name__ == "__main__":
    published()
    deriver()
    child_wallet()
    message_signing()
