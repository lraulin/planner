import path from "node:path";

import { backupAgeHours, backupFreshness } from "../src/lib/backup/freshness";
import {
  discoverVerifiedGenerations,
  readSelectedGeneration,
} from "../src/lib/backup/generations";
import {
  BACKUP_NEON_API_SERVICE,
  assertBackupTools,
  copyBackupPassphraseToClipboard,
  ensureBackupPassphrase,
  installBackupLaunchAgent,
  launchAgentIsLoaded,
  macBackupPaths,
  notifyBackupProblem,
  provisionNeonBackupRole,
  readBackupPassphrase,
  readBackupSecrets,
  readNeonRecoveryConfig,
  resolveBackupTools,
  storeNeonRecoveryConfig,
  uninstallBackupLaunchAgent,
} from "../src/lib/backup/macos";
import {
  configureNeonRecovery,
  ensureWeeklyNeonSnapshot,
  neonRecoveryStatus,
} from "../src/lib/backup/neon";
import { redactSecrets } from "../src/lib/backup/redaction";
import { restoreTest } from "../src/lib/backup/restore";
import { retentionDryRun, runBackup } from "../src/lib/backup/run";

async function main(): Promise<number> {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  switch (command) {
    case "setup":
      return await setup(args);
    case "run":
      return await backupRun(args);
    case "status":
      return await status();
    case "restore-test":
      return await testRestore(args);
    case "uninstall":
      return await uninstall();
    default:
      console.error(
        "Usage: tsx scripts/backup.ts setup|run|status|restore-test|uninstall",
      );
      return 2;
  }
}

async function setup(args: string[]): Promise<number> {
  const allowed = new Set([
    "--provision-neon-role",
    "--configure-neon-api",
    "--copy-recovery-passphrase",
    "--recovery-copy-confirmed",
  ]);
  rejectUnknownArgs(args, allowed);
  if (args.includes("--provision-neon-role") && args.includes("--configure-neon-api")) {
    throw new Error(
      "Provision the database role and configure the Neon API in separate commands.",
    );
  }
  const tools = await resolveBackupTools();
  await assertBackupTools(tools);

  if (args.includes("--copy-recovery-passphrase")) {
    if (args.length !== 1) {
      throw new Error("Copy the recovery passphrase in a separate setup command.");
    }
    await copyBackupPassphraseToClipboard();
    console.log(
      "Copied the recovery passphrase to the clipboard without displaying it.",
    );
    return 0;
  }

  if (args.includes("--provision-neon-role")) {
    const adminDatabaseUrl = (await readStdin()).trim();
    if (!adminDatabaseUrl) {
      throw new Error(
        "The direct Neon owner URL must arrive on stdin; do not put it in an argument.",
      );
    }
    await provisionNeonBackupRole({ adminDatabaseUrl, psql: tools.psql });
    console.log(
      "Provisioned or rotated the read-only Neon backup role and stored its URL in Keychain.",
    );
  }

  if (args.includes("--configure-neon-api")) {
    const apiKey = (await readStdin()).trim();
    if (!apiKey) {
      throw new Error(
        "The Neon API key must arrive on stdin; do not put it in an argument.",
      );
    }
    const config = await configureNeonRecovery(apiKey);
    await storeNeonRecoveryConfig(config);
    console.log(
      "Set Neon point-in-time history to seven days and stored its recovery API configuration in Keychain.",
    );
  }

  const passphraseState = await ensureBackupPassphrase();
  const wantsEnable = args.includes("--recovery-copy-confirmed");
  if (passphraseState === "created" && wantsEnable) {
    await installBackupLaunchAgent({ repoRoot: process.cwd(), enable: false });
    throw new Error(
      "A new recovery passphrase was created in Keychain. Save it in 1Password before enabling the schedule.",
    );
  }

  if (wantsEnable) {
    await Promise.all([readBackupSecrets(), readNeonRecoveryConfig()]);
  }

  await installBackupLaunchAgent({ repoRoot: process.cwd(), enable: wantsEnable });
  const paths = macBackupPaths();
  console.log(`Backup destination: ${paths.destination}`);
  console.log(`LaunchAgent file: ${paths.launchAgent}`);
  if (wantsEnable) {
    console.log("LaunchAgent enabled: at login and every six hours.");
  } else {
    console.log(
      "LaunchAgent installed but disabled pending the 1Password recovery-copy checkpoint.",
    );
    console.log(
      "Copy without displaying: npm run backup:setup -- --copy-recovery-passphrase",
    );
    console.log(
      `Neon API configuration belongs under Keychain service ${BACKUP_NEON_API_SERVICE}.`,
    );
    console.log(
      "After saving it in 1Password, clear the clipboard and rerun with --recovery-copy-confirmed.",
    );
  }
  return 0;
}

