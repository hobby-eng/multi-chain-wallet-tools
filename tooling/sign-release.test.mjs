import { describe, expect, it } from "vitest";
import { signingArguments } from "./sign-release.mjs";

describe("the command line of the release signature", () => {
  it("takes the tag from --tag or the package version, and one GPG key ID", () => {
    expect(signingArguments(["--", "--tag", "v0.1.5", "ABC123"], "v0.1.6")).toEqual({
      tag: "v0.1.5",
      signer: "ABC123",
    });
    expect(signingArguments(["--profile", "dash-community"], "v0.1.5")).toEqual({
      tag: "v0.1.5",
      signer: undefined,
    });
    expect(
      signingArguments(["--profile=dash-community", "--tag", "v0.1.5-rc.1"], "v0.1.5"),
    ).toEqual({
      tag: "v0.1.5-rc.1",
      signer: undefined,
    });
  });

  it("refuses what it would otherwise read as another release or key", () => {
    expect(() => signingArguments(["--tag=v0.1.4"], "v0.1.5")).toThrow(
      "Unknown option --tag=v0.1.4: give the tag as --tag v<version>, two arguments.",
    );
    expect(() => signingArguments(["ABC123", "--tag"], "v0.1.5")).toThrow("--tag needs a value.");
    expect(() => signingArguments(["v0.1.4", "ABC123"], "v0.1.5")).toThrow(
      "v0.1.4 looks like a tag: give it as --tag v0.1.4.",
    );
    expect(() => signingArguments(["ABC123", "DEF456"], "v0.1.5")).toThrow(
      "Give one GPG key ID, not ABC123 and DEF456.",
    );
    expect(() => signingArguments(["--tag", "main"], "v0.1.5")).toThrow("Not a release tag: main.");
  });
});
