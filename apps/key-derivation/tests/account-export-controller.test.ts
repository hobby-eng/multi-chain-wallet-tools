import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { installAccountExportController } from "../src/ui/account-export-controller.js";
import { AccountDescriptorFixture } from "@ckd/test-support/account-descriptor-fixture.js";

const { publicText: PUBLIC, privateText: PRIVATE } = AccountDescriptorFixture.create();

function fixture(action: string, format = "raw", revealed = false) {
  const page = new CompleteIdPage();
  const document = page.asDocument();
  const selector = document.createElement("select");
  selector.id = "account-export-format";
  selector.value = format;
  document.body.append(selector);
  const button = document.createElement("button");
  const result: DerivationResult = {
    id: "synthetic",
    title: "Synthetic account",
    networkLabel: "mainnet",
    pathTemplate: "m/i",
    rows: [],
    basicSummary: [],
    summary: [],
    notices: [],
    accountDescriptors: AccountDescriptorFixture.create(),
  };
  const dependencies = {
    document,
    buttons: { [action]: button },
    result: () => result,
    secretsRevealed: () => revealed,
    copyText: vi.fn(async () => {}),
    downloadText: vi.fn(),
    showError: vi.fn(),
    showStatus: vi.fn(),
  };
  installAccountExportController(dependencies);
  return { button, result, dependencies };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["publicMystery", "privateMystery"])("refuses the unknown account action %s", (action) => {
  const f = fixture(action);
  f.button.click();
  expect(f.dependencies.copyText).not.toHaveBeenCalled();
  expect(f.dependencies.downloadText).not.toHaveBeenCalled();
  expect(f.dependencies.showError).toHaveBeenCalledOnce();
});

it("refuses an unknown account format before reading descriptor text", () => {
  const f = fixture("publicCopy", "synthetic untrusted format");
  const read = vi.spyOn(f.result.accountDescriptors!, "publicText", "get").mockReturnValue(PUBLIC);
  f.button.click();
  expect(f.dependencies.copyText).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
  expect(f.dependencies.showError).toHaveBeenCalledOnce();
});

it("requires disclosure before reading private descriptors", () => {
  const f = fixture("privateCopy");
  const read = vi
    .spyOn(f.result.accountDescriptors!, "privateText", "get")
    .mockReturnValue(PRIVATE);
  f.button.click();
  expect(read).not.toHaveBeenCalled();
  expect(f.dependencies.copyText).not.toHaveBeenCalled();
  expect(f.dependencies.showError).toHaveBeenCalledOnce();
});

it("saves the explicit private descriptors only after disclosure", () => {
  const f = fixture("privateDownload", "raw", true);
  f.button.click();
  expect(f.dependencies.downloadText).toHaveBeenCalledExactlyOnceWith(
    PRIVATE,
    "synthetic-account.PRIVATE.descriptors.txt",
    "text/plain",
  );
});
