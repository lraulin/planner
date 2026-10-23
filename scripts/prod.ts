/**
 * Agent-usable production access (`docs/production-access.md`). Secrets come from Keychain and
 * never reach an argument, the environment of this process, or the output.
 *
 *   npx tsx scripts/prod.ts read "select ..."                 # read-only role and transaction
 *   npx tsx scripts/prod.ts branch scripts/<name>.ts [args]   # against a fresh copy of production
 *   npx tsx scripts/prod.ts apply scripts/<name>.ts [args]    # against production, after a snapshot
 *   pbpaste | npx tsx scripts/prod.ts setup                   # store the owner URL for apply
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";
import { describeDatabaseUrl } from "../src/lib/db/target";
import {
  readNeonRecoveryConfig,
  readProductionOwnerUrl,
  readProductionReadOnlyUrl,
  storeProductionOwnerUrl,
} from "../src/lib/backup/macos";
import {
  createAgentBranch,
  createPreApplySnapshot,
  deleteAgentBranch,
  sweepStaleAgentBranches,
} from "../src/lib/backup/neon";
import {
  formatRows,
  scriptInvocation,
  tsxArguments,
} from "../src/lib/backup/productionAccess";
import { redactSecrets } from "../src/lib/backup/redaction";

/**
 * Every value as Postgres prints it — numerics, dates and timestamps stay exact text. A stored
 * `sslmode=require` is spelled out as the `verify-full` pg already treats it as, which keeps
 * pg's deprecation warning out of every result.
 */
function client(connectionString: string): pg.Client {
  const url = new URL(connectionString);
  if (
    ["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")
  ) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return new pg.Client({
    connectionString: url.toString(),
    types: { getTypeParser: () => (value: string) => value },
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

async function read(sqlArgument: string | undefined): Promise<number> {
  const sql = (sqlArgument ?? (await readStdin())).trim();
  if (!sql) {
    console.error(
      'Usage: npx tsx scripts/prod.ts read "select ..."   (or SQL on stdin)',
    );
    return 2;
  }
  const url = await readProductionReadOnlyUrl();
  console.error(`Production, read-only: ${describeDatabaseUrl(url)}`);
  const db = client(url);
  await db.connect();
  try {
    await db.query("begin transaction read only");
    const results = await db.query<Record<string, unknown>>(sql);
    for (const result of Array.isArray(results) ? results : [results]) {
      const typed = result as pg.QueryResult<Record<string, unknown>>;
      if (typed.fields.length === 0) continue;
      console.log(
        formatRows(
          typed.fields.map((field) => field.name),
          typed.rows,
        ),
      );
      console.log(`(${typed.rowCount ?? typed.rows.length} rows)`);
    }
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
  return 0;
}

function runScript(args: readonly string[], databaseUrl: string): Promise<number> {
  const invocation = scriptInvocation(args);
  return new Promise((resolve, reject) => {
    const child = spawn("npx", tsxArguments(invocation, existsSync(".env.local")), {
      stdio: "inherit",
      // Exported DATABASE_URL wins over the one `--env-file` would load.
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function branch(args: readonly string[]): Promise<number> {
  scriptInvocation(args);
  const config = await readNeonRecoveryConfig();
  const swept = await sweepStaleAgentBranches(config);
  if (swept > 0)
    console.error(`Deleted ${swept} agent branch(es) a past run left behind.`);
  const copy = await createAgentBranch(config);
  console.error(
    `Branch ${copy.name}: a copy of production as of now. Writes here never reach production.`,
  );
  // Ctrl-C reaches the script too; staying alive until it exits is what lets the branch go.
  process.once("SIGINT", () => undefined);
  try {
    return await runScript(args, copy.databaseUrl);
  } finally {
    await deleteAgentBranch(config, copy.branchId).then(
      () => console.error(`Deleted branch ${copy.name}.`),
      () =>
        console.error(
          `Could not delete branch ${copy.name}; the next branch run deletes it after an hour.`,
        ),
    );
  }
}

async function apply(args: readonly string[]): Promise<number> {
  scriptInvocation(args);
  const [url, config] = await Promise.all([
    readProductionOwnerUrl(),
    readNeonRecoveryConfig(),
  ]);
  const snapshot = await createPreApplySnapshot(config);
  console.error(
    `Neon snapshot ${snapshot} taken (kept 30 days). Restore from it if this goes wrong.`,
  );
  console.error(`Production, owner: ${describeDatabaseUrl(url)}`);
  return await runScript(args, url);
}

async function setup(): Promise<number> {
  const url = (await readStdin()).trim();
  if (!/^postgres(?:ql)?:\/\//u.test(url)) {
    console.error(
      "Pipe the Neon owner URL on stdin: pbpaste | npx tsx scripts/prod.ts setup",
    );
    return 2;
  }
  const db = client(url);
  await db.connect();
  try {
    const { rows } = await db.query<{ role: string; canWrite: string }>(
      "select current_user as role, has_table_privilege(current_user, 'finance_accounts', 'UPDATE')::text as \"canWrite\"",
    );
    if (rows[0]?.canWrite !== "true") {
      console.error(
        `${rows[0]?.role ?? "That role"} cannot write finance_accounts; apply needs the owner URL.`,
      );
      return 2;
    }
    await storeProductionOwnerUrl(url);
    console.log(
      `Stored the owner URL for ${rows[0].role} at ${describeDatabaseUrl(url)} in Keychain. Clear the clipboard: printf '' | pbcopy`,
    );
  } finally {
    await db.end();
  }
  return 0;
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "read":
      return await read(args.join(" ") || undefined);
    case "branch":
      return await branch(args);
    case "apply":
      return await apply(args);
    case "setup":
      return await setup();
    default:
      console.error("Usage: tsx scripts/prod.ts read|branch|apply|setup ...");
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(redactSecrets(message, []));
    process.exit(1);
  },
);
