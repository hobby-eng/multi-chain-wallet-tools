/** Bounded, regular-file-only I/O for explicit, reviewed MnemoCode intake paths. */
import { createHash } from "node:crypto";
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const FILE_BYTES = 16 * 1024 * 1024;
const TOTAL_BYTES = 64 * 1024 * 1024;
const JSON_BYTES = 2 * 1024 * 1024;
const HANDOVER_HASHES = [
  "capsuleSha256",
  "assetsSupplementSha256",
  "documentsSupplementSha256",
  "snapshotFingerprint",
  "gitStatusSha256",
];
const MESSAGES = Object.freeze({
  path: "MnemoCode intake requires an allowed regular file inside its root.",
  limit: "MnemoCode intake exceeds its file or aggregate byte limit.",
  identity: "MnemoCode intake identity is missing, malformed or inconsistent.",
  changed: "MnemoCode intake input or destination changed since validation.",
  version: "MnemoCode intake dependency or bridge versions disagree.",
  closure: "MnemoCode intake file or integrity pin set differs from the reviewed closure.",
  io: "The MnemoCode intake file operation failed.",
});
const compareKeys = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
function nativeIO(action) {
  try {
    return action();
  } catch (cause) {
    if (cause instanceof MnemoCodeIntakeError) throw cause;
    throw new MnemoCodeIntakeError("io", { cause });
  }
}

/** Stable, input-free refusals; native failures remain available only as their cause. */
export class MnemoCodeIntakeError extends Error {
  constructor(kind, options) {
    super(MESSAGES[kind], options);
    this.code = `mnemocode.intake.${kind}`;
  }
}

/** Digest and closed-record rules shared by the portable and native intake. */
export class IntakeIdentity {
  static hash(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
  }

  static requireHash(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))
      throw new MnemoCodeIntakeError("identity");
    return value;
  }

  static record(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new MnemoCodeIntakeError("identity");
    return value;
  }

  /** The base commit describes the checkout; hashes bind the actual reviewed working bytes. */
  static handover(value) {
    IntakeIdentity.exactKeys(value, [...HANDOVER_HASHES, "baseCommit", "dirty"]);
    for (const name of HANDOVER_HASHES) IntakeIdentity.requireHash(value[name]);
    if (
      typeof value.baseCommit !== "string" ||
      !/^[0-9a-f]{40}$/u.test(value.baseCommit) ||
      typeof value.dirty !== "boolean"
    )
      throw new MnemoCodeIntakeError("identity");
    return Object.fromEntries(
      [...HANDOVER_HASHES, "baseCommit", "dirty"].map((name) => [name, value[name]]),
    );
  }

  static exactKeys(value, expected) {
    const actual = Object.keys(IntakeIdentity.record(value)).sort(compareKeys);
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort(compareKeys)))
      throw new MnemoCodeIntakeError("closure");
  }

  static pinned(bytes, expected) {
    if (IntakeIdentity.hash(bytes) !== IntakeIdentity.requireHash(expected))
      throw new MnemoCodeIntakeError("changed");
    return bytes;
  }

  static json(bytes) {
    if (bytes.length > JSON_BYTES) throw new MnemoCodeIntakeError("limit");
    try {
      return IntakeIdentity.record(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
    } catch (cause) {
      if (cause instanceof MnemoCodeIntakeError) throw cause;
      throw new MnemoCodeIntakeError("identity", { cause });
    }
  }

  /** Receipt keys and digests are ASCII; sorting is lexicographic, independent of locale. */
  static fingerprint(native, source) {
    const sorted = (record) =>
      Object.fromEntries(Object.entries(record).sort(([a], [b]) => compareKeys(a, b)));
    return IntakeIdentity.hash(JSON.stringify({ native: sorted(native), source: sorted(source) }));
  }
}

/** A closed directory boundary. Symlink components, hard-linked writes and special files refuse. */
export class IntakeDirectory {
  #root;
  #allowed;
  #readBytes = 0;
  #sizes = new Map();

