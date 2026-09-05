import { execFile, spawn, type ChildProcess } from "node:child_process";
import { Writable } from "node:stream";
import { promisify } from "node:util";

import { redactSecrets } from "./redaction";

const execFileAsync = promisify(execFile);
const MAX_ERROR_BYTES = 64 * 1_024;

export interface BackupTools {
  pgDump: string;
  pgRestore: string;
  psql: string;
  gpg: string;
  docker: string;
}

export interface BackupSecrets {
  databaseUrl: string;
  passphrase: string;
}

interface ProcessResult {
  code: number;
  stderr: string;
}

export async function dumpEncryptedArchive(input: {
  destinationPath: string;
  databaseUrl: string;
  passphrase: string;
  tools: BackupTools;
}): Promise<void> {
  const secretValues = [
    input.databaseUrl,
    input.passphrase,
    databasePassword(input.databaseUrl),
  ];
  const pgDump = spawn(input.tools.pgDump, ["-Fc", "--no-owner", "--no-privileges"], {
    env: databaseEnvironment(input.databaseUrl),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const gpg = spawn(
    input.tools.gpg,
    [
      "--batch",
      "--yes",
      "--no-tty",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "3",
      "--symmetric",
      "--cipher-algo",
      "AES256",
      "--output",
      input.destinationPath,
    ],
    { stdio: ["pipe", "ignore", "pipe", "pipe"] },
  );

  if (!pgDump.stdout || !gpg.stdin)
    throw new Error("Could not open the backup pipeline.");
  writeSecretFd(gpg, input.passphrase);
  ignorePipeError(gpg.stdin);
  pgDump.stdout.pipe(gpg.stdin);
  gpg.once("close", (code) => {
    if (code !== 0 && pgDump.exitCode === null) pgDump.kill("SIGTERM");
  });

  const [dumpResult, gpgResult] = await Promise.all([
    waitForProcess(pgDump),
    waitForProcess(gpg),
  ]);
  if (dumpResult.code !== 0 || gpgResult.code !== 0) {
    const detail = redactSecrets(
      [dumpResult.stderr, gpgResult.stderr].filter(Boolean).join("\n"),
      secretValues,
    );
    throw new Error(
      `Encrypted dump pipeline failed (pg_dump ${dumpResult.code}, gpg ${gpgResult.code}).${detail ? `\n${detail}` : ""}`,
    );
  }
}

export async function verifyEncryptedArchive(input: {
  archivePath: string;
  passphrase: string;
  tools: BackupTools;
}): Promise<void> {
  await decryptToCommand({
    archivePath: input.archivePath,
    passphrase: input.passphrase,
    gpg: input.tools.gpg,
    command: input.tools.pgRestore,
    args: ["--list"],
    label: "pg_restore --list",
  });
}

export async function decryptToCommand(input: {
  archivePath: string;
  passphrase: string;
  gpg: string;
  command: string;
  args: string[];
  label: string;
}): Promise<void> {
  const gpg = spawn(
    input.gpg,
    [
      "--batch",
      "--yes",
      "--no-tty",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "3",
      "--decrypt",
      input.archivePath,
    ],
    { stdio: ["ignore", "pipe", "pipe", "pipe"] },
  );
  const consumer = spawn(input.command, input.args, {
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (!gpg.stdout || !consumer.stdin)
    throw new Error("Could not open the restore pipeline.");
  writeSecretFd(gpg, input.passphrase);
  ignorePipeError(consumer.stdin);
  gpg.stdout.pipe(consumer.stdin);
  consumer.once("close", (code) => {
    if (code !== 0 && gpg.exitCode === null) {
      gpg.kill("SIGTERM");
    } else {
      // pg_restore --list can finish after reading the TOC. Drain the authenticated GPG
      // stream so GPG reaches and verifies the archive trailer instead of stalling here.
      gpg.stdout?.resume();
    }
  });

  const [gpgResult, consumerResult] = await Promise.all([
    waitForProcess(gpg),
    waitForProcess(consumer),
  ]);
  if (gpgResult.code !== 0 || consumerResult.code !== 0) {
    const detail = redactSecrets(
      [gpgResult.stderr, consumerResult.stderr].filter(Boolean).join("\n"),
      [input.passphrase],
    );
    throw new Error(
      `Encrypted archive pipeline failed (gpg ${gpgResult.code}, ${input.label} ${consumerResult.code}).${detail ? `\n${detail}` : ""}`,
    );
  }
}

export async function toolVersion(executable: string): Promise<string> {
  const { stdout } = await execFileAsync(executable, ["--version"], {
    encoding: "utf8",
  });
  return stdout.trim().split("\n", 1)[0] ?? "unknown";
}

export function databaseEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const url = parseDatabaseUrl(databaseUrl);
  const environment: NodeJS.ProcessEnv = { ...process.env };
  delete environment.DATABASE_URL;
  delete environment.DIRECT_DATABASE_URL;

  environment.PGHOST = url.hostname;
  environment.PGPORT = url.port || "5432";
  environment.PGUSER = decodeURIComponent(url.username);
  environment.PGPASSWORD = decodeURIComponent(url.password);
  environment.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  environment.PGSSLMODE = url.searchParams.get("sslmode") ?? "require";
  environment.PGCHANNELBINDING = url.searchParams.get("channel_binding") ?? "prefer";
  environment.PGCONNECT_TIMEOUT = url.searchParams.get("connect_timeout") ?? "20";
  environment.PGAPPNAME = "planner-production-backup";
  return environment;
}

export function assertDirectDatabaseUrl(databaseUrl: string): void {
  const url = parseDatabaseUrl(databaseUrl);
  if (url.hostname.includes("-pooler.")) {
    throw new Error(
      "Backup database URL must use the direct Neon endpoint, not the pooler.",
    );
  }
}

function parseDatabaseUrl(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Backup database URL is not a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Backup database URL is not a PostgreSQL URL.");
  }
  if (!url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("Backup database URL is missing a host, user, or database.");
  }
  return url;
}

function databasePassword(databaseUrl: string): string {
  try {
    return decodeURIComponent(new URL(databaseUrl).password);
  } catch {
    return "";
  }
}

function writeSecretFd(process: ChildProcess, secret: string): void {
  const descriptor = process.stdio[3];
  if (!(descriptor instanceof Writable)) {
    process.kill("SIGTERM");
    throw new Error("Could not open the secret input descriptor.");
  }
  ignorePipeError(descriptor);
  descriptor.end(`${secret}\n`);
}

function ignorePipeError(stream: Writable): void {
  // The paired process exit and captured stderr carry the actionable failure. Without this
  // listener, an early consumer exit surfaces first as an unhandled EPIPE and skips cleanup.
  stream.on("error", () => undefined);
}

function waitForProcess(process: ChildProcess): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    process.stderr?.setEncoding("utf8");
    process.stderr?.on("data", (chunk: string) => {
      if (stderr.length < MAX_ERROR_BYTES)
        stderr += chunk.slice(0, MAX_ERROR_BYTES - stderr.length);
    });
    process.once("error", reject);
    process.once("close", (code) =>
      resolve({ code: code ?? 1, stderr: stderr.trim() }),
    );
  });
}
