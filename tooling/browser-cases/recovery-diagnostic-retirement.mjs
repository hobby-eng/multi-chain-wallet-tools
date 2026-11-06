import assert from "node:assert/strict";
import { BrowserFixtures } from "../browser-regressions/fixtures.mjs";

/** Retain actual decoded diagnostic nodes across editing, replacement and Clear. */
export class RecoveryDiagnosticRetirementCase {
  static async run(context, profile, run, openWithLinkedPhrase) {
    const { page } = await openWithLinkedPhrase(context, profile, run, "mnemocode");
    await page.locator('[data-operation-tab][aria-controls="mnemocode-decode-panel"]').click();
    await page.locator("#mnemocode-decode-mode").selectOption("direct");
    await page.locator("#mnemocode-decode-format").selectOption("english");
    const result = page.locator("#mnemocode-decode-result");
    const retired = [];
    try {
      for (const operation of ["edit", "replace", "clear"]) {
        await page.locator("#mnemocode-input").fill(BrowserFixtures.mnemonic);
        await page.locator("#decode-mnemocode").click();
        await result.getByRole("button", { name: "Show phrase", exact: true }).click();
        const diagnostic = result.locator(".recovered-seed-diagnostic .secret-value");
        await diagnostic.first().waitFor();
        const nodes = await diagnostic.elementHandles();
        retired.push(...nodes);
        assert.ok(nodes.length > 0);
        assert.ok((await Promise.all(nodes.map((node) => node.textContent()))).includes("abandon"));
        if (operation === "edit") await page.locator("#mnemocode-input").fill("");
        else if (operation === "replace") await page.locator("#decode-mnemocode").click();
        else {
          // Clear is hidden in Recovery mode. Exercise its native handler without switching modes,
          // since a mode switch could conceal the diagnostic and mask a broken Clear handler.
          await page.locator("#clear-all").evaluate((button) => button.click());
        }
        for (const node of nodes) assert.equal(await node.textContent(), "");
      }
      assert.deepEqual(run.requests, []);
      run.checks.push("Recovered diagnostic nodes retire before edit, replacement and Clear.");
    } finally {
      await page.locator("#clear-all").evaluate((button) => button.click());
      for (const node of retired) await node.dispose();
    }
  }
}
