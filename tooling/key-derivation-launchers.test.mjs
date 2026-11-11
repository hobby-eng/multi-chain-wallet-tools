import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import {
  assertDesktopVersionNote,
  assertLauncherEmbedsPage,
  desktopVersionNote,
  hostPlatform,
  LAUNCHER_PLATFORMS,
  launcherName,
  launcherNamePattern,
  removeLegacyLaunchers,
} from "./key-derivation-launchers.mjs";

const root = resolve(import.meta.dirname, "..");
const MULTI = BUILD_PROFILES["multi-chain"];
const DASH = BUILD_PROFILES["dash-community"];

/** Runs `check` with a temporary folder holding the files `names`, each with its name as content. */
function withFiles(names, check) {
  const folder = mkdtempSync(resolve(tmpdir(), "wallet-launchers-"));
  try {
    for (const name of names) writeFileSync(resolve(folder, name), name);
    check(folder);
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
}

describe("executable Key Derivation Tool names", () => {
  it("maps every supported system and processor to one launcher platform", () => {
    expect(hostPlatform("linux", "x64")).toBe("linux-x86_64");
    expect(hostPlatform("linux", "arm64")).toBe("linux-aarch64");
    expect(hostPlatform("win32", "x64")).toBe("windows-x86_64");
    expect(hostPlatform("darwin", "arm64")).toBe("macos-aarch64");
    expect(hostPlatform("darwin", "x64")).toBe("macos-x86_64");
    expect(() => hostPlatform("win32", "arm64")).toThrow(/No launcher is defined/u);
    expect(() => hostPlatform("freebsd", "x64")).toThrow(/No launcher is defined/u);
  });

  it("names each launcher after its page and platform, apart from the page itself", () => {
    expect(launcherName("Wallet_Key_Derivation_Tool.html", "linux-x86_64")).toBe(
      "Wallet_Key_Derivation_Tool_Desktop-linux-x86_64",
    );
    expect(launcherName("Wallet_Key_Derivation_Tool.html", "windows-x86_64")).toBe(
      "Wallet_Key_Derivation_Tool_Desktop-windows-x86_64.exe",
    );
    expect(launcherName("Dash_Community_Key_Derivation_Tool.html", "macos-aarch64")).toBe(
      "Dash_Community_Key_Derivation_Tool_Desktop-macos-aarch64",
    );
    expect(
      Object.keys(LAUNCHER_PLATFORMS).map((platform) => launcherName("P.html", platform)),
    ).toEqual([
      "P_Desktop-linux-x86_64",
      "P_Desktop-linux-aarch64",
      "P_Desktop-windows-x86_64.exe",
      "P_Desktop-macos-aarch64",
      "P_Desktop-macos-x86_64",
    ]);
    expect(launcherNamePattern("Wallet_Key_Derivation_Tool.html")).toBe(
      "Wallet_Key_Derivation_Tool_Desktop-<platform>",
    );
    expect(launcherNamePattern("Dash_Community_Key_Derivation_Tool.html")).toBe(
      "Dash_Community_Key_Derivation_Tool_Desktop-<platform>",
    );
  });

  it("removes the launchers named like the page alone and keeps the page and the Desktop files", () => {
    const kept = [
      "Wallet_Key_Derivation_Tool.html",
      "Wallet_Key_Derivation_Tool.html.sha256",
      "Wallet_Key_Derivation_Tool_Desktop-linux-x86_64",
      "Wallet_Key_Derivation_Tool_Desktop-windows-x86_64.exe",
    ];
    const legacy = [
      "Wallet_Key_Derivation_Tool-linux-x86_64",
      "Wallet_Key_Derivation_Tool-linux-aarch64",
      "Wallet_Key_Derivation_Tool-windows-x86_64.exe",
      "Wallet_Key_Derivation_Tool-macos-aarch64",
      "Wallet_Key_Derivation_Tool-macos-x86_64",
    ];
    withFiles([...kept, ...legacy], (folder) => {
      removeLegacyLaunchers(resolve(folder, "Wallet_Key_Derivation_Tool.html"));
      expect(readdirSync(folder).sort()).toEqual([...kept].sort());
    });
  });

  it("removes nothing for a page whose own name ends in the Desktop suffix", () => {
    // P_Desktop-linux-x86_64 would be an old name of P_Desktop.html, but it is the launcher of P.html.
    const names = ["P.html", "P_Desktop.html", "P_Desktop-linux-x86_64"];
    withFiles(names, (folder) => {
      removeLegacyLaunchers(resolve(folder, "P_Desktop.html"));
      expect(readdirSync(folder).sort()).toEqual([...names].sort());
    });
  });

  it("accepts a launcher only with the current page and its SHA-256", () => {
    const page = Buffer.from("<!doctype html><title>page</title>");
    const digest = createHash("sha256").update(page).digest("hex");
    const program = (...parts) => Buffer.concat([Buffer.from("program"), ...parts]);
    expect(() =>
      assertLauncherEmbedsPage(program(page, Buffer.from(digest)), page, "launcher"),
    ).not.toThrow();
    // The page without its digest, or the digest of another page, belongs to an older build.
    expect(() => assertLauncherEmbedsPage(program(page), page, "launcher")).toThrow(
      /does not embed the current page/u,
    );
    const older = Buffer.from("<!doctype html><title>older</title>");
    expect(() =>
      assertLauncherEmbedsPage(program(older, Buffer.from(digest)), page, "launcher"),
    ).toThrow(/does not embed the current page/u);
  });
});

describe("how the Deriver page names its executable version", () => {
  const MULTI_FILE = "Wallet_Key_Derivation_Tool_Desktop-<platform>";
  const DASH_FILE = "Dash_Community_Key_Derivation_Tool_Desktop-<platform>";
  const MULTI_NOTE = `Each release carries it for every platform as ${MULTI_FILE}.`;
  const DASH_NOTE = `Each release carries it for every platform as ${DASH_FILE}.`;
  const code = (file) => `<code>${file.replace("<", "&lt;").replace(">", "&gt;")}</code>`;
  /** A Deriver page with the MHFE panel, `help` in its HTML and `notice` in its script. */
  const page = (help, notice) =>
    `<section id="mhfe-panel"><p>${help}</p></section><script>const n="${notice}";</script>`;
  const multiPage = page(
    `Each release carries it for every platform as ${code(MULTI_FILE)}.`,
    MULTI_NOTE,
  );
  const dashPage = page(
    `Each release carries it for every platform as ${code(DASH_FILE)}.`,
    DASH_NOTE,
  );

  it("names each edition's own Desktop file, as text, HTML code and Markdown code", () => {
    expect(desktopVersionNote(MULTI)).toEqual({
      text: MULTI_NOTE,
      html: `Each release carries it for every platform as ${code(MULTI_FILE)}.`,
      markdown: `Each release carries it for every platform as \`${MULTI_FILE}\`.`,
    });
    expect(desktopVersionNote(DASH).text).toBe(DASH_NOTE);
    expect(desktopVersionNote({ ...DASH, desktopExecutables: false })).toEqual({
      text: `No executable is published for this edition: build it from source (${DASH_FILE}), or use the mhfe command-line program.`,
      html: `No executable is published for this edition: build it from source (${code(DASH_FILE)}), or use the mhfe command-line program.`,
      markdown: `No executable is published for this edition: build it from source (\`${DASH_FILE}\`), or use the mhfe command-line program.`,
    });
  });

  it("accepts each edition's own note, and a page without MHFE that has none", () => {
    expect(() => assertDesktopVersionNote(multiPage, MULTI)).not.toThrow();
    expect(() => assertDesktopVersionNote(dashPage, DASH)).not.toThrow();
    expect(() => assertDesktopVersionNote("<p>no MHFE here</p>", DASH)).not.toThrow();
  });

  it("refuses a leftover marker, the other edition's executable and a missing note", () => {
    for (const marker of ["__DESKTOP_FILE__", "__DESKTOP_VERSION_NOTE__"]) {
      expect(() => assertDesktopVersionNote(page(marker, MULTI_NOTE), MULTI)).toThrow(
        `The Deriver page keeps the marker ${marker}.`,
      );
    }
    expect(() => assertDesktopVersionNote(multiPage, DASH)).toThrow(
      "The Dash Community Edition Deriver page names the executable Wallet_Key_Derivation_Tool_Desktop-",
    );
    expect(() => assertDesktopVersionNote(dashPage, MULTI)).toThrow(
      "names the executable Dash_Community_Key_Derivation_Tool_Desktop-",
    );
    expect(() => assertDesktopVersionNote(page(MULTI_NOTE, "fast mode"), MULTI)).toThrow(
      "The Multi-Chain Edition Deriver page lacks the note",
    );
  });
});

describe("the release workflows' file patterns for the executables", () => {
  const PAGE = "Wallet_Key_Derivation_Tool.html";
  const names = Object.keys(LAUNCHER_PLATFORMS).map((platform) => launcherName(PAGE, platform));
  // What each pattern must select of launcherName's names: the macOS upload takes the two macOS
  // programs, every other pattern all five.
  const expected = {
    "Wallet_Key_Derivation_Tool_Desktop-macos-*": names.filter((name) => name.includes("-macos-")),
    "Wallet_Key_Derivation_Tool_Desktop-*": names,
  };
  const matcher = (glob) =>
    new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replaceAll("*", "[^/]*")}$`, "u");

  it.each([".github/workflows/release.yml", ".github/workflows/launchers.yml"])(
    "%s selects exactly the executables launcherName names, and never the page",
    (workflow) => {
      const text = readFileSync(resolve(root, workflow), "utf8");
      expect(text).not.toMatch(/Wallet_Key_Derivation_Tool-/u);
      const globs = [...text.matchAll(/Wallet_Key_Derivation_Tool[A-Za-z_]*-[A-Za-z0-9_.*-]*\*/gu)];
      expect(globs.length).toBeGreaterThan(0);
      for (const [glob] of globs) {
        expect(Object.keys(expected)).toContain(glob);
        const pattern = matcher(glob);
        expect(names.filter((name) => pattern.test(name))).toEqual(expected[glob]);
        expect(pattern.test(PAGE) || pattern.test(`${PAGE}.sha256`)).toBe(false);
      }
    },
  );
});
