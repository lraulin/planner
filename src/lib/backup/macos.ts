import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  assertDirectDatabaseUrl,
  databaseEnvironment,
  toolVersion,
  type BackupSecrets,
  type BackupTools,
} from "./pipeline";
import type { NeonRecoveryConfig } from "./neon";
import { redactSecrets } from "./redaction";

const execFileAsync = promisify(execFile);
const KEYCHAIN_HELPER_SOURCE = fileURLToPath(
  new URL("../../../scripts/keychain-secret.swift", import.meta.url),
);
const KEYCHAIN_HELPER_BINARY = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Planner Backup",
  "keychain-secret",
);

export const BACKUP_DATABASE_SERVICE = "planner-production-backup-database-url";
export const BACKUP_PASSPHRASE_SERVICE = "planner-production-backup-passphrase";
export const BACKUP_NEON_API_SERVICE = "planner-production-backup-neon-api";
export const DEFAULT_BACKUP_DESTINATION =
  "/Users/leeraulin/Library/CloudStorage/Dropbox/Planner Backups";
export const LAUNCH_AGENT_LABEL = "com.lraulin.planner-backup";

export interface MacBackupPaths {
  destination: string;
  launchAgent: string;
  logDirectory: string;
  standardLog: string;
  errorLog: string;
}

export function macBackupPaths(): MacBackupPaths {
  const home = os.homedir();
  const logDirectory = path.join(home, "Library", "Logs", "Planner");
  return {
    destination: DEFAULT_BACKUP_DESTINATION,
    launchAgent: path.join(
      home,
      "Library",
      "LaunchAgents",
      `${LAUNCH_AGENT_LABEL}.plist`,
    ),
    logDirectory,
    standardLog: path.join(logDirectory, "backup.log"),
    errorLog: path.join(logDirectory, "backup-error.log"),
  };
}

export async function resolveBackupTools(): Promise<BackupTools> {
  return {
    pgDump: await findExecutable([
      "/opt/homebrew/opt/postgresql@18/bin/pg_dump",
      "/usr/local/opt/postgresql@18/bin/pg_dump",
      "pg_dump",
    ]),
    pgRestore: await findExecutable([
      "/opt/homebrew/opt/postgresql@18/bin/pg_restore",
      "/usr/local/opt/postgresql@18/bin/pg_restore",
      "pg_restore",
    ]),
    psql: await findExecutable([
      "/opt/homebrew/opt/postgresql@18/bin/psql",
      "/usr/local/opt/postgresql@18/bin/psql",
      "psql",
    ]),
    gpg: await findExecutable(["/opt/homebrew/bin/gpg", "/usr/local/bin/gpg", "gpg"]),
    docker: await findExecutable([
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker",
      "docker",
    ]),
  };
}

export async function assertBackupTools(tools: BackupTools): Promise<void> {
  const [pgDump, pgRestore, psql] = await Promise.all([
    toolVersion(tools.pgDump),
    toolVersion(tools.pgRestore),
    toolVersion(tools.psql),
  ]);
  for (const version of [pgDump, pgRestore, psql]) {
    if (!/PostgreSQL\) 18\./u.test(version)) {
      throw new Error(`PostgreSQL 18 client tools are required; found ${version}.`);
    }
  }
  await toolVersion(tools.gpg);
}

export async function readBackupSecrets(): Promise<BackupSecrets> {
  const [databaseUrl, passphrase] = await Promise.all([
    readKeychainSecret(BACKUP_DATABASE_SERVICE),
    readKeychainSecret(BACKUP_PASSPHRASE_SERVICE),
  ]);
  return { databaseUrl, passphrase };
}

export async function readBackupPassphrase(): Promise<string> {
  return await readKeychainSecret(BACKUP_PASSPHRASE_SERVICE);
}

