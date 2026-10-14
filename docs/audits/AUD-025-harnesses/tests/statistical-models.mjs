import assert from "node:assert/strict";

// Retained baseline mathematics, not a replay against a mutated production implementation.
const reviewedHead = "01e7913939574ccc94823e969e698e23cdb5fb0f";
const baselineFingerprint = "2efd4d18da3b9cd3c21e2a9ed6d582f53e9dc22050fb187b2a81534dc18c768d";
const baselineTestHash = "c312d49416a1abc404734145497aaf107a56fc6ba640f4493b01b605d94400e3";
const wordBits = 11;
const words = 2 ** wordBits;
const lengths = [12, 15, 18, 21, 24];
const samples = 20_000;
const baselineIsolationValues = [0, 1, 1024, 2046, 2047];

function indexBit(index, offset) {
  return (index >> (wordBits - 1 - offset)) & 1;
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);
}

function enumerateNull(forbidden) {
  const allowed = Array.from({ length: words }, (_, index) => index).filter(
    (index) => !forbidden.includes(index),
  );
  const bitProbabilities = [];
  for (let offset = 0; offset < wordBits; offset += 1) {
    const actual = allowed.filter((index) => indexBit(index, offset) === 1).length / allowed.length;
    const removed = forbidden.filter((index) => indexBit(index, offset) === 1).length;
    close(actual, (words / 2 - removed) / allowed.length);
    bitProbabilities.push(actual);
    if (offset === wordBits - 1) continue;
    for (let cell = 0; cell < 4; cell += 1) {
      const actualJoint =
        allowed.filter(
          (index) => 2 * indexBit(index, offset) + indexBit(index, offset + 1) === cell,
        ).length / allowed.length;
      const removedJoint = forbidden.filter(
        (index) => 2 * indexBit(index, offset) + indexBit(index, offset + 1) === cell,
      ).length;
      close(actualJoint, (words / 4 - removedJoint) / allowed.length);
    }
  }
  return { forbidden, allowed: allowed.length, bitProbabilities };
}

function parity(index) {
  let result = 0;
  for (let offset = 0; offset < wordBits; offset += 1) result ^= indexBit(index, offset);
  return result;
}

function swapMiddleBits(index) {
  return indexBit(index, 2) === indexBit(index, 3)
    ? index
    : index ^ (1 << (wordBits - 1 - 2)) ^ (1 << (wordBits - 1 - 3));
}

for (const index of baselineIsolationValues) assert.equal(swapMiddleBits(index), index);
const changedIndexes = Array.from({ length: words }, (_, index) => index).filter(
  (index) => swapMiddleBits(index) !== index,
).length;
assert.equal(changedIndexes, words / 2);

const positionCounts = [new Array(words).fill(0), new Array(words).fill(0)];
for (let index = 0; index < words; index += 1)
  for (const wantedParity of [0, 1])
    positionCounts[wantedParity][index ^ parity(index) ^ wantedParity] += 1;
for (let index = 0; index < words; index += 1) {
  assert.equal(positionCounts[0][index] + positionCounts[1][index], 2);
  assert.equal(positionCounts[parity(index)][index], 2);
  assert.equal(positionCounts[1 - parity(index)][index], 0);
}

const models = lengths.map((wordCount) => {
  const checksumBits = wordCount / 3;
  const entropyBits = wordCount * wordBits - checksumBits;
  assert.equal(entropyBits % 8, 0);
  // The ideal word model has A equally likely words, with a distinguished anywhere word.
  const allowed = words - (wordCount === 24 ? 0 : 1);
  const chance = 1 / allowed;
  const absent = (1 - chance) ** wordCount;
  const singleton = wordCount * chance * (1 - chance) ** (wordCount - 1);
  const conditionedMultiplicity = 1 - singleton / (1 - absent);
  const insertedMultiplicity = 1 - (1 - chance) ** (wordCount - 1);
  assert.ok(insertedMultiplicity > conditionedMultiplicity);
  const fullPositionExpected =
    (samples * chance * (1 - (1 - chance) ** (wordCount - 1))) / (1 - absent);
  assert.ok(fullPositionExpected > 8);
  return {
    wordCount,
    entropyBits,
    checksumBits,
    finalEntropyBits: wordBits - checksumBits,
    idealAllowedWords: allowed,
    conditionedMultiplicity,
    insertedMultiplicity,
    separationInNullStandardDeviations:
      (insertedMultiplicity - conditionedMultiplicity) /
      Math.sqrt((conditionedMultiplicity * (1 - conditionedMultiplicity)) / samples),
    fullPositionExpected,
  };
});

console.log(
  JSON.stringify(
    {
      reviewedHead,
      baselineFingerprint,
      baselineTestHash,
      scope: "retained analytic model; no mutated production suite executed",
      baselineIsolationValues,
      swapMiddleBitsChangedIndexes: changedIndexes,
      cancellingParityPool: "uniform while each position excludes half the indices",
      // zoo is the final English word; the second synthetic removal tests joint accounting.
      allowedWordNulls: [
        enumerateNull([]),
        enumerateNull([words - 1]),
        enumerateNull([0, words - 1]),
      ],
      models,
    },
    null,
    2,
  ),
);
