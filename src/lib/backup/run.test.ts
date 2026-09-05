import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { BackupTools } from "./pipeline";
import { runBackup } from "./run";

const temporaryDirectories: string[] = [];
const databaseUrl =
  "postgresql://planner_backup:database-secret@example.test/planner?sslmode=require";
const passphrase = "encryption-secret";

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("backup orchestration", () => {
  it("publishes only an encrypted verified archive through atomic finalization", async () => {
    const fixture = await backupFixture();
    const unrelated = path.join(fixture.destination, "family-photo.jpg");
    const malformed = path.join(
      fixture.destination,
      "planner-production_2026-99-99T99-99-99Z.dump.gpg",
    );
    await writeFile(unrelated, "unrelated");
    await writeFile(malformed, "malformed");
    await writeFile(
      path.join(
        fixture.destination,
        "planner-production_2026-09-01T12-00-00Z.dump.gpg.partial",
      ),
      "abandoned partial",
    );

    const result = await runBackup({
      destination: fixture.destination,
      now: new Date("2026-09-05T12:00:00.789Z"),
      force: true,
      tools: fixture.tools,
      loadSecrets,
    });

    expect(result.kind).toBe("created");
    const names = await readdir(fixture.destination);
    expect(names.some((name) => name.endsWith(".partial"))).toBe(false);
    expect(names).toContain("family-photo.jpg");
    expect(names).toContain(path.basename(malformed));
    expect(names.filter((name) => name.endsWith(".dump"))).toEqual([]);

    const archiveName = result.fileName;
    expect(archiveName).toBeTruthy();
    const archive = await readFile(
      path.join(fixture.destination, archiveName ?? ""),
      "utf8",
    );
    expect(archive).toBe("ENCRYPTED\nCUSTOM_DUMP");
    expect(archive).not.toContain("database-secret");
    expect(archive).not.toContain(passphrase);
  });

  it("does not prune an existing generation when the new dump fails", async () => {
    const fixture = await backupFixture();
    const old = await runBackup({
      destination: fixture.destination,
      now: new Date("2025-01-01T12:00:00Z"),
      force: true,
      tools: fixture.tools,
      loadSecrets,
    });
    const failingTools = {
      ...fixture.tools,
      pgDump: await writeStub(fixture.root, "pg-dump-fail", PG_DUMP_FAIL),
    };

    await expect(
      runBackup({
        destination: fixture.destination,
        now: new Date("2026-09-05T12:00:00Z"),
        force: true,
        tools: failingTools,
        loadSecrets,
      }),
    ).rejects.toThrow("Encrypted dump pipeline failed");
    expect(
      await readFile(path.join(fixture.destination, old.fileName ?? ""), "utf8"),
    ).toContain("ENCRYPTED");
  });

  it("removes the partial archive and publishes nothing after encryption failure", async () => {
    const fixture = await backupFixture();
    const failingTools = {
      ...fixture.tools,
      gpg: await writeStub(fixture.root, "gpg-fail-encrypt", GPG_FAIL_ENCRYPT),
    };

    let message = "";
    try {
      await runBackup({
        destination: fixture.destination,
        now: new Date("2026-09-05T12:00:00Z"),
        force: true,
        tools: failingTools,
        loadSecrets,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("Encrypted dump pipeline failed");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain(passphrase);
    expect(await readdir(fixture.destination)).toEqual([]);
  });

  it("keeps the final name unavailable when verification fails", async () => {
    const fixture = await backupFixture();
    const failingTools = {
      ...fixture.tools,
      pgRestore: await writeStub(fixture.root, "pg-restore-fail", PG_RESTORE_FAIL),
    };

    await expect(
      runBackup({
        destination: fixture.destination,
        now: new Date("2026-09-05T12:00:00Z"),
        force: true,
        tools: failingTools,
        loadSecrets,
      }),
    ).rejects.toThrow("Encrypted archive pipeline failed");
    expect(await readdir(fixture.destination)).toEqual([]);
  });

  it("redacts database and encryption secrets from a non-zero process error", async () => {
    const fixture = await backupFixture();
    const failingTools = {
      ...fixture.tools,
      pgDump: await writeStub(fixture.root, "pg-dump-secret-fail", PG_DUMP_SECRET_FAIL),
    };

    let message = "";
    try {
      await runBackup({
        destination: fixture.destination,
        now: new Date("2026-09-05T12:00:00Z"),
        force: true,
        tools: failingTools,
        loadSecrets,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("database-secret");
    expect(message).not.toContain(passphrase);
  });

  it("fails closed when Dropbox is unavailable", async () => {
    const fixture = await backupFixture();
    await rm(fixture.destination, { recursive: true });

    await expect(
      runBackup({
        destination: fixture.destination,
        now: new Date("2026-09-05T12:00:00Z"),
        force: true,
        tools: fixture.tools,
        loadSecrets,
      }),
    ).rejects.toThrow();
  });

  it("prunes an expired verified generation only after a new success", async () => {
    const fixture = await backupFixture();
    const old = await runBackup({
      destination: fixture.destination,
      now: new Date("2025-01-01T12:00:00Z"),
      force: true,
      tools: fixture.tools,
      loadSecrets,
    });

    const current = await runBackup({
      destination: fixture.destination,
      now: new Date("2026-09-05T12:00:00Z"),
      force: true,
      tools: fixture.tools,
      loadSecrets,
    });

    const names = await readdir(fixture.destination);
    expect(names).not.toContain(old.fileName);
    expect(names).toContain(current.fileName);
    expect(current.pruned).toEqual([old.fileName]);
  });
});

function loadSecrets(): Promise<{ databaseUrl: string; passphrase: string }> {
  return Promise.resolve({ databaseUrl, passphrase });
}

async function backupFixture(): Promise<{
  root: string;
  destination: string;
  tools: BackupTools;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "planner-backup-run-"));
  temporaryDirectories.push(root);
  const destination = path.join(root, "dropbox");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(destination);
  return {
    root,
    destination,
    tools: {
      pgDump: await writeStub(root, "pg-dump", PG_DUMP),
      pgRestore: await writeStub(root, "pg-restore", PG_RESTORE),
      psql: "/usr/bin/true",
      gpg: await writeStub(root, "gpg", GPG),
      docker: "/usr/bin/true",
    },
  };
}

async function writeStub(
  root: string,
  name: string,
  contents: string,
): Promise<string> {
  const filePath = path.join(root, name);
  await writeFile(filePath, contents, { mode: 0o700 });
  await chmod(filePath, 0o700);
  return filePath;
}

const PG_DUMP = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('pg_dump (PostgreSQL) 18.6');
  process.exit(0);
}
if (process.argv.join(' ').includes(process.env.PGPASSWORD || 'never')) process.exit(91);
process.stdout.write('CUSTOM_DUMP');
`;

const PG_DUMP_FAIL = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('pg_dump (PostgreSQL) 18.6');
  process.exit(0);
}
console.error('dump failed');
process.exit(7);
`;

const PG_DUMP_SECRET_FAIL = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('pg_dump (PostgreSQL) 18.6');
  process.exit(0);
}
console.error('dump failed for password=' + process.env.PGPASSWORD);
process.exit(8);
`;

const PG_RESTORE = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('pg_restore (PostgreSQL) 18.6');
  process.exit(0);
}
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  if (Buffer.concat(chunks).toString() !== 'CUSTOM_DUMP') process.exit(12);
  process.stdout.write('TABLE public nodes\\n');
});
`;

const PG_RESTORE_FAIL = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('pg_restore (PostgreSQL) 18.6');
  process.exit(0);
}
process.stdin.resume();
process.stdin.on('end', () => process.exit(13));
`;

const GPG = `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) {
  console.log('gpg (GnuPG) 2.5.22');
  process.exit(0);
}
const passphrase = fs.readFileSync(3, 'utf8').trim();
if (!passphrase) process.exit(20);
if (process.argv.includes('--symmetric')) {
  const output = process.argv[process.argv.indexOf('--output') + 1];
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => fs.writeFileSync(output, Buffer.concat([Buffer.from('ENCRYPTED\\n'), ...chunks])));
} else {
  const archive = process.argv.at(-1);
  const contents = fs.readFileSync(archive);
  process.stdout.write(contents.subarray('ENCRYPTED\\n'.length));
}
`;

const GPG_FAIL_ENCRYPT = `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) {
  console.log('gpg (GnuPG) 2.5.22');
  process.exit(0);
}
const passphrase = fs.readFileSync(3, 'utf8').trim();
console.error('encryption failed for ' + passphrase);
process.exit(21);
`;
