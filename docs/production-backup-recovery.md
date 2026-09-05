# Production Backup and Recovery

Planner has two independent database recovery layers:

- **Neon:** seven days of point-in-time history and one 90-day snapshot per UTC week.
- **Dropbox:** daily GPG-encrypted PostgreSQL custom archives that do not need Neon to
  restore.

The Dropbox job runs from Lee's Mac at login and every six hours. It does nothing while the
newest verified archive is under 20 hours old, retries once the archive is due, and reports
stale at 30 hours. The target RPO is about 24 hours; the restore drill must stay below one
hour.

## Initial setup

Prerequisites are PostgreSQL 18 client tools, GPG, Docker, Dropbox desktop, and a signed-in
Neon account. The default archive folder is:

```text
/Users/leeraulin/Library/CloudStorage/Dropbox/Planner Backups
```

Run the preflight once. It creates the folder, a 256-bit recovery passphrase in Keychain,
and an unloaded LaunchAgent:

```sh
npm run backup:setup
```

### Provision the read-only database role

Copy the **direct** Neon owner URL (the host must not contain `-pooler`) to the clipboard,
then stream it to setup. The URL never enters shell history, an environment file, or a
process argument:

```sh
pbpaste | npm run backup:setup -- --provision-neon-role
printf '' | pbcopy
```

This creates or rotates `planner_backup`, sets its transactions read-only, grants connect,
schema usage, and current/future table and sequence reads, and stores only its dedicated
direct URL under Keychain service `planner-production-backup-database-url`.

### Configure Neon recovery

In Neon Account settings → API keys, create a key named `planner-backup`, copy it, and run:

```sh
pbpaste | npm run backup:setup -- --configure-neon-api
printf '' | pbcopy
```

Setup discovers the single project named `planner`, stores the API key/project/branch tuple
under Keychain service `planner-production-backup-neon-api`, and sets the project history
window to 604800 seconds (seven days).

Neon's built-in backup schedule cannot meet this policy: its current
`retention_seconds` maximum is 35 days. The LaunchAgent therefore creates an idempotent
manual snapshot named `planner-weekly-YYYY-MM-DD` for the most recent UTC Sunday and gives it
an `expires_at` 90 days after creation. A sleeping Mac catches up on its next run. Manual
snapshots allow this longer expiry and remain a Neon-side recovery layer; they are not tied
to Dropbox archive success.

### Save the off-Mac recovery key

The Keychain copy alone is not disaster recovery. Copy the passphrase without displaying it,
paste it into a new 1Password item named **Planner production backup recovery**, then clear
the clipboard:

```sh
npm run backup:setup -- --copy-recovery-passphrase
# Paste into 1Password, save, then:
printf '' | pbcopy
```

Only after the 1Password item is saved, enable the schedule:

```sh
npm run backup:setup -- --recovery-copy-confirmed
```

## Normal operation

```sh
npm run backup:run                     # skip if newest verified archive is <20h old
npm run backup:run -- --force          # always create and verify a generation
npm run backup:status                  # non-zero when no valid archive or age is >=30h
npm run backup:run -- --retention-dry-run
```

Each generation has three published files:

```text
planner-production_YYYY-MM-DDTHH-mm-ssZ.dump.gpg
planner-production_YYYY-MM-DDTHH-mm-ssZ.dump.gpg.sha256
planner-production_YYYY-MM-DDTHH-mm-ssZ.dump.gpg.manifest.json
```

The manifest contains only timestamps, encrypted bytes, SHA-256, duration, and tool versions.
The archive final name appears only after decrypting its `.partial` file into
`pg_restore --list` succeeds. Retention then keeps the union of one generation per UTC day
for 14 days, ISO week for 8 weeks, and UTC month for 12 months. Unknown, incomplete,
future-dated, or malformed files are untouched.

Logs are local at `~/Library/Logs/Planner/backup.log` and `backup-error.log`. Success does not
notify. A failed job or stale latest generation produces one macOS notification.

Inspect the schedule with:

```sh
launchctl print gui/$(id -u)/com.lraulin.planner-backup
tail -100 ~/Library/Logs/Planner/backup.log
tail -100 ~/Library/Logs/Planner/backup-error.log
```

Uninstall removes and unloads only the LaunchAgent:

```sh
npm run backup:uninstall
```

Keychain recovery material and Dropbox archives are deliberately preserved.

## Quarterly independent restore drill

With Docker running:

```sh
npm run backup:restore-test
npm run backup:restore-test -- --file "/path/to/selected.dump.gpg"
```

The command checks the encrypted SHA-256, decrypts into `pg_restore --list`, starts an
unpublished `postgres:18` container with no network port, restores the archive, and verifies:

