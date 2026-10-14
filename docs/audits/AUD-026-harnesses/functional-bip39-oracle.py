"""AUD-026 functional: check the production BIP39/SeedQR dump against functional_ref.

Recomputes mnemonic, entropy round trip, PBKDF2 seed with "TREZOR", master fingerprint, Standard
SeedQR (four decimal digits per word index, SeedSigner) and CompactSeedQR (raw entropy bytes) for
every dumped entropy, and checks the expected accept/refuse outcome of each malformed input.
Exits non-zero on any mismatch.
"""
import json
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import functional_ref as ref  # noqa: E402

data = json.load(open(os.path.join(HERE, "../AUD-026-evidence/functional/bip39.json")))
failures = []
checks = 0


def eq(where, got, want):
    global checks
    checks += 1
    if got != want:
        failures.append(f"{where}: got {got!r} want {want!r}")


for case in data["valid"]:
    entropy = bytes.fromhex(case["entropyHex"])
    mnemonic = ref.entropy_to_mnemonic(entropy)
    seed = ref.mnemonic_to_seed(mnemonic, "TREZOR")
    eq(case["name"] + ".mnemonic", case["mnemonic"], mnemonic)
    eq(case["name"] + ".roundTrip", case["roundTrip"], entropy.hex())
    eq(case["name"] + ".seed", case["seedTrezor"], seed.hex())
    eq(case["name"] + ".fingerprint", case["fingerprintTrezor"], ref.Node.from_seed(seed).fingerprint().hex())
    eq(case["name"] + ".standard", case["standardSeedQr"], "".join(f"{ref.WORD_INDEX[w]:04d}" for w in mnemonic.split()))
    eq(case["name"] + ".compact", case["compactSeedQr"], entropy.hex())
    eq(case["name"] + ".standardDecoded", case["standardDecoded"], mnemonic)
    eq(case["name"] + ".compactDecoded", case["compactDecoded"], mnemonic)

# Trezor vector 0 and the all-ones 24-word vector (python-mnemonic vectors.json).
names = {c["name"]: c for c in data["valid"]}
eq("trezor.zero-16", names["zero-16"]["seedTrezor"][:16], "c55257c360c07c72")
eq("trezor.ones-32", names["ones-32"]["mnemonic"], "zoo " * 23 + "vote")

expected_refusals = {
    "upperAndSpaces": "accepted",
    "wrongChecksum": "refused",
    "unknownWord": "refused",
    "elevenWords": "refused",
    "thirteenWords": "refused",
    "empty": "refused",
    "fullwidth": "accepted",
}
for name, outcome in expected_refusals.items():
    eq("mnemonic." + name, data["refusals"][name].split(":")[0], outcome)
eq("mnemonic.normalized", data["refusals"]["upperAndSpaces"], "accepted: " + "abandon " * 11 + "about")
eq("mnemonic.fullwidth", data["refusals"]["fullwidth"], "accepted: " + "abandon " * 11 + "about")

expected_seedqr = {
    "standard47": "refused",
    "standardIndex2048": "refused",
    "standardBadChecksum": "refused",
    "standardNonDigit": "refused",
    "compact15": "refused",
    "compact33": "refused",
    "standardLeadingZeros": "accepted",
}
for name, outcome in expected_seedqr.items():
    eq("seedqr." + name, data["seedQrRefusals"][name].split(":")[0], outcome)
eq("seedqr.leadingZeros", data["seedQrRefusals"]["standardLeadingZeros"], "accepted: " + "abandon " * 11 + "about")

print(f"entropies={len(data['valid'])} comparisons={checks} failures={len(failures)}")
for f in failures:
    print("FAIL", f)
sys.exit(1 if failures else 0)
