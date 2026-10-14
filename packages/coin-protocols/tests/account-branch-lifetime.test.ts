import { afterEach, describe, expect, it, vi } from "vitest";
import type { HDKey } from "@scure/bip32";
import * as bip32 from "@ckd/core/bip32.js";
import * as crypto from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { withAccountBranch } from "../src/account-branch.js";
import { DASH_CORE_PATHS } from "../src/coins/dash/profiles.js";

// Synthetic buffers model HDKey's 32-byte private and 33-byte compressed-public getters.
// No key generation or KDF is used.
function fakeNode(name: string, value: number, order: string[]) {
  const ownedPrivate = new Uint8Array(32).fill(value);
  const privateCopies: Uint8Array[] = [];
  const publicCopies: Uint8Array[] = [];
  let privateAvailable = true;
  let publicAvailable = true;
  const node = {
    derive: vi.fn(),
    deriveChild: vi.fn(),
    privateExtendedKey: `synthetic-private-${name}`,
    publicExtendedKey: `synthetic-public-${name}`,
    get privateKey() {
      if (!privateAvailable) return null;
      const copy = ownedPrivate.slice();
      privateCopies.push(copy);
      return copy;
    },
    get publicKey() {
      if (!publicAvailable) return null;
      const copy = new Uint8Array(33).fill(value);
      publicCopies.push(copy);
      return copy;
    },
    wipePrivateData: vi.fn(() => {
      order.push(name);
      ownedPrivate.fill(0);
    }),
  };
  return {
    node,
    key: node as unknown as HDKey,
    ownedPrivate,
    privateCopies,
    publicCopies,
    refusePrivate: () => {
      privateAvailable = false;
    },
    refusePublic: () => {
      publicAvailable = false;
    },
  };
}

function fixture() {
  const order: string[] = [];
  const root = fakeNode("root", 1, order);
  const account = fakeNode("account", 2, order);
  const branch = fakeNode("branch", 3, order);
  const child = fakeNode("child", 4, order);
  root.node.derive.mockReturnValue(account.key);
  account.node.deriveChild.mockReturnValue(branch.key);
  branch.node.deriveChild.mockReturnValue(child.key);
  const factory = vi.spyOn(bip32, "rootFromSeed").mockReturnValue(root.key);
  // Public synthetic seed-sized input remains caller-owned throughout node cleanup.
  const input = {
    seed: new Uint8Array(64).fill(0xa5),
    network: "mainnet" as const,
    account: 0,
    branch: 1,
    start: 7,
    count: 1,
  };
  const layout = { versions: BIP32_MAINNET_VERSIONS, paths: DASH_CORE_PATHS };
  return { root, account, branch, child, factory, order, input, layout };
}

function expectWipes(state: ReturnType<typeof fixture>, expected: string[]): void {
  expect(state.order).toEqual(expected);
  for (const name of ["root", "account", "branch", "child"] as const) {
    const node = state[name];
    const owned = expected.includes(name);
    expect(node.node.wipePrivateData).toHaveBeenCalledTimes(owned ? 1 : 0);
    expect(node.ownedPrivate.every((byte) => byte === 0)).toBe(owned);
  }
  expect(state.input.seed.every((byte) => byte === 0xa5)).toBe(true);
}

