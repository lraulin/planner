import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  backupFileName,
  checksumFileName,
  discoverVerifiedGenerations,
  manifestFileName,
  parseBackupFileName,
  sha256File,
  type BackupManifest,
} from "./generations";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("backup filenames", () => {
  it("round-trips the UTC instant without milliseconds", () => {
    const createdAt = new Date("2026-09-05T13:42:07.000Z");
    const fileName = backupFileName(createdAt);

    expect(fileName).toBe("planner-production_2026-09-05T13-42-07Z.dump.gpg");
    expect(parseBackupFileName(fileName)).toEqual(createdAt);
  });

  it.each([
    "planner-production_2026-02-30T01-02-03Z.dump.gpg",
    "planner-production_2026-01-01T24-00-00Z.dump.gpg",
    "planner-production_2026-01-01T00-00-00Z.dump",
    "notes_2026-01-01T00-00-00Z.dump.gpg",
  ])("rejects malformed or impossible name %s", (fileName) => {
    expect(parseBackupFileName(fileName)).toBeNull();
  });
});

describe("verified generations", () => {
  it("accepts matching archive, checksum, and manifest while ignoring malformed files", async () => {
    const directory = await tempDirectory();
    const createdAt = new Date("2026-09-05T13:42:07.000Z");
    const fileName = backupFileName(createdAt);
    const filePath = path.join(directory, fileName);
    await writeFile(filePath, "encrypted archive", { mode: 0o600 });
    const sha256 = await sha256File(filePath);
    const manifest: BackupManifest = {
      version: 1,
      fileName,
      createdAt: createdAt.toISOString(),
      verifiedAt: "2026-09-05T13:42:08.000Z",
      encryptedBytes: 17,
      sha256,
      durationMs: 1_000,
      tools: { pgDump: "pg_dump 18", pgRestore: "pg_restore 18", gpg: "gpg 2" },
    };
    await writeFile(
      path.join(directory, checksumFileName(fileName)),
      `${sha256}  ${fileName}\n`,
    );
    await writeFile(
      path.join(directory, manifestFileName(fileName)),
      `${JSON.stringify(manifest)}\n`,
    );
    await writeFile(
      path.join(directory, "planner-production_2026-99-99T99-99-99Z.dump.gpg"),
      "keep me",
    );
    await writeFile(path.join(directory, "holiday-photos.zip"), "keep me too");

    const generations = await discoverVerifiedGenerations(directory);

    expect(generations).toHaveLength(1);
    expect(generations[0]?.fileName).toBe(fileName);
  });

  it("ignores a generation whose encrypted bytes no longer match its checksum", async () => {
    const directory = await tempDirectory();
    const createdAt = new Date("2026-09-05T13:42:07.000Z");
    const fileName = backupFileName(createdAt);
    const filePath = path.join(directory, fileName);
    await writeFile(filePath, "changed");
    const falseDigest = "a".repeat(64);
    await writeFile(
      path.join(directory, checksumFileName(fileName)),
      `${falseDigest}  ${fileName}\n`,
    );
    await writeFile(
      path.join(directory, manifestFileName(fileName)),
      JSON.stringify({
        version: 1,
        fileName,
        createdAt: createdAt.toISOString(),
        verifiedAt: createdAt.toISOString(),
        encryptedBytes: 7,
        sha256: falseDigest,
        durationMs: 1,
        tools: { pgDump: "18", pgRestore: "18", gpg: "2" },
      }),
    );

    expect(await discoverVerifiedGenerations(directory)).toEqual([]);
  });
});

async function tempDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "planner-backup-generations-"));
  temporaryDirectories.push(root);
  await mkdir(root, { recursive: true });
  return root;
}
