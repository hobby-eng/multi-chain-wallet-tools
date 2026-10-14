"""AUD-026 functional: the addresses each Discovery seed scan must ask about, derived independently.

Reads docs/audits/AUD-026-evidence/functional/discovery-addresses.json. With every provider answer
"unused", each branch is scanned exactly to its configured minimum, so the expected list is, in
order: Bitcoin BIP44/49/84/86 receive (2) and change (1); Ethereum standard m/44'/60'/a'/0/i,
Ledger Live m/44'/60'/(a+i)'/0/0 and legacy m/44'/60'/0'/i (2 each, each account asked once,
so Ledger Live's first, equal to the standard first, is not asked again); Dash BIP44 receive/change,
DIP9 CoinJoin m/9'/c'/4'/a'/{0,1}/i, legacy mobile m/a'/{0,1}/i and provider holdings
m/9'/c'/3'/0'/i. Exits non-zero on any difference.
"""
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import functional_ref as ref  # noqa: E402

root = ref.Node.from_seed(ref.mnemonic_to_seed("abandon " * 11 + "about"))
cache = {}


def node(path):
    if path not in cache:
        parent, _, last = path.rpartition("/")
        cache[path] = root if path == "m" else node(parent).child(int(last.rstrip("'")) + (ref.HARDENED if last.endswith("'") else 0))
    return cache[path]


def expected(scan, net, a):
    btc = {"mainnet": (0, 0x00, 0x05, "bc"), "testnet": (1, 0x6F, 0xC4, "tb")}[net]
    dash = {"mainnet": (5, 76), "testnet": (1, 140)}[net]
    out = []
    if scan == "bitcoin":
        coin, p2pkh, p2sh, hrp = btc
        for purpose in (44, 49, 84, 86):
            for branch, count in ((0, 2), (1, 1)):
                for i in range(count):
                    n = node(f"m/{purpose}'/{coin}'/{a}'/{branch}/{i}")
                    out.append({44: lambda: ref.p2pkh(n.pub(), p2pkh), 49: lambda: ref.p2sh_p2wpkh(n.pub(), p2sh),
                                84: lambda: ref.p2wpkh(n.pub(), hrp), 86: lambda: ref.p2tr(n.point(), hrp)}[purpose]())
    elif scan == "ethereum":
        paths = [f"m/44'/60'/{a}'/0/{i}" for i in range(2)] + [f"m/44'/60'/{a + i}'/0/0" for i in range(2)] + [f"m/44'/60'/0'/{i}" for i in range(2)]
        # Ledger Live's first account is the standard first address: the address book asks each
        # account once (dedup by lower-case key), so it appears once, at its first place.
        out = []
        for p in paths:
            address = ref.eth_address(node(p).point())
            if address.lower() not in (x.lower() for x in out):
                out.append(address)
    else:
        coin, version = dash
        prefixes = {
            "dash-core": [(f"m/44'/{coin}'/{a}'/0", 2), (f"m/44'/{coin}'/{a}'/1", 1)],
            "dash-coinjoin": [(f"m/9'/{coin}'/4'/{a}'/0", 2), (f"m/9'/{coin}'/4'/{a}'/1", 1)],
            "dash-legacy": [(f"m/{a}'/0", 2), (f"m/{a}'/1", 2)],
            "dash-provider": [(f"m/9'/{coin}'/3'/0'", 2)],
        }[scan]
        out = [ref.p2pkh(node(f"{p}/{i}").pub(), version) for p, count in prefixes for i in range(count)]
    return out


failures = []
cases = json.load(open(os.path.join(HERE, "../AUD-026-evidence/functional/discovery-addresses.json")))
for case in cases:
    want = expected(case["scan"], case["network"], case["account"])
    if case["scan"] == "ethereum" and case["account"] == 0:
        # Published first Ethereum address of the abandon/about phrase (MetaMask/Trezor m/44'/60'/0'/0/0).
        if case["asked"][0] != "0x9858EfFD232B4033E47d90003D41EC34EcaEda94":
            failures.append("ethereum: first address is not the published one")
    if case["asked"] != want:
        failures.append(f"{case['scan']}/{case['network']}/a{case['account']}: asked {case['asked']} want {want}")
print(f"scans={len(cases)} addresses={sum(len(c['asked']) for c in cases)} failures={len(failures)}")
for f in failures:
    print("FAIL", f)
sys.exit(1 if failures else 0)
