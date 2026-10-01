import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertLauncherEmbedsPage,
  hostPlatform,
  LAUNCHER_PLATFORMS,
  launcherName,
} from "./key-derivation-launchers.mjs";

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

  it("names each launcher after its page and platform", () => {
    expect(launcherName("Wallet_Key_Derivation_Tool.html", "windows-x86_64")).toBe(
      "Wallet_Key_Derivation_Tool-windows-x86_64.exe",
    );
    expect(
      Object.keys(LAUNCHER_PLATFORMS).map((platform) => launcherName("P.html", platform)),
    ).toEqual([
      "P-linux-x86_64",
      "P-linux-aarch64",
      "P-windows-x86_64.exe",
      "P-macos-aarch64",
      "P-macos-x86_64",
    ]);
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
