import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const BACKUP_NAME =
  /^planner-production_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.dump\.gpg$/;
const SHA256 = /^[a-f0-9]{64}$/;

export interface BackupGeneration {
  createdAt: Date;
  fileName: string;
  filePath: string;
  manifestPath: string;
  checksumPath: string;
  encryptedBytes: number;
  sha256: string;
}

export interface BackupManifest {
  version: 1;
  fileName: string;
  createdAt: string;
  verifiedAt: string;
  encryptedBytes: number;
  sha256: string;
  durationMs: number;
  tools: {
    pgDump: string;
    pgRestore: string;
    gpg: string;
  };
}

export function backupFileName(createdAt: Date): string {
  const timestamp = createdAt
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
  return `planner-production_${timestamp}.dump.gpg`;
}

export function parseBackupFileName(fileName: string): Date | null {
  const match = BACKUP_NAME.exec(fileName);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const createdAt = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  return backupFileName(createdAt) === fileName ? createdAt : null;
}

export function manifestFileName(fileName: string): string {
  return `${fileName}.manifest.json`;
}

export function checksumFileName(fileName: string): string {
  return `${fileName}.sha256`;
}

export async function sha256File(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  const input = createReadStream(filePath);
  for await (const chunk of input) digest.update(chunk as Buffer);
  return digest.digest("hex");
}

export function parseManifest(value: unknown): BackupManifest | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const tools = value.tools;
  if (!isRecord(tools)) return null;

  const manifest: BackupManifest = {
    version: 1,
    fileName: stringValue(value.fileName),
    createdAt: stringValue(value.createdAt),
    verifiedAt: stringValue(value.verifiedAt),
    encryptedBytes: numberValue(value.encryptedBytes),
    sha256: stringValue(value.sha256),
    durationMs: numberValue(value.durationMs),
    tools: {
      pgDump: stringValue(tools.pgDump),
      pgRestore: stringValue(tools.pgRestore),
      gpg: stringValue(tools.gpg),
    },
  };

  if (
    !manifest.fileName ||
    !parseBackupFileName(manifest.fileName) ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    Number.isNaN(Date.parse(manifest.verifiedAt)) ||
    !Number.isSafeInteger(manifest.encryptedBytes) ||
    manifest.encryptedBytes <= 0 ||
    !Number.isSafeInteger(manifest.durationMs) ||
    manifest.durationMs < 0 ||
    !SHA256.test(manifest.sha256) ||
    !manifest.tools.pgDump ||
    !manifest.tools.pgRestore ||
    !manifest.tools.gpg
  ) {
    return null;
  }

  return manifest;
}

/**
 * A generation is visible to freshness and retention only when all three published files
 * agree and the encrypted bytes still hash to the recorded digest. Anything malformed is
 * left alone for a human rather than guessed at by pruning.
 */
export async function discoverVerifiedGenerations(
  destination: string,
): Promise<BackupGeneration[]> {
  const entries = await readdir(destination, { withFileTypes: true });
  const generations: BackupGeneration[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const createdAt = parseBackupFileName(entry.name);
    if (!createdAt) continue;

    const filePath = path.join(destination, entry.name);
    const manifestPath = path.join(destination, manifestFileName(entry.name));
    const checksumPath = path.join(destination, checksumFileName(entry.name));
    const generation = await readVerifiedGeneration({
      createdAt,
      fileName: entry.name,
      filePath,
      manifestPath,
      checksumPath,
    });
    if (generation) generations.push(generation);
  }

  return generations.sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

export async function readSelectedGeneration(
  filePath: string,
): Promise<BackupGeneration> {
  const fileName = path.basename(filePath);
  const createdAt = parseBackupFileName(fileName);
  if (!createdAt) throw new Error(`Not a Planner production backup: ${fileName}`);

  const generation = await readVerifiedGeneration({
    createdAt,
    fileName,
    filePath,
    manifestPath: path.join(path.dirname(filePath), manifestFileName(fileName)),
    checksumPath: path.join(path.dirname(filePath), checksumFileName(fileName)),
  });
  if (!generation)
    throw new Error(`Backup generation is incomplete or invalid: ${fileName}`);
  return generation;
}

async function readVerifiedGeneration(paths: {
  createdAt: Date;
  fileName: string;
  filePath: string;
  manifestPath: string;
  checksumPath: string;
}): Promise<BackupGeneration | null> {
  try {
    const [metadata, manifestText, checksumText] = await Promise.all([
      stat(paths.filePath),
      readFile(paths.manifestPath, "utf8"),
      readFile(paths.checksumPath, "utf8"),
    ]);
    if (!metadata.isFile() || metadata.size <= 0) return null;

    const manifest = parseManifest(JSON.parse(manifestText) as unknown);
    if (
      !manifest ||
      manifest.fileName !== paths.fileName ||
      manifest.createdAt !== paths.createdAt.toISOString() ||
      manifest.encryptedBytes !== metadata.size
    ) {
      return null;
    }

    const expectedChecksum = `${manifest.sha256}  ${paths.fileName}`;
    if (checksumText.trimEnd() !== expectedChecksum) return null;
    if ((await sha256File(paths.filePath)) !== manifest.sha256) return null;

    return {
      ...paths,
      encryptedBytes: metadata.size,
      sha256: manifest.sha256,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
