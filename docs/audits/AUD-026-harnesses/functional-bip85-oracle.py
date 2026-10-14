"""AUD-026 functional: recompute the production BIP85 dump with functional_ref.

BIP85: k = private key at m/83696968'/app'/..., entropy = HMAC-SHA512(key="bip-entropy-from-k",
msg=k). BIP39 takes the first 16..32 bytes and the English list; WIF the first 32 bytes, compressed;
XPRV chain code = bytes 0..31 and key = bytes 32..63 at depth 0; HEX the first `bytes` bytes. Also
compares the BIP's published literals for the master key (test cases 1, BIP39 12/18/24 words, WIF,
XPRV, HEX). Exits non-zero on any mismatch.
"""
import hashlib
import hmac
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import functional_ref as ref  # noqa: E402

data = json.load(open(os.path.join(HERE, "../AUD-026-evidence/functional/bip85.json")))
failures = []
checks = 0


def eq(where, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{where}: got {got!r} want {want!r}")


def from_xprv(text):
    raw = ref.b58decode_check(text)
    return ref.Node(int.from_bytes(raw[46:78], "big"), raw[13:45], raw[4], raw[5:9], int.from_bytes(raw[9:13], "big"))


def entropy(root, path):
    k = root.derive(path).key.to_bytes(32, "big")
    return hmac.new(b"bip-entropy-from-k", k, hashlib.sha512).digest()


MASTER = "xprv9s21ZrQH143K2LBWUUQRFXhucrQqBpKdRRxNVq2zBqsx8HVqFk2uYo8kmbaLLHRdqtQpUm98uKfu3vca1LqdGhUtyoFnCNkfmXRyPXLjbKb"
roots = {"master": from_xprv(MASTER), "abandonSeed": ref.Node.from_seed(bytes.fromhex(data["seedHex"]))}
# BIP85 published values for MASTER.
eq("bip85.case1", entropy(roots["master"], "m/83696968'/0'/0'").hex(),
   "efecfbccffea313214232d29e71563d941229afb4338c21f9517c41aaa0d16f00b83d2a09ef747e7a64e8e2bd5a14869e693da66ce94ac2da570ab7ee48618f7")
published = {
    (12, 0): "girl mad pet galaxy egg matter matrix prison refuse sense ordinary nose",
    (18, 0): "near account window bike charge season chef number sketch tomorrow excuse sniff circle vital hockey outdoor supply token",
    (24, 0): "puppy ocean match cereal symbol another shed magic wrap hammer bulb intact gadget divorce twin tonight reason outdoor destroy simple truth cigar social volcano",
}
for (words, index), phrase in published.items():
    e = entropy(roots["master"], f"m/83696968'/39'/0'/{words}'/{index}'")[: words * 4 // 3]
    eq(f"bip85.published.{words}", ref.entropy_to_mnemonic(e), phrase)

for name, root in roots.items():
    got = data[name]
    for item in got["bip39"]:
        parts = item["path"].split("/")
        words, index = int(parts[4][:-1]), int(parts[5][:-1])
        e = entropy(root, item["path"])[: words * 4 // 3]
        eq(f"{name}.bip39.{words}.{index}", item["entropyHex"], e.hex())
        eq(f"{name}.bip39.path.{words}.{index}", item["path"], f"m/83696968'/39'/0'/{words}'/{index}'")
    for item, index in zip(got["wif"], [0, 2147483647]):
        e = entropy(root, f"m/83696968'/2'/{index}'")
        eq(f"{name}.wif.{index}", item["wif"], ref.wif(int.from_bytes(e[:32], "big"), 0x80))
    e = entropy(root, "m/83696968'/2'/0'")
    eq(f"{name}.wifTestnet", got["wifTestnet"]["wif"], ref.wif(int.from_bytes(e[:32], "big"), 0xEF))
    for item, index in zip(got["xprv"], [0, 1]):
        e = entropy(root, f"m/83696968'/32'/{index}'")
        node = ref.Node(int.from_bytes(e[32:], "big"), e[:32])
        eq(f"{name}.xprv.{index}", item["xprv"], node.serialize(ref.XPRV, ref.XPUB, private=True))
    for item, size in zip(got["hex"], [16, 32, 64]):
        eq(f"{name}.hex.{size}", item["entropyHex"], entropy(root, f"m/83696968'/128169'/{size}'/0'")[:size].hex())
    for case, value in got["refusals"].items():
        eq(f"{name}.refusal.{case}", isinstance(value, dict) and "refused" in value, True)
    eq(f"{name}.unchanged", got["unchanged"], True)

eq("published.wif", data["master"]["wif"][0]["wif"], "Kzyv4uF39d4Jrw2W7UryTHwZr1zQVNk4dAFyqE6BuMrMh1Za7uhp")
eq("published.xprv", data["master"]["xprv"][0]["xprv"],
   "xprv9s21ZrQH143K2srSbCSg4m4kLvPMzcWydgmKEnMmoZUurYuBuYG46c6P71UGXMzmriLzCCBvKQWBUv3vPB3m1SATMhp3uEjXHJ42jFg7myX")
eq("published.hex64", data["master"]["hex"][2]["entropyHex"],
   "492db4698cf3b73a5a24998aa3e9d7fa96275d85724a91e71aa2d645442f878555d078fd1f1f67e368976f04137b1f7a0d19232136ca50c44614af72b5582a5c")

print(f"comparisons={checks} failures={len(failures)}")
for f in failures:
    print("FAIL", f)
sys.exit(1 if failures else 0)
