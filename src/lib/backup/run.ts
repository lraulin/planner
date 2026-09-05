import {
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { backupFreshness } from "./freshness";
import {
  backupFileName,
  checksumFileName,
  discoverVerifiedGenerations,
  manifestFileName,
  parseBackupFileName,
  sha256File,
  type BackupManifest,
} from "./generations";
import {
  assertDirectDatabaseUrl,
  dumpEncryptedArchive,
  toolVersion,
  verifyEncryptedArchive,
  type BackupSecrets,
  type BackupTools,
} from "./pipeline";
import { planRetention } from "./retention";

export interface BackupLogger {
  info(message: string): void;
  warn(message: string): void;
}

export interface RunBackupResult {
  kind: "created" | "skipped";
  fileName?: string;
  encryptedBytes?: number;
  durationMs?: number;
  pruned: string[];
}

export async function runBackup(input: {
  destination: string;
  now?: Date;
  force: boolean;
  tools: BackupTools;
  loadSecrets: () => Promise<BackupSecrets>;
  logger?: BackupLogger;
}): Promise<RunBackupResult> {
  const requestedNow = input.now ?? new Date();
  const now = new Date(Math.floor(requestedNow.getTime() / 1_000) * 1_000);
  const logger = input.logger ?? silentLogger;
  const current = await discoverVerifiedGenerations(input.destination);
  const latest = current[0]?.createdAt ?? null;
  if (!input.force && backupFreshness(latest, now) === "fresh") {
    return { kind: "skipped", pruned: [] };
  }

  const releaseLock = await acquireLock(input.destination);
  const fileName = backupFileName(now);
  const finalPath = path.join(input.destination, fileName);
  const partialPath = `${finalPath}.partial`;
  const checksumPath = path.join(input.destination, checksumFileName(fileName));
  const manifestPath = path.join(input.destination, manifestFileName(fileName));
  let published = false;
  const startedAt = Date.now();

  try {
    await removeAbandonedPartials(input.destination);
    await unlinkIfPresent(partialPath);
    const secrets = await input.loadSecrets();
    assertDirectDatabaseUrl(secrets.databaseUrl);
    if (!secrets.passphrase) throw new Error("Backup passphrase is empty.");

    const [pgDumpVersion, pgRestoreVersion, gpgVersion] = await Promise.all([
      toolVersion(input.tools.pgDump),
      toolVersion(input.tools.pgRestore),
      toolVersion(input.tools.gpg),
    ]);
    if (
      !/PostgreSQL\) 18\./u.test(pgDumpVersion) ||
      !/PostgreSQL\) 18\./u.test(pgRestoreVersion)
    ) {
      throw new Error("Backup requires PostgreSQL 18 pg_dump and pg_restore.");
    }

    await dumpEncryptedArchive({
      destinationPath: partialPath,
      databaseUrl: secrets.databaseUrl,
      passphrase: secrets.passphrase,
      tools: input.tools,
    });
    await verifyEncryptedArchive({
      archivePath: partialPath,
      passphrase: secrets.passphrase,
      tools: input.tools,
    });

    const [sha256, metadata] = await Promise.all([
      sha256File(partialPath),
      stat(partialPath),
    ]);
    const durationMs = Date.now() - startedAt;
    const manifest: BackupManifest = {
      version: 1,
      fileName,
      createdAt: now.toISOString(),
      verifiedAt: new Date().toISOString(),
      encryptedBytes: metadata.size,
      sha256,
      durationMs,
      tools: { pgDump: pgDumpVersion, pgRestore: pgRestoreVersion, gpg: gpgVersion },
    };

    await rename(partialPath, finalPath);
    await atomicWrite(checksumPath, `${sha256}  ${fileName}\n`);
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    published = true;

    const verified = await discoverVerifiedGenerations(input.destination);
    const retention = planRetention(verified, now);
    const pruned: string[] = [];
    for (const generation of retention.prune) {
      await unlink(generation.filePath);
      await unlink(generation.checksumPath);
      await unlink(generation.manifestPath);
      pruned.push(generation.fileName);
    }
    if (pruned.length > 0)
      logger.info(`Pruned ${pruned.length} expired backup generation(s).`);

    return {
      kind: "created",
      fileName,
      encryptedBytes: metadata.size,
      durationMs,
      pruned,
    };
  } catch (error) {
    await unlinkIfPresent(partialPath);
    if (!published) {
      await Promise.all([
        unlinkIfPresent(finalPath),
        unlinkIfPresent(checksumPath),
        unlinkIfPresent(manifestPath),
      ]);
    } else {
      logger.warn(
        `Backup ${fileName} remains valid despite a later retention failure.`,
      );
    }
    throw error;
  } finally {
    await releaseLock();
  }
}

async function removeAbandonedPartials(destination: string): Promise<void> {
  const entries = await readdir(destination, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".partial")) continue;
    const partialTarget = entry.name.slice(0, -".partial".length);
    const publishedName = partialTarget
      .replace(/\.sha256$/u, "")
      .replace(/\.manifest\.json$/u, "");
    if (!parseBackupFileName(publishedName)) continue;
    await unlink(path.join(destination, entry.name));
  }
}

export async function retentionDryRun(input: {
  destination: string;
  now?: Date;
}): Promise<ReturnType<typeof planRetention>> {
  const generations = await discoverVerifiedGenerations(input.destination);
  return planRetention(generations, input.now ?? new Date());
}

async function atomicWrite(targetPath: string, contents: string): Promise<void> {
  const partialPath = `${targetPath}.partial`;
  await writeFile(partialPath, contents, { encoding: "utf8", mode: 0o600 });
  await rename(partialPath, targetPath);
}

async function acquireLock(destination: string): Promise<() => Promise<void>> {
  const lockPath = path.join(destination, ".planner-production-backup.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      return async () => {
        await handle.close();
        await unlinkIfPresent(lockPath);
      };
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const pid = await lockPid(lockPath);
      if (pid && processIsRunning(pid)) {
        throw new Error(`Another Planner backup is already running (pid ${pid}).`);
      }
      await unlinkIfPresent(lockPath);
    }
  }
  throw new Error("Could not acquire the Planner backup lock.");
}

async function lockPid(lockPath: string): Promise<number | null> {
  try {
    const contents = await readFile(lockPath, "utf8");
    const pid = Number(contents.trim());
    return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function unlinkIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

const silentLogger: BackupLogger = {
  info: () => undefined,
  warn: () => undefined,
};