async function backupRun(args: string[]): Promise<number> {
  const allowed = new Set(["--force", "--scheduled", "--retention-dry-run"]);
  rejectUnknownArgs(args, allowed);
  const destination = macBackupPaths().destination;

  if (args.includes("--retention-dry-run")) {
    const plan = await retentionDryRun({ destination });
    console.log(
      `Retention dry run: keep ${plan.keep.length}, prune ${plan.prune.length}.`,
    );
    for (const generation of plan.prune)
      console.log(`Would prune ${generation.fileName}`);
    return 0;
  }

  const tools = await resolveBackupTools();
  const [backupResult, snapshotResult] = await Promise.allSettled([
    runBackup({
      destination,
      force: args.includes("--force"),
      tools,
      loadSecrets: readBackupSecrets,
      logger: console,
    }),
    readNeonRecoveryConfig().then(ensureWeeklyNeonSnapshot),
  ]);
  if (backupResult.status === "fulfilled" && backupResult.value.kind === "skipped") {
    console.log(
      `[${new Date().toISOString()}] Backup skipped: newest verified generation is under 20 hours old.`,
    );
  } else if (backupResult.status === "fulfilled") {
    console.log(
      `[${new Date().toISOString()}] Created ${backupResult.value.fileName} (${formatBytes(backupResult.value.encryptedBytes ?? 0)}) in ${formatDuration(backupResult.value.durationMs ?? 0)}.`,
    );
  }
  if (snapshotResult.status === "fulfilled") {
    console.log(`Neon weekly snapshot: ${snapshotResult.value}.`);
  }
  const failures = [backupResult, snapshotResult].filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    throw new Error(
      failures
        .map((failure) =>
          failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason),
        )
        .join("\n"),
    );
  }
  return 0;
}

async function status(): Promise<number> {
  const paths = macBackupPaths();
  const generations = await discoverVerifiedGenerations(paths.destination);
  const latest = generations[0] ?? null;
  const now = new Date();
  const freshness = backupFreshness(latest?.createdAt ?? null, now);
  const [loaded, neon] = await Promise.all([
    launchAgentIsLoaded(),
    readNeonRecoveryConfig().then(neonRecoveryStatus),
  ]);

  console.log(`LaunchAgent: ${loaded ? "loaded" : "not loaded"}`);
  console.log(`Verified generations: ${generations.length}`);
  console.log(`Neon PITR: ${(neon.historyRetentionSeconds / 86_400).toFixed(0)} days`);
  console.log(
    `Neon weekly snapshots: ${neon.weeklySnapshots}${neon.newestWeeklySnapshotAt ? ` (newest ${neon.newestWeeklySnapshotAt})` : ""}`,
  );
  if (!latest) {
    console.error("Status: stale — no verified backup generation exists.");
    return 1;
  }
  console.log(`Latest: ${latest.fileName}`);
  console.log(`Age: ${backupAgeHours(latest.createdAt, now).toFixed(1)} hours`);
  console.log(`Status: ${freshness}`);
  return freshness === "stale" ? 1 : 0;
}

async function testRestore(args: string[]): Promise<number> {
  rejectUnknownArgsWithValue(args, "--file");
  const paths = macBackupPaths();
  const selected = argValue(args, "--file");
  const generation = selected
    ? await readSelectedGeneration(path.resolve(selected))
    : (await discoverVerifiedGenerations(paths.destination))[0];
  if (!generation)
    throw new Error("No verified backup generation is available to restore.");

  const [passphrase, tools] = await Promise.all([
    readBackupPassphrase(),
    resolveBackupTools(),
  ]);
  const result = await restoreTest({ generation, passphrase, tools });
  console.log(
    `Restored ${generation.fileName} into PostgreSQL ${result.serverVersion} in ${formatDuration(result.durationMs)}.`,
  );
  console.log(`Verified row counts: ${JSON.stringify(result.counts)}`);
  console.log("Disposable restore container removed; encrypted backup preserved.");
  return 0;
}

async function uninstall(): Promise<number> {
  const removed = await uninstallBackupLaunchAgent();
  console.log(
    removed ? "LaunchAgent unloaded and removed." : "LaunchAgent was not installed.",
  );
  console.log("Encrypted backups and Keychain recovery material were preserved.");
  return 0;
}

function rejectUnknownArgs(args: string[], allowed: Set<string>): void {
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) throw new Error(`Unknown option: ${unknown}`);
}

function rejectUnknownArgsWithValue(args: string[], valueFlag: string): void {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== valueFlag) throw new Error(`Unknown option: ${args[index]}`);
    if (!args[index + 1]) throw new Error(`${valueFlag} requires a path.`);
    index += 1;
  }
}

function argValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index === -1 ? null : (args[index + 1] ?? null);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1_024 * 1_024)).toFixed(2)} MiB`;
}

function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

main().then(
  (code) => process.exit(code),
  async (error: unknown) => {
    const message = redactSecrets(
      error instanceof Error ? error.message : String(error),
      [],
    );
    console.error(message);
    if (process.argv.includes("--scheduled")) {
      let title = "Planner backup failed";
      try {
        const latest = (
          await discoverVerifiedGenerations(macBackupPaths().destination)
        )[0];
        if (backupFreshness(latest?.createdAt ?? null, new Date()) === "stale") {
          title = "Planner backup is stale";
        }
      } catch {
        // The failure notification already says the backup destination could not be read.
      }
      await notifyBackupProblem(title, message.slice(0, 180));
    }
    process.exit(1);
  },
);
