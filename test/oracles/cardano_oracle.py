"""Independent reimplementation (standard library only) of Cardano's keys and addresses, to check the
Deriver's TypeScript: BIP39 entropy, CIP-3's Icarus, Icarus-Trezor and Ledger roots, BIP32-Ed25519
(Khovratovich and Law, the "V2" children of cardano-serialization-lib and Trezor), CIP-19 addresses
and CIP-5 bech32 texts. It first reproduces published vectors (CIP-3, CIP-11, CIP-19,
cardano-serialization-lib, cardano-addresses, Trezor's fixtures, BIP85's 12-word child), then checks
the inputs and the own values that the Deriver's Cardano self-test, unit tests and browser case hold
(packages/verification/src/derivation-self-test-cardano.ts, packages/coin-protocols/tests/
cardano.test.ts, tooling/browser-cases/cardano.mjs); BIP85's BIP39 application uses bip32_oracle.py's
BIP32 derivation. The English BIP39 word list is the installed @scure/bip39 one, refused unless its
SHA-256 is that of BIP39's english.txt. Run from this folder."""
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


def public(kl):
    x, y, z, _ = _mul(int.from_bytes(kl, "little") % L, G)
    inverse = pow(z, P - 2, P)
    x, y = x * inverse % P, y * inverse % P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


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


if __name__ == "__main__":
    published()
    deriver()
    child_wallet()