describe("shared account/branch ownership on exceptional paths", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not claim a node when root construction fails before returning it", () => {
    const state = fixture();
    const failure = new Error("Controlled root construction failure.");
    state.factory.mockImplementation(() => {
      throw failure;
    });
    const build = vi.fn();
    expect(() => withAccountBranch(state.input, state.layout, build)).toThrow(failure);
    expect(build).not.toHaveBeenCalled();
    expectWipes(state, []);
  });

  it("wipes the root when account derivation fails", () => {
    const state = fixture();
    const failure = new Error("Controlled account derivation failure.");
    state.root.node.derive.mockImplementation(() => {
      throw failure;
    });
    expect(() => withAccountBranch(state.input, state.layout, vi.fn())).toThrow(failure);
    expectWipes(state, ["root"]);
  });

  it("wipes the account and root when branch derivation fails", () => {
    const state = fixture();
    const failure = new Error("Controlled branch derivation failure.");
    state.account.node.deriveChild.mockImplementation(() => {
      throw failure;
    });
    expect(() => withAccountBranch(state.input, state.layout, vi.fn())).toThrow(failure);
    expectWipes(state, ["account", "root"]);
  });

  it("wipes every parent when child derivation fails", () => {
    const state = fixture();
    const failure = new Error("Controlled child derivation failure.");
    state.branch.node.deriveChild.mockImplementation(() => {
      throw failure;
    });
    expect(() =>
      withAccountBranch(state.input, state.layout, (chain) => chain.rows(vi.fn())),
    ).toThrow(failure);
    expectWipes(state, ["branch", "account", "root"]);
  });

  it("wipes the child and parents when private-key admission fails", () => {
    const state = fixture();
    state.child.refusePrivate();
    expect(() =>
      withAccountBranch(state.input, state.layout, (chain) => chain.rows(vi.fn())),
    ).toThrow(/No private key/u);
    expect(state.child.privateCopies).toEqual([]);
    expectWipes(state, ["child", "branch", "account", "root"]);
  });

  it("wipes the returned private copy when public-key admission fails", () => {
    const state = fixture();
    const wipe = vi.spyOn(crypto, "wipe");
    state.child.refusePublic();
    expect(() =>
      withAccountBranch(state.input, state.layout, (chain) => chain.rows(vi.fn())),
    ).toThrow(/No public key/u);
    expect(state.child.privateCopies).toHaveLength(1);
    expect(state.child.privateCopies[0]?.every((byte) => byte === 0)).toBe(true);
    expect(wipe).toHaveBeenCalledWith(state.child.privateCopies[0], null);
    expectWipes(state, ["child", "branch", "account", "root"]);
  });

  it("cleans summary key copies when root public-key admission fails", () => {
    const state = fixture();
    const wipe = vi.spyOn(crypto, "wipe");
    state.root.refusePublic();
    expect(() => withAccountBranch(state.input, state.layout, vi.fn())).toThrow(/No public key/u);
    expect(state.root.privateCopies).toHaveLength(1);
    expect(state.root.privateCopies[0]?.every((byte) => byte === 0)).toBe(true);
    expect(wipe).toHaveBeenCalledWith(state.root.privateCopies[0], null, null);
    expectWipes(state, ["branch", "account", "root"]);
  });

  it("cleans summary key copies when fingerprint construction fails", () => {
    const state = fixture();
    const failure = new Error("Controlled fingerprint failure.");
    vi.spyOn(crypto, "hash160").mockImplementation(() => {
      throw failure;
    });
    expect(() => withAccountBranch(state.input, state.layout, vi.fn())).toThrow(failure);
    for (const copy of [...state.root.privateCopies, ...state.root.publicCopies])
      expect(copy.every((byte) => byte === 0)).toBe(true);
    expectWipes(state, ["branch", "account", "root"]);
  });

  it("keeps successful paths and rows while clearing every temporary copy", () => {
    const state = fixture();
    const result = withAccountBranch(state.input, state.layout, (chain) => ({
      accountPath: chain.accountPath,
      branchPath: chain.branchPath,
      rows: chain.rows(({ index, path, privateKey, publicKey }) => ({
        index,
        path,
        privateByte: privateKey[0],
        publicByte: publicKey[0],
      })),
    }));
    expect(result).toEqual({
      accountPath: "m/44'/5'/0'",
      branchPath: "m/44'/5'/0'/1",
      rows: [{ index: 7, path: "m/44'/5'/0'/1/7", privateByte: 4, publicByte: 4 }],
    });
    for (const copy of [
      ...state.root.privateCopies,
      ...state.root.publicCopies,
      ...state.child.privateCopies,
      ...state.child.publicCopies,
    ])
      expect(copy.every((byte) => byte === 0)).toBe(true);
    expect(state.root.node.derive).toHaveBeenCalledWith("m/44'/5'/0'");
    expect(state.account.node.deriveChild).toHaveBeenCalledWith(1);
    expect(state.branch.node.deriveChild).toHaveBeenCalledWith(7);
    expectWipes(state, ["child", "branch", "account", "root"]);
  });

  it("clears both key copies and every node when row construction fails", () => {
    const state = fixture();
    const failure = new Error("Controlled row construction failure.");
    expect(() =>
      withAccountBranch(state.input, state.layout, (chain) =>
        chain.rows(() => {
          throw failure;
        }),
      ),
    ).toThrow(failure);
    for (const copy of [...state.child.privateCopies, ...state.child.publicCopies])
      expect(copy.every((byte) => byte === 0)).toBe(true);
    expectWipes(state, ["child", "branch", "account", "root"]);
  });

  it("still clears outer owners if branch disposal throws", () => {
    const state = fixture();
    const failure = new Error("Controlled branch disposal failure.");
    const dispose = state.branch.node.wipePrivateData.getMockImplementation()!;
    state.branch.node.wipePrivateData.mockImplementation(() => {
      dispose();
      throw failure;
    });
    expect(() => withAccountBranch(state.input, state.layout, () => "built")).toThrow(failure);
    expectWipes(state, ["branch", "account", "root"]);
  });
});
