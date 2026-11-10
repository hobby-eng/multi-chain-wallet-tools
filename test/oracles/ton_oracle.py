"""Independent reimplementation (standard library only) of TON's mnemonic keys, BOC parsing, cell
hashing and wallet addresses (v3R2, v4R2, W5), to check the Deriver's TypeScript. It first
reproduces published values: the W5 code hash of ton-blockchain/wallet-contract-v5, the v4R2 code
hash and depth of Ledger's app-ton, the v3R2 code hash and depth from the code ton-org/ton publishes,
wallet-core's state inits and addresses, and ton-crypto's mnemonic vector; then it checks the
Deriver's startup vectors. No v3R2 address of a known key is published: its data layout (seqno,
subwallet id, public key) is ton-org/ton's src/wallets/v3/r2.ts, and its addresses are this oracle's
computation. Run from this folder."""
import base64
import hashlib
import hmac
import sys

from ed25519_oracle import bip39_seed, check, ed25519_public, slip10


def parse_boc(data):
    assert data[:4] == bytes.fromhex("b5ee9c72"), "not a BOC"
    flags = data[4]
    has_idx, has_crc, size = flags & 0x80, flags & 0x40, flags & 0x07
    off = data[5]
    pos = 6
    read = lambda n: (int.from_bytes(data[pos:pos + n], "big"), pos + n)
    cells, pos = read(size)
    roots, pos = read(size)
    _absent, pos = read(size)
    _total, pos = read(off)
    root_list = []
    for _ in range(roots):
        r, pos = read(size)
        root_list.append(r)
    if has_idx:
        pos += cells * off
    raw = []
    for _ in range(cells):
        d1, d2 = data[pos], data[pos + 1]
        pos += 2
        length = (d2 + 1) // 2
        body = data[pos:pos + length]
        pos += length
        refs = []
        for _ in range(d1 & 7):
            r, pos = read(size)
            refs.append(r)
        raw.append((d1, d2, body, refs))
    hashes, depths = [None] * cells, [0] * cells
    for i in range(cells - 1, -1, -1):
        d1, d2, body, refs = raw[i]
        assert d1 & 0x08 == 0, "exotic cell"
        depth = 0 if not refs else 1 + max(depths[r] for r in refs)
        repr_ = bytes([d1, d2]) + body
        repr_ += b"".join(depths[r].to_bytes(2, "big") for r in refs)
        repr_ += b"".join(hashes[r] for r in refs)
        hashes[i], depths[i] = hashlib.sha256(repr_).digest(), depth
    return raw, hashes, depths, root_list


