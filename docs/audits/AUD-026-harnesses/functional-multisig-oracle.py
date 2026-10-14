"""AUD-026 functional: recompute the Inspector's ranged multisig wallet independently.

Reads docs/audits/AUD-026-evidence/functional/multisig.json and, with functional_ref's pure-Python
BIP32/Base58/Bech32/BIP380 code, rebuilds each branch descriptor and checksum, each row's child
keys, multi/sortedmulti redeem script (BIP67 byte order), scriptPubKey and P2SH/P2WSH address, and
the importdescriptors entries. Exits non-zero on any mismatch.
"""
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import functional_ref as ref  # noqa: E402

DUMP = os.path.join(HERE, "../AUD-026-evidence/functional/multisig.json")
P2SH = {("bitcoin", "mainnet"): 0x05, ("bitcoin", "testnet"): 0xC4, ("dash", "mainnet"): 16, ("dash", "testnet"): 19}
HRP = {"mainnet": "bc", "testnet": "tb"}
failures = []
checks = 0


def eq(where, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{where}: got {got!r} want {want!r}")


def parse_xpub(text):
    raw = ref.b58decode_check(text)
    depth, parent, index, chain, key = raw[4], raw[5:9], int.from_bytes(raw[9:13], "big"), raw[13:45], raw[45:78]
    return ref.Node(ref.parse_compressed(key), chain, depth, parent, index, private=False)


def account_key(line):
    if line.startswith("pkh("):
        body = line.split("#")[0]
        assert ref.descriptor_checksum(body) == line
        line = body[4:].rsplit("/", 2)[0]
    origin, xpub = (line[: line.index("]") + 1], line[line.index("]") + 1 :]) if line.startswith("[") else ("", line)
    return origin, xpub


def push(data):
    return bytes([len(data)]) + data


def small(n):
    return bytes([0x50 + n]) if n else b"\x00"


NEGATIVE = "--negative" in sys.argv
CASES = json.load(open(DUMP))
if NEGATIVE:  # negative control: one changed character in every row address must be caught
    for case in CASES:
        for row in case["rows"]:
            row["address"] = row["address"][:-1] + ("q" if row["address"][-1] != "q" else "p")

for case in CASES:
    req = case["request"]
    chain, net = req["chain"], req["network"]
    wrapper = "p2sh" if chain == "dash" else req["wrapper"]
    fn = "sortedmulti" if req["keyOrder"] == "bip67" else "multi"
    keys = [account_key(line) for line in req["accountXpubs"]]
    nodes = [parse_xpub(x) for _, x in keys]
    for d in case["descriptors"]:
        b = d["branch"]
        inner = ",".join(f"{o}{x}/{b}/*" for o, x in keys)
        body = f"{'wsh' if wrapper == 'p2wsh' else 'sh'}({fn}({req['required']},{inner}))"
        eq(f"{chain}/{net}/descriptor{b}", d["descriptor"], ref.descriptor_checksum(body))
    for row in case["rows"]:
        b, i = row["branch"], row["index"]
        pubs = [n.child(b).child(i).pub() for n in nodes]
        ordered = sorted(pubs) if fn == "sortedmulti" else pubs
        script = small(req["required"]) + b"".join(push(p) for p in ordered) + small(len(pubs)) + b"\xae"
        where = f"{chain}/{net}/{b}/{i}"
        eq(where + ".redeemScript", row["redeemScript"], script.hex())
        if wrapper == "p2wsh":
            prog = ref.sha256(script)
            eq(where + ".scriptPubKey", row["scriptPubKey"], "0020" + prog.hex())
            eq(where + ".address", row["address"], ref.segwit_address(HRP[net], 0, prog))
        else:
            h = ref.hash160(script)
            eq(where + ".scriptPubKey", row["scriptPubKey"], "a914" + h.hex() + "87")
            eq(where + ".address", row["address"], ref.b58check(bytes([P2SH[(chain, net)]]) + h))
        eq(where + ".publicKeys", row["publicKeys"], [p.hex() for p in ordered])
    payload = json.loads(case["importJson"])
    entries = payload if chain == "bitcoin" else payload["params"][0]
    for entry, d in zip(entries, case["descriptors"]):
        eq(f"{chain}/{net}/import{d['branch']}", (entry["desc"], entry["internal"], entry["range"], entry["active"]),
           (d["descriptor"], d["branch"] == 1, [req["startIndex"], req["endIndex"]], True))

rows = sum(len(case["rows"]) for case in CASES)
print(f"cases={len(CASES)} rows={rows} comparisons={checks} failures={len(failures)}")
for f in failures:
    print("FAIL", f)
if NEGATIVE:
    sys.exit(0 if len(failures) == rows else 1)
sys.exit(1 if failures else 0)
