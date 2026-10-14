"""AUD-026 functional: properties of phrases from the production chosen-word generator.

For every dumped phrase: a valid BIP39 checksum (functional_ref, not @scure), the chosen word at its
position (or present for "anywhere"), no never-use word. For the "anywhere" requests, the first
position of the word must spread over all positions (chi-square, df = words - 1, at p = 0.001; the
last word is slightly less likely, 2047/2048 of the others at most, which this test cannot see).
For a fixed first word, the second word must also spread (no bias leaking into its neighbour).
The remaining-bits estimate must equal the formula of entropy - 11 + log2(odds). Exits non-zero on
any failure.
"""
import json
import math
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import functional_ref as ref  # noqa: E402

# chi-square critical values at p = 0.001 for df = 11, 14, 17, 20, 23 (standard tables).
CHI_CRIT = {11: 31.26, 14: 36.12, 17: 40.79, 20: 45.31, 23: 49.73}
cases = json.load(open(os.path.join(HERE, "../AUD-026-evidence/functional/chosen-words.json")))
failures = []
phrases_checked = 0


def chi_square(counts, expected):
    return sum((c - expected) ** 2 / expected for c in counts)


for case in cases:
    req = case["request"]
    n = req["wordCount"]
    label = json.dumps(req)
    first_positions = [0] * n
    for phrase in case["phrases"]:
        phrases_checked += 1
        words = phrase.split(" ")
        try:
            ref.mnemonic_to_entropy(phrase)
        except Exception as cause:  # noqa: BLE001
            failures.append(f"{label}: invalid phrase ({cause})")
            continue
        if len(words) != n:
            failures.append(f"{label}: {len(words)} words")
        for never in req["neverUse"]:
            if never in words:
                failures.append(f"{label}: never-use word present")
        for chosen in req["chosen"]:
            if chosen["position"] == "anywhere":
                if chosen["word"] not in words:
                    failures.append(f"{label}: anywhere word missing")
                else:
                    first_positions[words.index(chosen["word"])] += 1
            elif words[chosen["position"] - 1] != chosen["word"]:
                failures.append(f"{label}: chosen word not at position {chosen['position']}")
    if any(c["position"] == "anywhere" for c in req["chosen"]):
        stat = chi_square(first_positions, len(case["phrases"]) / n)
        print(f"{n} words anywhere: chi2={stat:.1f} (crit {CHI_CRIT[n - 1]}) counts={first_positions}")
        if stat > CHI_CRIT[n - 1]:
            failures.append(f"{label}: anywhere position not uniform, chi2={stat:.1f}")
    # Remaining bits: entropy - 11 * fixed + log2(P(no never-use in free words, anywhere present)).
    ent = n * 11 * 32 // 33
    fixed = sum(1 for c in req["chosen"] if c["position"] != "anywhere")
    free = n - fixed
    allowed = 2048 - len(req["neverUse"])
    avoid = lambda missing: ((allowed - missing) / 2048) ** free  # noqa: E731
    odds = avoid(0) - avoid(1) if any(c["position"] == "anywhere" for c in req["chosen"]) else avoid(0)
    want = ent - 11 * fixed + math.log2(odds)
    if abs(case["bits"] - want) > 1e-9:
        failures.append(f"{label}: remaining bits {case['bits']} want {want}")

print(f"cases={len(cases)} phrases={phrases_checked} failures={len(failures)}")
for f in failures[:20]:
    print("FAIL", f)
sys.exit(1 if failures else 0)