def cell_hash(bits, refs):
    """bits: a string of 0/1; refs: list of (hash, depth)."""
    d1 = len(refs)
    d2 = (len(bits) + 7) // 8 + len(bits) // 8
    padded = bits
    if len(bits) % 8:
        padded += "1" + "0" * (7 - len(bits) % 8)
    body = int(padded, 2).to_bytes(len(padded) // 8, "big") if padded else b""
    repr_ = bytes([d1, d2]) + body + b"".join(d.to_bytes(2, "big") for _, d in refs) + b"".join(h for h, _ in refs)
    depth = 0 if not refs else 1 + max(d for _, d in refs)
    return hashlib.sha256(repr_).digest(), depth


def bits_of(value, width):
    return format(value % (1 << width), f"0{width}b")


def data_cell(version, public_key):
    pk = "".join(format(b, "08b") for b in public_key)
    if version == "v3r2":
        return cell_hash(bits_of(0, 32) + bits_of(698983191, 32) + pk, [])
    if version == "v4r2":
        return cell_hash(bits_of(0, 32) + bits_of(698983191, 32) + pk + "0", [])
    return cell_hash("1" + bits_of(0, 32) + bits_of(2147483409, 32) + pk + "0", [])


CODE = {
    "v3r2": (bytes.fromhex("84dafa449f98a6987789ba232358072bc0f76dc4524002a5d0918b9a75d2d599"), 0),
    "v4r2": (bytes.fromhex("feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0"), 7),
}


def address(version, public_key, bounceable=False):
    code = CODE[version]
    state_hash, _ = cell_hash("00110", [code, data_cell(version, public_key)])
    body = bytes([0x11 if bounceable else 0x51, 0]) + state_hash
    crc = 0
    for byte in body:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return base64.urlsafe_b64encode(body + crc.to_bytes(2, "big")).decode()


def ton_entropy(words, password=""):
    return hmac.new(" ".join(words).encode(), password.encode(), hashlib.sha512).digest()


def ton_is_basic(entropy):
    return hashlib.pbkdf2_hmac("sha512", entropy, b"TON seed version", 390)[0] == 0


def ton_private(words):
    return hashlib.pbkdf2_hmac("sha512", ton_entropy(words), b"TON default seed", 100000)[:32]


# Trust Wallet wallet-core's state inits (rust/tw_tests/tests/chains/ton/ton_wallet.rs) for the
# public key below: W5 with its mainnet wallet id, v4R2 with 698983191.
V5_STATE_INIT = (
    "te6cckECFgEAArEAAgE0AQIBFP8A9KQT9LzyyAsDAFGAAAAAP///iPkU1JuP0+EIRZ7IdRFk3zgv+uhn9XdOXcmzf4C4q8mroAIBIAQFAgFIBgcBAvIIAtzQINdJwSCRW49jINcLHyCCEGV4dG69IYIQc2ludL2wkl8D4IIQZXh0brqOtIAg1yEB0HTXIfpAMPpE+Cj6RDBYvZFb4O1E0IEBQdch9AWDB/QOb6ExkTDhgEDXIXB/2zzgMSDXSYECgLmRMOBw4hIJAgEgCgsBHiDXCx+CEHNpZ2668uCKfwkB5o7w7aLt+yGDCNciAoMI1yMggCDXIdMf0x/TH+1E0NIA0x8g0x/T/9cKAAr5AUDM+RCaKJRfCtsx4fLAh98Cs1AHsPLQhFEluvLghVA2uvLghvgju/LQiCKS+ADeAaR/yMoAyx8BzxbJ7VQgkvgP3nDbPNgSAgEgDA0AGb5fD2omhAgKDrkPoCwCAW4ODwIBSBARABmtznaiaEAg65Drhf/AABmvHfaiaEAQ65DrhY/AABezJftRNBx1yHXCx+AAEbJi+1E0NcKAIAP27aLt+wL0BCFukmwhjkwCIdc5MHCUIccAs44tAdcoIHYeQ2wg10nACPLgkyDXSsAC8uCTINcdBscSwgBSMLDy0InXTNc5MAGk6GwShAe78uCT10rAAPLgk+1V4tIAAcAAkVvg69csCBQgkXCWAdcsCBwS4lIQseMPINdKExQVAJYB+kAB+kT4KPpEMFi68uCR7UTQgQFB1xj0BQSdf8jKAEAEgwf0U/Lgi44UA4MH9Fvy4Iwi1woAIW4Bs7Dy0JDiyFADzxYS9ADJ7VQAcjDXLAgkji0h8uCS0gDtRNDSAFETuvLQj1RQMJExnAGBAUDXIdcKAPLgjuLIygBYzxbJ7VST8sCN4gAQk1vbMeHXTNBAlw92"
)
V4_STATE_INIT = (
    "te6cckECFgEAAwQAAgE0AQIBFP8A9KQT9LzyyAsDAFEAAAAAKamjF/IpqTcfp8IQiz2Q6iLJvnBf9dDP6u6cu5Nm/wFxV5NXQAIBIAQFAgFIBgcE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8ICQoLAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNDA0CASAODwBu0gf6ANTUIvkABcjKBxXL/8nQd3SAGMjLBcsCIs8WUAX6AhTLaxLMzMlz+wDIQBSBAQj0UfKnAgBwgQEI1xj6ANM/yFQgR4EBCPRR8qeCEG5vdGVwdIAYyMsFywJQBs8WUAT6AhTLahLLH8s/yXP7AAIAbIEBCNcY+gDTPzBSJIEBCPRZ8qeCEGRzdHJwdIAYyMsFywJQBc8WUAP6AhPLassfEss/yXP7AAAK9ADJ7VQAeAH6APQEMPgnbyIwUAqhIb7y4FCCEHBsdWeDHrFwgBhQBMsFJs8WWPoCGfQAy2kXyx9SYMs/IMmAQPsABgCKUASBAQj0WTDtRNCBAUDXIMgBzxb0AMntVAFysI4jghBkc3Rygx6xcIAYUAXLBVADzxYj+gITy2rLH8s/yYBA+wCSXwPiAgEgEBEAWb0kK29qJoQICga5D6AhhHDUCAhHpJN9KZEM5pA+n/mDeBKAG3gQFImHFZ8xhAIBWBITABG4yX7UTQ1wsfgAPbKd+1E0IEBQNch9AQwAsjKB8v/ydABgQEI9ApvoTGACASAUFQAZrc52omhAIGuQ64X/wAAZrx32omhAEGuQ64WPwEXtMkg="
)

# ton-org/ton src/wallets/v3/r2.ts (read 2026-11-10): the code of WalletContractV3R2.
V3R2_CODE = (
    "te6cckEBAQEAcQAA3v8AIN0gggFMl7ohggEznLqxn3Gw7UTQ0x/THzHXC//jBOCk8mCDCNcYINMf0x/TH/gjE7vyY+1E0NMf0x/T/9FRMrryoVFEuvKiBPkBVBBV+RDyo/gAkyDXSpbTB9QC+wDo0QGkyMsfyx/L/8ntVBC9ba0="
)


def main():
    _raw, v3_hashes, v3_depths, v3_roots = parse_boc(base64.b64decode(V3R2_CODE))
    check("v3R2 code hash and depth (ton-org/ton)", (v3_hashes[v3_roots[0]], v3_depths[v3_roots[0]]), CODE["v3r2"])
    v5_boc = base64.b64decode(V5_STATE_INIT)
    v4_boc = base64.b64decode(V4_STATE_INIT)
    PK = bytes.fromhex("f229a9371fa7c2108b3d90ea22c9be705ff5d0cfeaee9cbb9366ff0171579357")
    for name, boc, version in [("W5", v5_boc, "v5r1"), ("v4R2", v4_boc, "v4r2")]:
        raw, hashes, depths, roots = parse_boc(boc)
        root = roots[0]
        code_ref, data_ref = raw[root][3]
        print(f"{name} code hash {hashes[code_ref].hex()} depth {depths[code_ref]}")
        if version == "v5r1":
            check("W5 code hash (wallet_v5.compiled.json)", hashes[code_ref].hex(), "20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f")
            CODE["v5r1"] = (hashes[code_ref], depths[code_ref])
        else:
            check("v4R2 code hash and depth (Ledger address.c)", (hashes[code_ref], depths[code_ref]), CODE["v4r2"])
        check(f"{name} data cell (wallet-core state init)", hashes[data_ref], data_cell(version, PK)[0])
        check(f"{name} state init hash", hashes[root], cell_hash("00110", [CODE[version], data_cell(version, PK)])[0])
    check("wallet-core V4R2 (key 0x46)", address("v4r2", ed25519_public(bytes([0x46] * 32))), "UQAoYT8nMLfeNh6h0uIoK_wLm9JkvxiGxJDr6GRXJGu2Zked")
    check("wallet-core V4R2 (key 5849…)", address("v4r2", ed25519_public(bytes.fromhex("5849481021e305dfdf9f0eaf87e07f15efec3fde8d8ed639c9fcf0bc351d998b"))), "UQAACKJfEIfI5vkht_w3NYk8k-OU5Xl_jq9XNmmkcPaUO-tB")
    check("wallet-core W5 (key 502d…)", address("v5r1", ed25519_public(bytes.fromhex("502d60b0f3327382e7d0585b789f1db9aa04907fe5cddc5c28818ec163ebf4ba"))), "UQCh41gQP1A4I0lnAn6yAfitDAIYpXG6UFIXqeSz1TVxNOJ_")
    words = "hospital stove relief fringe tongue always charge angry urge sentence again match nerve inquiry senior coconut label tumble carry category beauty bean road solution".split()
    check("ton-crypto mnemonic vector #0 is a TON phrase", ton_is_basic(ton_entropy(words)), True)
    seed = ton_private(words)
    check("ton-crypto mnemonic vector #0 secret key", (seed + ed25519_public(seed)).hex(), "9d659a6c2234db7f6e4f977e6e8653b9f5946d557163f31034011375d8f3f97df6c450a16bb1c514e22f1977e390a3025599aa1e7b00068a6aacf2119484c1bd")
    # The Deriver's startup vectors (packages/verification/src/derivation-self-test-ton.ts).
    pub = ed25519_public(seed)
    for version, expected in [
        ("v5r1", "UQDSLOFVamNZzdy4LulclcCBEFkRReZ7WscBCLAw3Pg53h3h"),
        ("v4r2", "UQAYZ-rchbaHK4IUkCvcyl3V8spcAnO8IBRCNvS3are-CbyQ"),
        ("v3r2", "UQDbuMbjSKj1IkoMU-whUDd5v2Om4G6tVwrwBxlrBmBtq12L"),
    ]:
        check(f"TON phrase {version}", address(version, pub), expected)
    about = bip39_seed("abandon " * 11 + "about")
    trust = ed25519_public(slip10(about, [44, 607, 0]))
    ledger = ed25519_public(slip10(about, [44, 607, 0, 0, 0, 0]))
    check("Trust Wallet m/44'/607'/0' v4R2", address("v4r2", trust), "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY")
    check("Ledger m/44'/607'/0'/0'/0'/0' v4R2", address("v4r2", ledger), "UQAhEnZmOZ4XCJ1BKsvvt4D1DobiFgIf8nbZdTiT0l-8mOpj")
    check("Ledger m/44'/607'/0'/0'/0'/0' v3R2", address("v3r2", ledger), "UQBVq4M3qemaHSby_YVxqy9rd9LJeJ0WFGV-ikA4NnZNnhyN")
    check("abandon x23 art is not a TON phrase", ton_is_basic(ton_entropy(("abandon " * 23 + "art").split())), False)


if __name__ == "__main__":
    main()
