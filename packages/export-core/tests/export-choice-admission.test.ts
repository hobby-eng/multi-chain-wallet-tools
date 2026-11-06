import { expect, it } from "vitest";
import { getCoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { formatSelectedRows } from "../src/formatter.js";

const INVALID_CHOICES = [
  { mode: "basic", action: "synthetic-unknown", format: "plain", code: "export.choice.action" },
  { mode: "basic", action: "selected", format: "synthetic-unknown", code: "export.choice.format" },
  { mode: "synthetic-unknown", action: "selected", format: "plain", code: "export.choice.mode" },
];

it.each(INVALID_CHOICES)(
  "refuses $code before reading private values",
  ({ mode, action, format, code }) => {
    let reads = 0;
    const result: DerivationResult = {
      id: "bitcoin-legacy",
      title: "Synthetic public fixture",
      networkLabel: "mainnet",
      pathTemplate: "m/i",
      basicSummary: [],
      summary: [],
      notices: [],
      rows: [
        {
          index: 0,
          path: "m/0",
          title: "Public synthetic row",
          advanced: [],
          basic: [
            {
              key: "privateKey",
              label: "Synthetic private field",
              secret: true,
              get value() {
                reads += 1;
                return "public synthetic private-key fixture";
              },
            },
          ],
        },
      ],
    };
    expect(() => {
      Reflect.apply(formatSelectedRows, undefined, [
        getCoinAdapter("bitcoin-legacy"),
        result,
        new Set([0]),
        mode,
        action,
        format,
      ]);
    }).toThrow(expect.objectContaining({ code }));
    expect(reads).toBe(0);
  },
);

it.each(INVALID_CHOICES)(
  "still refuses $code when nothing is selected",
  ({ mode, action, format, code }) => {
    const result: DerivationResult = {
      id: "bitcoin-legacy",
      title: "Synthetic",
      networkLabel: "mainnet",
      pathTemplate: "m/i",
      basicSummary: [],
      summary: [],
      notices: [],
      rows: [],
    };
    expect(() => {
      Reflect.apply(formatSelectedRows, undefined, [
        getCoinAdapter("bitcoin-legacy"),
        result,
        new Set(),
        mode,
        action,
        format,
      ]);
    }).toThrow(expect.objectContaining({ code }));
  },
);
