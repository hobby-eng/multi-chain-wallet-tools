"""Independent reimplementation (standard library only) of BIP32 on secp256k1 and the base58 forms
of the Deriver's BIP44 coins, to check its TypeScript: account extended keys, WIF private keys,
Dogecoin's dgub keys and the old address forms of Bitcoin Cash and Litecoin. It first reproduces
the published BIP32 master key of the "abandon ... about" phrase (BIP86's vector)."""
import hashlib
import hmac
import sys

P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8,
)


def add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % P == 0:
        return None
    if a == b:
        slope = 3 * a[0] * a[0] * pow(2 * a[1], -1, P) % P
    else:
        slope = (b[1] - a[1]) * pow(b[0] - a[0], -1, P) % P
    x = (slope * slope - a[0] - b[0]) % P
    return (x, (slope * (a[0] - x) - a[1]) % P)


def mul(k, point=G):
    result = None
    while k:
        if k & 1:
            result = add(result, point)
        point = add(point, point)
        k >>= 1
    return result


def ser(point):
    return bytes([2 + (point[1] & 1)]) + point[0].to_bytes(32, "big")


def h160(data):
    return hashlib.new("ripemd160", hashlib.sha256(data).digest()).digest()


B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58check(data):
    data = data + hashlib.sha256(hashlib.sha256(data).digest()).digest()[:4]
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + out


SEED = bytes.fromhex(
    "5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1"
    "9a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4"
)
_MASTER_HMAC = hmac.new(b"Bitcoin seed", SEED, hashlib.sha512).digest()
MASTER = (int.from_bytes(_MASTER_HMAC[:32], "big"), _MASTER_HMAC[32:])


def ckd(node, index):
    k, chain = node
    parent = b"\0" + k.to_bytes(32, "big") if index >= 2**31 else ser(mul(k))
    out = hmac.new(chain, parent + index.to_bytes(4, "big"), hashlib.sha512).digest()
    return ((int.from_bytes(out[:32], "big") + k) % N, out[32:])


def walk(path):
    node, parent, index = MASTER, None, 0
    for part in path.split("/")[1:]:
        index = int(part.rstrip("'")) + (2**31 if part.endswith("'") else 0)
        parent, node = node, ckd(node, index)
    return node, parent, index, len(path.split("/")) - 1


def extended_public(path, version):
    node, parent, index, depth = walk(path)
    fingerprint = h160(ser(mul(parent[0])))[:4] if parent else b"\0\0\0\0"
    return b58check(
        version.to_bytes(4, "big")
        + bytes([depth])
        + fingerprint
        + index.to_bytes(4, "big")
        + node[1]
        + ser(mul(node[0]))
    )


def wif(path, version):
    key = walk(path)[0][0].to_bytes(32, "big")
    return b58check(bytes([version]) + key + b"\x01")


def check(label, got, want):
    if got != want:
        sys.exit(f"MISMATCH {label}: {got} != {want}")
    print(f"ok {label}")