export async function readNeonRecoveryConfig(): Promise<NeonRecoveryConfig> {
  const value = await readKeychainSecret(BACKUP_NEON_API_SERVICE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Keychain item is invalid: ${BACKUP_NEON_API_SERVICE}.`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("apiKey" in parsed) ||
    !("projectId" in parsed) ||
    !("branchId" in parsed) ||
    typeof parsed.apiKey !== "string" ||
    typeof parsed.projectId !== "string" ||
    typeof parsed.branchId !== "string"
  ) {
    throw new Error(`Keychain item is invalid: ${BACKUP_NEON_API_SERVICE}.`);
  }
  return parsed as NeonRecoveryConfig;
}

export async function storeNeonRecoveryConfig(
  config: NeonRecoveryConfig,
): Promise<void> {
  await storeKeychainSecret(BACKUP_NEON_API_SERVICE, JSON.stringify(config));
}

export async function copyBackupPassphraseToClipboard(): Promise<void> {
  const passphrase = await readBackupPassphrase();
  const result = await spawnWithInput("/usr/bin/pbcopy", [], passphrase, {
    secrets: [passphrase],
  });
  if (result.code !== 0) throw new Error("Could not copy the recovery passphrase.");
}

export async function ensureBackupPassphrase(): Promise<"created" | "existing"> {
  if (await keychainHasSecret(BACKUP_PASSPHRASE_SERVICE)) return "existing";
  const passphrase = randomBytes(32).toString("base64url");
  await storeKeychainSecret(BACKUP_PASSPHRASE_SERVICE, passphrase);
  return "created";
}

export async function provisionNeonBackupRole(input: {
  adminDatabaseUrl: string;
  psql: string;
}): Promise<void> {
  assertDirectDatabaseUrl(input.adminDatabaseUrl);
  const rolePassword = randomBytes(32).toString("base64url");
  const sql = neonRoleSql(rolePassword);
  const result = await spawnWithInput(
    input.psql,
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1"],
    sql,
    {
      env: databaseEnvironment(input.adminDatabaseUrl),
      secrets: [input.adminDatabaseUrl, rolePassword],
    },
  );
  if (result.code !== 0) {
    throw new Error(
      `Could not provision the Neon backup role.${result.stderr ? `\n${result.stderr}` : ""}`,
    );
  }

  const backupUrl = new URL(input.adminDatabaseUrl);
  backupUrl.username = "planner_backup";
  backupUrl.password = rolePassword;
  await storeKeychainSecret(BACKUP_DATABASE_SERVICE, backupUrl.toString());
}

export async function installBackupLaunchAgent(input: {
  repoRoot: string;
  enable: boolean;
}): Promise<void> {
  const paths = macBackupPaths();
  const npm = await findExecutable([
    path.join(path.dirname(process.execPath), "npm"),
    "npm",
  ]);
  await mkdir(paths.destination, { recursive: true, mode: 0o700 });
  await mkdir(paths.logDirectory, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(paths.launchAgent), { recursive: true, mode: 0o700 });

  const plist = launchAgentPlist({ repoRoot: input.repoRoot, npm, paths });
  await atomicWrite(paths.launchAgent, plist, 0o644);
  if (!input.enable) return;

  await readBackupSecrets();
  const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
  await execFileAsync("/bin/launchctl", ["bootout", domain, paths.launchAgent]).catch(
    () => undefined,
  );
  await execFileAsync("/bin/launchctl", ["bootstrap", domain, paths.launchAgent]);
}

export async function uninstallBackupLaunchAgent(): Promise<boolean> {
  const paths = macBackupPaths();
  const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
  await execFileAsync("/bin/launchctl", ["bootout", domain, paths.launchAgent]).catch(
    () => undefined,
  );
  try {
    await unlink(paths.launchAgent);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

export async function launchAgentIsLoaded(): Promise<boolean> {
  const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
  try {
    await execFileAsync("/bin/launchctl", ["print", `${domain}/${LAUNCH_AGENT_LABEL}`]);
    return true;
  } catch {
    return false;
  }
}

export async function notifyBackupProblem(
  title: string,
  message: string,
): Promise<void> {
  const safeTitle = title.replaceAll('"', "'");
  const safeMessage = message.replaceAll('"', "'");
  await execFileAsync("/usr/bin/osascript", [
    "-e",
    `display notification "${safeMessage}" with title "${safeTitle}"`,
  ]).catch(() => undefined);
}

async function readKeychainSecret(service: string): Promise<string> {
  const account = os.userInfo().username;
  const helper = await keychainHelperExecutable();
  const result = await spawnWithOutput(helper, ["read", service, account]);
  const secret = result.stdout.toString("utf8");
  if (result.code !== 0 || !secret) {
    throw new Error(`Required Keychain item is unavailable: ${service}.`);
  }
  return secret;
}

async function keychainHasSecret(service: string): Promise<boolean> {
  try {
    await readKeychainSecret(service);
    return true;
  } catch {
    return false;
  }
}

async function storeKeychainSecret(service: string, secret: string): Promise<void> {
  const account = os.userInfo().username;
  const helper = await keychainHelperExecutable();
  const result = await spawnWithInput(helper, ["write", service, account], secret, {
    secrets: [secret],
  });
  if (result.code !== 0) {
    throw new Error(
      `Could not store Keychain item ${service}.${result.stderr ? `\n${result.stderr}` : ""}`,
    );
  }
}

async function keychainHelperExecutable(): Promise<string> {
  try {
    const metadata = await stat(KEYCHAIN_HELPER_BINARY);
    if (metadata.isFile()) return KEYCHAIN_HELPER_BINARY;
  } catch {
    // Compile the repository source below.
  }
  await mkdir(path.dirname(KEYCHAIN_HELPER_BINARY), { recursive: true, mode: 0o700 });
  await execFileAsync("/usr/bin/xcrun", [
    "swiftc",
    KEYCHAIN_HELPER_SOURCE,
    "-o",
    KEYCHAIN_HELPER_BINARY,
  ]);
  return KEYCHAIN_HELPER_BINARY;
}

async function spawnWithOutput(
  executable: string,
  args: string[],
): Promise<{ code: number; stdout: Buffer }> {
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "ignore"] });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 1, stdout: Buffer.concat(chunks) });
    });
  });
}

function neonRoleSql(rolePassword: string): string {
  return `\\set QUIET 1
DO $role$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'planner_backup') THEN
    EXECUTE format('ALTER ROLE planner_backup WITH LOGIN PASSWORD %L', '${rolePassword}');
  ELSE
    EXECUTE format('CREATE ROLE planner_backup LOGIN PASSWORD %L', '${rolePassword}');
  END IF;
END
$role$;
ALTER ROLE planner_backup SET default_transaction_read_only = on;
SELECT format('GRANT CONNECT ON DATABASE %I TO planner_backup', current_database()) \\gexec
SELECT format('GRANT USAGE ON SCHEMA %I TO planner_backup', nspname)
FROM pg_namespace WHERE nspname IN ('public', 'drizzle') \\gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO planner_backup', nspname)
FROM pg_namespace WHERE nspname IN ('public', 'drizzle') \\gexec
SELECT format('GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA %I TO planner_backup', nspname)
FROM pg_namespace WHERE nspname IN ('public', 'drizzle') \\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON TABLES TO planner_backup',
  current_user,
  nspname
) FROM pg_namespace WHERE nspname IN ('public', 'drizzle') \\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, USAGE ON SEQUENCES TO planner_backup',
  current_user,
  nspname
) FROM pg_namespace WHERE nspname IN ('public', 'drizzle') \\gexec
`;
}

function launchAgentPlist(input: {
  repoRoot: string;
  npm: string;
  paths: MacBackupPaths;
}): string {
  const pathValue = [
    path.dirname(process.execPath),
    "/opt/homebrew/opt/postgresql@18/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(input.npm)}</string>
    <string>run</string>
    <string>backup:run</string>
    <string>--</string>
    <string>--scheduled</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(input.repoRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xmlEscape(pathValue)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>21600</integer>
  <key>ProcessType</key><string>Background</string>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xmlEscape(input.paths.standardLog)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(input.paths.errorLog)}</string>
</dict>
</plist>
`;
}

async function findExecutable(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
    const resolved = await executableOnPath(candidate);
    if (resolved) return resolved;
  }
  throw new Error(`Required executable not found: ${candidates.at(-1) ?? "unknown"}.`);
}

async function executableOnPath(name: string): Promise<string | null> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

async function atomicWrite(
  filePath: string,
  contents: string,
  mode: number,
): Promise<void> {
  const partialPath = `${filePath}.${randomUUID()}.partial`;
  await writeFile(partialPath, contents, { encoding: "utf8", mode });
  await rename(partialPath, filePath);
}

async function spawnWithInput(
  executable: string,
  args: string[],
  input: string,
  options: { env?: NodeJS.ProcessEnv; secrets: string[] },
): Promise<{ code: number; stderr: string }> {
  const child = spawn(executable, args, {
    env: options.env,
    stdio: ["pipe", "ignore", "pipe"],
  });
  child.stdin.end(input);
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (stderr.length < 64 * 1_024)
      stderr += chunk.slice(0, 64 * 1_024 - stderr.length);
  });
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code: code ?? 1,
        stderr: redactSecrets(stderr.trim(), options.secrets),
      });
    });
  });
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
