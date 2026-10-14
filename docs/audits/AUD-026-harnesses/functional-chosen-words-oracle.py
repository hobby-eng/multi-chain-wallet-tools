"""AUD-026 functional: independent oracle for the chosen-word generator's known answers.

Re-implements the documented search (draws from the self-test's xorshift32 stream, a fixed word's
bits set as entropy integers, rejection for checksum, never-use and anywhere wishes) on Python
integers with functional_ref's BIP39, and checks the six CHOSEN_WORDS_KNOWN_ANSWERS. Then checks
uniformity claims statistically on a toy-sized model is out of scope; the vitest harness does that.
Exits non-zero on any mismatch.
"""
import json
import re
import sys
import os

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from functional_ref import WORD_INDEX, entropy_to_mnemonic  # noqa: E402

SEED = 0x2545F491
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../..")


def stream():
    state = SEED
    while True:
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        state &= 0xFFFFFFFF
        yield state & 255


def search(word_count, chosen, never):
    ent_bits = word_count * 11 * 32 // 33
    cs = word_count * 11 - ent_bits
    nbytes = ent_bits // 8
    src = stream()
    for draw in range(1_000_000):
        e = int.from_bytes(bytes(next(src) for _ in range(nbytes)), "big")
        for word, position in chosen:
            if position == "anywhere":
                continue
            p = position - 1
            if p < word_count - 1:
                shift = ent_bits - 11 * (p + 1)
                e = (e & ~(2047 << shift)) | (WORD_INDEX[word] << shift)
            else:
                width = 11 - cs
                e = (e & ~((1 << width) - 1)) | (WORD_INDEX[word] >> cs)
        words = entropy_to_mnemonic(e.to_bytes(nbytes, "big")).split(" ")
        if any(w in never for w in words):
            continue
        ok = True
        for word, position in chosen:
            if position == "anywhere":
                ok &= word in words
            else:
                ok &= words[position - 1] == word
        if ok:
            return " ".join(words), draw + 1
    raise RuntimeError("no draw")


def known_answers():
    src = open(os.path.join(ROOT, "packages/crypto-core/src/bip39-chosen-words.ts"), encoding="utf-8").read()
    block = src[src.index("CHOSEN_WORDS_KNOWN_ANSWERS") :]
    block = block[: block.index("];")]
    cases = []
    for m in re.finditer(r"wordCount: (\d+), chosen: \[\{ word: \"(\w+)\", position: (\d+|\"anywhere\") \}\], neverUse: \[([^\]]*)\] \},\s*phrase:\s*((?:\"[^\"]*\"\s*\+?\s*)+)", block):
        count = int(m.group(1))
        pos = m.group(3).strip('"')
        pos = pos if pos == "anywhere" else int(pos)
        never = re.findall(r"\"(\w+)\"", m.group(4))
        phrase = "".join(re.findall(r"\"([^\"]*)\"", m.group(5)))
        cases.append((count, [(m.group(2), pos)], never, phrase))
    return cases


def main():
    cases = known_answers()
    assert len(cases) == 6, f"expected six known answers, parsed {len(cases)}"
    failures = 0
    results = []
    for count, chosen, never, expected in cases:
        got, draws = search(count, chosen, never)
        same = got == expected
        failures += not same
        results.append({"wordCount": count, "chosen": chosen, "neverUse": never, "draws": draws, "match": same})
        print(f"{count} words {chosen} never={never}: draws={draws} {'MATCH' if same else 'MISMATCH'}")
        if not same:
            print("  expected", expected)
            print("  oracle  ", got)
    print(json.dumps(results))
    sys.exit(1 if failures else 0)


main()
