import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import type { BackupGeneration } from "./generations";
import { decryptToCommand, verifyEncryptedArchive, type BackupTools } from "./pipeline";

const execFileAsync = promisify(execFile);

export interface RestoreCounts {
  migrations: number;
  users: number;
  sessions: number;
  accounts: number;
  verifications: number;
  nodes: number;
  notes: number;
  userSettings: number;
  financeTransactions: number;
}

export interface RestoreTestResult {
  serverVersion: string;
  counts: RestoreCounts;
  durationMs: number;
}

const RESTORE_COUNTS_SQL = `
SELECT json_build_object(
  'migrations', (SELECT count(*)::int FROM drizzle.__drizzle_migrations),
  'users', (SELECT count(*)::int FROM public.users),
  'sessions', (SELECT count(*)::int FROM public.sessions),
  'accounts', (SELECT count(*)::int FROM public.accounts),
  'verifications', (SELECT count(*)::int FROM public.verifications),
  'nodes', (SELECT count(*)::int FROM public.nodes),
  'notes', (SELECT count(*)::int FROM public.notes),
  'userSettings', (SELECT count(*)::int FROM public.user_settings),
  'financeTransactions', (SELECT count(*)::int FROM public.finance_transactions)
)::text;
`;

export async function restoreTest(input: {
  generation: BackupGeneration;
  passphrase: string;
  tools: BackupTools;
}): Promise<RestoreTestResult> {
  const startedAt = Date.now();
  await verifyEncryptedArchive({
    archivePath: input.generation.filePath,
    passphrase: input.passphrase,
    tools: input.tools,
  });

  const containerName = `planner-backup-restore-${randomUUID().slice(0, 12)}`;
  let containerStarted = false;
  try {
    await run(input.tools.docker, [
      "run",
      "--rm",
      "--detach",
      "--name",
      containerName,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:18",
    ]);
    containerStarted = true;
    await waitForPostgres(input.tools.docker, containerName);

    await decryptToCommand({
      archivePath: input.generation.filePath,
      passphrase: input.passphrase,
      gpg: input.tools.gpg,
      command: input.tools.docker,
      args: [
        "exec",
        "--interactive",
        containerName,
        "pg_restore",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "--username=postgres",
        "--dbname=postgres",
      ],
      label: "PostgreSQL 18 pg_restore",
    });

    const serverVersion = (
      await run(input.tools.docker, [
        "exec",
        containerName,
        "psql",
        "--no-psqlrc",
        "--tuples-only",
        "--no-align",
        "--username=postgres",
        "--dbname=postgres",
        "--command=SHOW server_version",
      ])
    ).trim();
    if (!serverVersion.startsWith("18.")) {
      throw new Error(
        `Restore drill used PostgreSQL ${serverVersion}, not PostgreSQL 18.`,
      );
    }

    const countText = await run(input.tools.docker, [
      "exec",
      containerName,
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      `--command=${RESTORE_COUNTS_SQL}`,
    ]);
    const counts = parseRestoreCounts(countText.trim());
    for (const [label, count] of Object.entries({
      migrations: counts.migrations,
      users: counts.users,
      accounts: counts.accounts,
      nodes: counts.nodes,
      notes: counts.notes,
      userSettings: counts.userSettings,
      financeTransactions: counts.financeTransactions,
    })) {
      if (count <= 0)
        throw new Error(
          `Restored ${label} count is ${count}; expected production data.`,
        );
    }

    return { serverVersion, counts, durationMs: Date.now() - startedAt };
  } finally {
    if (containerStarted) {
      await run(input.tools.docker, ["rm", "--force", containerName]).catch(
        () => undefined,
      );
    }
  }
}

function parseRestoreCounts(value: string): RestoreCounts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Restore verification did not return valid row counts.");
  }
  if (!isRecord(parsed))
    throw new Error("Restore verification did not return row counts.");

  const keys: Array<keyof RestoreCounts> = [
    "migrations",
    "users",
    "sessions",
    "accounts",
    "verifications",
    "nodes",
    "notes",
    "userSettings",
    "financeTransactions",
  ];
  const result = {} as RestoreCounts;
  for (const key of keys) {
    const count = parsed[key];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Restore verification returned an invalid ${key} count.`);
    }
    result[key] = count;
  }
  return result;
}

async function waitForPostgres(docker: string, containerName: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await run(docker, ["exec", containerName, "pg_isready", "--dbname=postgres"]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw new Error("Disposable PostgreSQL 18 did not become ready within 60 seconds.");
}

async function run(executable: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(executable, args, {
      encoding: "utf8",
      maxBuffer: 4 * 1_024 * 1_024,
    });
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Command failed: ${detail}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