- `drizzle.__drizzle_migrations`;
- Better Auth `users`, `sessions`, `accounts`, and `verifications` tables;
- nonzero `nodes`, `notes`, and `user_settings` rows;
- nonzero `finance_transactions` rows.

The container is force-removed in a `finally` path; the archive is preserved. Record the
date, archive name, encrypted size, row counts, and duration in the current operational
record. Also confirm the archive is present on Dropbox web, not only in the local sync
folder.

## Recovery runbooks

### Recent error: Neon point-in-time restore

1. Stop writes if practical and record the suspected bad-operation time in UTC.
2. In Neon, open the root branch → **Postgres database** → **Backup & Restore** →
   **Restore from history**.
3. Use Time Travel Assist/read-only queries to verify a timestamp just before the error.
4. Restore the root branch from its own history. This overwrites the branch timeline, is not
   a merge, and briefly interrupts connections; the connection string remains stable.
5. Wait for all Neon operations to finish before connecting. Smoke the production app and
   compare representative counts.
6. Keep Neon's automatic pre-restore backup branch until verification is complete, then
   remove it where Neon permits so it does not accrue storage.

### Older recovery point: Neon snapshot

1. Open Neon → **Backup & Restore** and select the required `planner-weekly-*` snapshot.
2. Prefer restoring to a temporary branch first and verify the relevant rows there.
3. To replace production while preserving its connection string, finalize the snapshot
   restore to the current root branch only after recording the current branch and snapshot
   IDs.
4. Wait for every restore operation to finish before connecting. Verify production, then
   clean up the orphaned pre-restore branch after the rollback window closes.

Snapshot restore changes the root branch ID even when the connection string stays stable.
Setup rediscovers the default branch when the API credential is next rotated; after any
snapshot restore, rerun the Neon API configuration step immediately so weekly snapshots
target the new branch ID.

### Full recovery without Neon

On any host with PostgreSQL 18 and GPG, copy one `.dump.gpg` and its SHA-256 sidecar from
Dropbox. Verify the encrypted bytes first:

```sh
cd "/path/to/Planner Backups"
shasum -a 256 -c planner-production_YYYY-MM-DDTHH-mm-ssZ.dump.gpg.sha256
```

Create an empty target database and restore without putting either password in arguments or
shell history. The PostgreSQL target password is prompted by `pg_restore`; the archive
passphrase is read silently:

```zsh
read -s 'RECOVERY_PASSPHRASE?Planner recovery passphrase: '
print
gpg --batch --no-tty --pinentry-mode loopback --passphrase-fd 3 \
  --decrypt planner-production_YYYY-MM-DDTHH-mm-ssZ.dump.gpg \
  3<<<"$RECOVERY_PASSPHRASE" | \
  pg_restore --exit-on-error --no-owner --no-privileges \
    --host TARGET_HOST --username TARGET_OWNER --password --dbname planner
unset RECOVERY_PASSPHRASE
```

Run the same table/count checks as the quarterly drill, update the application connection
strings, deploy, and smoke all routes before accepting writes.

## Credential rotation

- **Database role:** copy the current direct owner URL and rerun
  `--provision-neon-role`. It rotates the dedicated role password and replaces its Keychain
  URL; archives are unaffected. Force a backup and restore-test immediately.
- **Neon API key:** create a replacement, rerun `--configure-neon-api`, verify
  `backup:status`, then revoke the old key.
- **Encryption passphrase:** retain the old value in 1Password because old generations still
  require it. Remove only the passphrase Keychain item, rerun `backup:setup` to generate the
  replacement, save the replacement in 1Password before re-enabling, then force and restore
  a new generation. Do not delete the old 1Password value until every archive it protects
  has aged out.

## Cost controls

At the shaped 0.06 GB logical database size:

- 13 pessimistic full-copy weekly snapshots: `0.06 × 13 × $0.09` = about **$0.07/month**.
- Daily dump transfer: `0.06 × 30` = about **1.8 GB/month** before compression.
- Maximum tier slots: `(14 + 8 + 12) × 0.06` = about **2.04 GB** before compression;
  overlap normally makes the real retained set smaller.
- PITR history is **not** database size × seven. Neon bills actual retained WAL at
  $0.20/GB-month, so review its first full billing month.

Keep the existing $3 Neon spending notification. Review Usage monthly and after a large
import. If snapshots plus History project above $1/month, or total Neon projects above
$5/month, first stop weekly snapshot creation and set PITR to 24 hours. Keep Dropbox
backups. If compute plus ordinary storage still project above $5, shape a production move
separately rather than improvising one during an incident.
