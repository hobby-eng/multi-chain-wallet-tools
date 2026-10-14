import { expect, it } from "vitest";
import { validatePlatformAddressBatch } from "../src/coins/dash/platform-scanner.js";
const FIRST = `00${"11".repeat(20)}`;
const SECOND = `00${"22".repeat(20)}`;
const response = (entries: unknown[]) =>
  ({ entries, metadata: { height: "1", protocolVersion: 1 } }) as never;
it("requires every requested Platform key, including explicit proven absence (AUD-026-FUN002)", () => {
  const keys = [FIRST, SECOND];
  const result = validatePlatformAddressBatch(
    response([
      [FIRST, null],
      [SECOND, { balance: "7", nonce: "1" }],
    ]),
    keys,
  );
  expect(result.data.get(FIRST)).toBeNull();
  expect(result.data.get(SECOND)?.balance).toBe(7n);
  expect(() => validatePlatformAddressBatch(response([[FIRST, null]]), keys)).toThrow(
    /omitted a requested/u,
  );
  expect(() =>
    validatePlatformAddressBatch(
      response([
        [FIRST, null],
        [FIRST, null],
      ]),
      keys,
    ),
  ).toThrow(/duplicate/u);
  expect(() =>
    validatePlatformAddressBatch(
      response([
        [FIRST, null],
        [SECOND, null],
      ]),
      [FIRST],
    ),
  ).toThrow(/unrequested/u);
});