def main():
    XPUB, DGUB = 0x0488B21E, 0x02FACAFD
    check(
        "BIP86 master xpub of abandon ... about",
        extended_public("m", XPUB),
        "xpub661MyMwAqRbcFkPHucMnrGNzDwb6teAX1RbKQmqtEF8kK3Z7LZ59qafCjB9eC"
        "RLiTVG3uxBxgKvRgbubRhqSKXnGGb1aoaqLrpMBDrVxga8",
    )
    # The account keys of the Deriver's startup vectors
    # (packages/verification/src/derivation-self-test-*.ts).
    ACCOUNT_KEYS = [
        ("litecoin", "m/44'/2'/0'", XPUB, "xpub6BnJJjq783EdyBeQPA9P9ao9DTS3fUqyKG5NJDcrCiwwxEkesGoHN94LZRGE7rz1jgcvmmp8j55BNx573KFq1WBwKiemzkdfNKffKx6Mvku"),
        ("dogecoin", "m/44'/3'/0'", DGUB, "dgub8rUhDtD3YFGZTUphBfpBbzvFxSMKQXYLzg87Me2ta78r2SdVLmypBUkkxrrn9RTnchsyiJSkHZyLWxD13ibBiXtuFWktBoDaGaZjQUBLNLs"),
        ("dogecoin master", "m", DGUB, "dgub8kXBZ7ymNWy2RzFfCuAkHMfuUEjbxDK33snqz5r7YTvUsExaHDbWWdju6FedaPkBTDmwMqtGHL8NhLDczSVBKMdpJHR6KrcTDQdnwPMrQZU"),
        ("bitcoin-cash", "m/44'/145'/0'", XPUB, "xpub6ByHsPNSQXTWZ7PLESMY2FufyYWtLXagSUpMQq7Un96SiThZH2iJB1X7pwviH1WtKVeDP6K8d6xxFzzoaFzF3s8BKCZx8oEDdDkNnp4owAZ"),
        ("zcash", "m/44'/133'/0'", XPUB, "xpub6CLX6bXDznyoBCRaHYmzfApq4dLc34UydL1gRHQTG55pNwbKSC2GvXjTQ4VS3n6P24fRd14uKz7P92xJQ3MWdRzUxGkqiftZf3riboiJLJs"),
        ("xrp", "m/44'/144'/0'", XPUB, "xpub6CFKyZTfzj3cyeRLUDKwQQ5s1tqTTdVgywKMVkrB2i1taGFbhazkxDzWVsfBHZpv7rg6qpDBGYR5oA8iazEfa44CdQkkknPFHJ7YCzncCS9"),
        ("tron", "m/44'/195'/0'", XPUB, "xpub6D1AabNHCupeiLM65ZR9UStMhJ1vCpyV4XbZdyhMZBiJXALQtmn9p42VTQckoHVn8WNqS7dqnJokZHAHcHGoaQgmv8D45oNUKx6DZMNZBCd"),
        ("ethereum-classic", "m/44'/61'/0'", XPUB, "xpub6CqTNrUVV95XgHEP2LVe42cdpWKh2jeA4GnyXrQ219wJJVPAFajkbuFEdzf6xfGgdJWrhKuK5p8v47vxVQHFGU85J1J8Di95Z6hFJx8GhYz"),
        ("cosmos", "m/44'/118'/0'", XPUB, "xpub6DGzViq8bmgMLYdVZ3xnLVEdKwzBnGdzzJZ4suG8kVb9TTLAbrwv8YdKBb8FWKdBNinaHKmBv7JpQvqBYx4rxch7WnHzNFzSVrMf8hQepTP"),
        ("injective", "m/44'/60'/0'", XPUB, "xpub6DCoCpSuQZB2jawqnGMEPS63ePKWkwWPH4TU45Q7LPXWuNd8TMtVxRrgjtEshuqpK3mdhaWHPFsBngh5GFZaM6si3yZdUsT8ddYM3PwnATt"),
        ("hedera ECDSA", "m/44'/3030'/0'", XPUB, "xpub6CX2E9DvXXF9J6g7wRAvFR46xWpN7zwH1zT7BsuCbAf8TWWfhHiWTdakYTCeyuzNEig4kSL7jEnJjCXmCG4ez9Lum9iLW1shdpAvfGLMeAK"),
    ]
    for name, path, version, expected in ACCOUNT_KEYS:
        check(f"{name} extended key {path}", extended_public(path, version), expected)
    # The WIF private keys and old address forms of packages/coin-protocols/tests/bip44-coins.test.ts.
    WIFS = [
        ("litecoin", "m/44'/2'/0'/0/0", 176, "T5b4RiWRs7XG8xZ2bCHBoJcn4JrpMTbGRFYXgoZHd7nD8izwqhMK"),
        ("dogecoin", "m/44'/3'/0'/0/0", 158, "QPkeC1ZfHx3c9g7WTj9cQ8gnvk2iSAfAcbq1aVAWjNTwDAKfZUzx"),
        ("zcash", "m/44'/133'/0'/0/0", 0x80, "KzEVy5oaBPhVPxH43bUg1g1zTv5Jitvc9nZesqqqc18Edi4bHQbu"),
        ("bitcoin-cash", "m/44'/145'/0'/0/0", 0x80, "KxbEv3FeYig2afQp7QEA9R3gwqdTBFwAJJ6Ma7j1SkmZoxC9bAXZ"),
    ]
    for name, path, version, expected in WIFS:
        check(f"{name} WIF {path}", wif(path, version), expected)
    BCH_KEY = ser(mul(walk("m/44'/145'/0'/0/0")[0][0]))
    check("bitcoin-cash legacy form", b58check(b"\0" + h160(BCH_KEY)), "1mW6fDEMjKrDHvLvoEsaeLxSCzZBf3Bfg")
    REDEEM = b"\x00\x14" + h160(ser(mul(walk("m/49'/2'/0'/0/0")[0][0])))
    check("litecoin old P2SH form", b58check(b"\x05" + h160(REDEEM)), "31jkZShyVAMkVz5cQpu4qp73DrAXtFP3rZ")
    check("litecoin P2SH form", b58check(b"\x32" + h160(REDEEM)), "M7wtsL7wSHDBJVMWWhtQfTMSYYkyooAAXM")


if __name__ == "__main__":
    main()