  constructor(root, allowed) {
    this.#root = nativeIO(() => resolve(root));
    this.#allowed = nativeIO(() => new Set(allowed));
    nativeIO(() => {
      if (!lstatSync(this.#root).isDirectory() || realpathSync(this.#root) !== this.#root)
        throw new MnemoCodeIntakeError("path");
    });
  }

  #path(file, missing = false) {
    if (
      typeof file !== "string" ||
      !this.#allowed.has(file) ||
      isAbsolute(file) ||
      file.includes("\\") ||
      file.split("/").some((part) => part === "" || part === "." || part === "..")
    )
      throw new MnemoCodeIntakeError("path");
    const parts = file.split("/");
    let path = this.#root;
    for (let index = 0; index < parts.length; index += 1) {
      path = resolve(path, parts[index]);
      // lstat must also see dangling symlinks, which existsSync alone cannot detect.
      let stat;
      try {
        stat = lstatSync(path);
      } catch (cause) {
        if (missing && cause.code === "ENOENT") return resolve(this.#root, file);
        throw new MnemoCodeIntakeError("path", { cause });
      }
      if (
        stat.isSymbolicLink() ||
        (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())
      )
        throw new MnemoCodeIntakeError("path");
    }
    return path;
  }

  /** Reads an allowed file, bounding allocation and detecting a change during the read. */
  read(file) {
    return nativeIO(() => this.#read(file));
  }

  #read(file) {
    const path = this.#path(file);
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = fstatSync(fd);
      if (!before.isFile()) throw new MnemoCodeIntakeError("path");
      // Count each file's largest observed size, so safety rechecks do not spend the budget again.
      const additional = Math.max(0, before.size - (this.#sizes.get(file) ?? 0));
      if (before.size > FILE_BYTES || this.#readBytes + additional > TOTAL_BYTES)
        throw new MnemoCodeIntakeError("limit");
      const bytes = Buffer.alloc(before.size + 1);
      // An extra bounded read detects growth without readFileSync allocating an unbounded file.
      let count = 0;
      while (count < bytes.length) {
        const read = readSync(fd, bytes, count, bytes.length - count, null);
        if (read === 0) break;
        count += read;
      }
      if (count !== before.size) throw new MnemoCodeIntakeError("changed");
      const after = fstatSync(fd);
      if (
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs ||
        this.#path(file) !== path
      )
        throw new MnemoCodeIntakeError("changed");
      this.#readBytes += additional;
      this.#sizes.set(file, Math.max(count, this.#sizes.get(file) ?? 0));
      return bytes.subarray(0, count);
    } finally {
      closeSync(fd);
    }
  }

  /** Captures existing bytes or explicit absence before any write is allowed. */
  capture(file) {
    return nativeIO(() => this.#capture(file));
  }

  #capture(file) {
    const path = this.#path(file, true);
    if (!existsSync(path)) return null;
    if (lstatSync(path).nlink !== 1) throw new MnemoCodeIntakeError("path");
    return IntakeIdentity.hash(this.read(file));
  }

  /** Rechecks the destination; callers have already validated every source and destination. */
  write(file, bytes, expected) {
    return nativeIO(() => this.#write(file, bytes, expected));
  }

  #write(file, bytes, expected) {
    if (!(bytes instanceof Uint8Array)) throw new MnemoCodeIntakeError("identity");
    if (bytes.length > FILE_BYTES) throw new MnemoCodeIntakeError("limit");
    if (this.capture(file) !== expected) throw new MnemoCodeIntakeError("changed");
    const path = this.#path(file, true);
    mkdirSync(dirname(path), { recursive: true });
    this.#path(file, true);
    const fd = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
      0o644,
    );
    try {
      writeFileSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
  }
}

/** Validates all destinations before changing any; metadata entries are applied last. */
export class IntakeWritePlan {
  #directory;
  #entries;

  constructor(root, entries) {
    const paths = entries.map(({ path }) => path);
    if (new Set(paths).size !== paths.length) throw new MnemoCodeIntakeError("closure");
    if (
      entries.some(({ bytes }) => bytes.length > FILE_BYTES) ||
      entries.reduce((sum, { bytes }) => sum + bytes.length, 0) > TOTAL_BYTES
    )
      throw new MnemoCodeIntakeError("limit");
    this.#directory = new IntakeDirectory(root, paths);
    this.#entries = entries.map((entry) => {
      const { path, bytes } = entry;
      const before = this.#directory.capture(path);
      if (Object.hasOwn(entry, "expectedBefore") && before !== entry.expectedBefore)
        throw new MnemoCodeIntakeError("changed");
      return { path, bytes: Buffer.from(bytes), before };
    });
  }

  /** A filesystem failure can leave a partial write; unchanged manifest gates then refuse it. */
  apply() {
    for (const { path, before } of this.#entries)
      if (this.#directory.capture(path) !== before) throw new MnemoCodeIntakeError("changed");
    for (const { path, bytes, before } of this.#entries) this.#directory.write(path, bytes, before);
  }
}
