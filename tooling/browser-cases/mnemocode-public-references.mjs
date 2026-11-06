import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

/** Release-only downloads of public reference text; no wallet export or card rendering. */
export class MnemoCodePublicReferencesCase {
  static async run(context, profile, run, openWithLinkedPhrase) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    await page.locator('[aria-controls="mnemocode-table-panel"]').click();
    const format = page.locator("#mnemocode-table-export-format");
    assert.equal(await format.inputValue(), "legacy");
    let mapping;
    // The original table is tab-separated; MnemoCode's numbered dictionaries line their columns up
    // with spaces, so their cells are compared.
    for (const [id, header, first, last] of [
      ["legacy", "index english unicode_hex", "1 abandon 7684", "2048 zoo 6B47"],
      ["english", "index english", "1 abandon", "2048 zoo"],
      ["chinese", "index chinese", "1 的", "2048 歇"],
      ["unicode", "index unicode_hex chinese", "1 7684 的", "2048 6B47 歇"],
      ["mapping", "index english unicode_hex chinese", "1 abandon 7684 的", "2048 zoo 6B47 歇"],
    ]) {
      await format.selectOption(id);
      const text = (await this.#download(page, "#mnemocode-table-save")).toString("utf8");
      const lines = text.trimEnd().split("\n");
      const cells = (line) => line.trim().split(/\s+/u).join(" ");
      assert.equal(lines.length, 2049, id);
      if (id === "legacy") assert.equal(lines[0], "index\tenglish\tunicode_hex", id);
      assert.equal(cells(lines[0]), header, id);
      assert.equal(cells(lines[1]), first, id);
      assert.equal(cells(lines.at(-1)), last, id);
      if (id === "mapping") mapping = text;
    }
    assert.ok(mapping);
    // MnemoCode's guide for reading a backup by hand, from its WebAssembly's recovery set.
    const guide = (await this.#download(page, "#mnemocode-table-guide")).toString("utf8");
    assert.match(guide, /^# MnemoCode: recovery without MnemoCode/u);
    const files = unzipSync(await this.#download(page, "#mnemocode-table-full-set"));
    assert.deepEqual(Object.keys(files).sort(), [
      "bip39-chinese.txt",
      "bip39-english.txt",
      "bip39-mapping.txt",
      "bip39-unicode.txt",
      "manual-recovery.md",
    ]);
    assert.equal(strFromU8(files["manual-recovery.md"]), guide);
    assert.equal(strFromU8(files["bip39-mapping.txt"]), mapping);
    assert.deepEqual(run.requests, []);
    run.checks.push(
      "All five numbered dictionary exports, complete reference ZIP and exact offline manual downloads.",
    );
  }

  static async #download(page, selector) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(selector).click(),
    ]);
    const path = await download.path();
    assert.ok(path, "The public reference download must have a local file.");
    return readFileSync(path);
  }
}
