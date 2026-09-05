# Production Backup and Recovery

**Status: frozen / complete** (2026-09-05)
Spec folder: `agent-os/specs/2026-09-05-0906-production-backup-recovery/`

## Spec relationships

Root operational spec; it does not extend another backup implementation.

## Context

Planner's production database contains the only complete copy of personal planning and
finance history. The mission promises ownership and portability, but a provider database
with six hours of point-in-time history was still a single recovery system. This spec adds
two independent layers while keeping projected Neon spend below $5/month:

- Neon: seven-day point-in-time recovery plus weekly snapshots retained for 90 days.
- Dropbox: encrypted daily PostgreSQL custom-format dumps restorable to PostgreSQL 18
  without Neon.

The work is operational only: no Planner UI, schema change, Dropbox API, or new paid service.
It runs from Lee's Mac through a user LaunchAgent. Visuals: none.

The supplied implementation plan described the legacy category cleanup as a deferred
prerequisite. Repository state superseded that assumption before this implementation began:
`agent-os/specs/2026-09-02-1050-retire-tags-and-legacy-category/` is already frozen and the
cleanup shipped. This spec does not revisit or alter it.

## Decisions

1. Dumps are complete `pg_dump -Fc --no-owner --no-privileges` archives, streamed directly
   through GPG AES-256. A plaintext dump is never written.
2. The dedicated read-only Neon URL and a generated 256-bit passphrase live in macOS
   Keychain under `planner-production-backup-database-url` and
   `planner-production-backup-passphrase`. Secrets never appear in repository files,
   process arguments, logs, manifests, or sidecars.
3. An archive is decrypted into `pg_restore --list` before its `.partial` name is atomically
   renamed. A matching SHA-256 sidecar and non-sensitive manifest complete publication.
4. Pruning happens only after a newly created archive verifies. It retains the union of the
   newest generation in each of 14 UTC-day, 8 ISO-week, and 12 UTC-month buckets. Unknown,
   incomplete, future-dated, and malformed Dropbox files are preserved.
5. A login/every-six-hours LaunchAgent skips work when a verified generation is less than
   20 hours old, retries after failure, and reports stale at 30 hours. It logs locally and
   notifies only on failure or stale state.
6. The schedule cannot be enabled until Lee confirms that the recovery passphrase has been
   copied to 1Password. Backup uninstall preserves archives and Keychain recovery material.
7. Restore drills use a disposable `postgres:18` Docker container and only the encrypted
   archive plus recovery passphrase. They verify migrations, auth tables, outline rows,
   notes, settings, and finance transactions, then always remove the container.
8. Keep the existing $3 Neon spending notification. If backup history and snapshots project
   above $1/month or total Neon spend projects above $5/month, disable scheduled snapshots
   first and reduce PITR to 24 hours; Dropbox backups remain. A still-over-$5 service gets a
   separately shaped home-hosting decision.
9. Neon's built-in scheduled-snapshot retention is capped at 35 days. To meet 90 days, the
   Mac job creates one idempotent manual snapshot for the latest UTC Sunday with a 90-day
   `expires_at`. Its API key/project/branch configuration is a third Keychain item,
   `planner-production-backup-neon-api`.

## Interfaces and defaults

- Archive: `planner-production_YYYY-MM-DDTHH-mm-ssZ.dump.gpg`
- Destination: `/Users/leeraulin/Library/CloudStorage/Dropbox/Planner Backups`
- Commands: `backup:setup`, `backup:run`, `backup:status`, `backup:restore-test`,
  `backup:uninstall`
- `backup:run -- --force` bypasses the 20-hour freshness skip.
- `backup:restore-test -- --file <path>` selects a generation; otherwise the newest valid
  generation is used.
- Recent-error RPO: a point within the preceding seven days.
- Neon-independent RPO: approximately 24 hours.
- Demonstrated recovery RTO: under one hour.

## Acceptance criteria

- [x] PostgreSQL 18 client tools are installed and the dedicated read-only Neon role works.
- [x] A verified, encrypted generation and sidecars are synchronized in Dropbox.
- [x] No plaintext archive, secret-bearing argument, secret log line, or secret metadata is
      produced in success or failure paths.
- [x] Freshness, retention, malformed-file preservation, redaction, atomic publication, and
      failure ordering have unit/orchestration coverage.
- [x] The production generation restores into PostgreSQL 18 without Neon and the required
      representative tables/counts verify.
- [x] The LaunchAgent is installed and enabled only after the 1Password checkpoint.
- [x] Neon has seven-day PITR and a Sunday snapshot schedule with 90-day retention.
- [x] Recovery, rotation, quarterly drill, status, cost-escalation, and uninstall runbooks
      are committed.
- [x] Lint, typecheck, unit tests, integration tests, and the real restore drill pass.

## Measured results

- Homebrew PostgreSQL client 18.6 and GPG 2.5.22 produced
  `planner-production_2026-09-05T13-40-46Z.dump.gpg` in 2.503 seconds. The encrypted archive
  is 2,729,577 bytes (2.60 MiB); Dropbox web showed it and both sidecars after desktop sync.
- At the measured compressed size, 30 daily transfers are about 0.082 GB/month. The
  no-overlap ceiling of 34 retention buckets is about 92.8 MB (88.5 MiB); real retention is
  lower because day/week/month representatives overlap.
- A provider-independent restore into `postgres:18` completed in 2.3 seconds. It verified
  93 migrations, 1 user, 10 sessions, 2 accounts, the verification table, 422 outline
  nodes, 416 notes, 50 settings, and 7,366 finance transactions. The disposable container
  was removed afterward.
- Neon reports 604,800 seconds of history. Snapshot `planner-weekly-2026-08-30` was created
  at 2026-09-05T13:55:25Z for the production root branch and expires at
  2026-12-04T13:55:25Z.
- The LaunchAgent is loaded with a 21,600-second interval. Its RunAtLoad execution completed
  with exit code 0 after the user confirmed the 1Password recovery copy.
- The pessimistic snapshot estimate remains $0.0702/month at 0.06 GB and $0.09/GB-month.
  PITR remains the unknown: review actual retained history after the first complete billing
  month against the $1 backup and $5 total thresholds.
- Verification: ESLint and TypeScript passed; 3,970 unit tests across 334 files and 1,014
  real-Postgres integration tests across 60 files passed; the Next.js production build and
  the final real restore drill passed.

## Changes from original plan

| #   | Change                                                                                                               | Why                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Treat the legacy category cleanup as already shipped and leave it untouched, rather than as a deferred prerequisite. | The frozen 2026-09-02 delta and current roadmap predate implementation of this spec and are the current repository truth.                                                             |
| 2   | Create weekly 90-day manual Neon snapshots through the Mac job instead of using Neon's built-in backup schedule.     | The current provider API caps scheduled retention at 35 days while manual snapshot `expires_at` has no such maximum. This preserves the agreed 90-day recovery window.                |
| 3   | Add `planner-production-backup-neon-api` as a third Keychain service.                                                | The 90-day snapshot workaround and automated PITR/status verification need a durable API credential; it follows the same no-arguments/no-files/no-logs rule as the other two secrets. |
| 4   | Discover organizations before looking up the `planner` project with a personal API key.                              | Neon requires `org_id` on personal-key project listings; an unscoped project query returns HTTP 400 even though the key itself is valid.                                              |

## Follow-ups (new work — not amendments after freeze)

- If projected total Neon spend remains above $5 after the documented backup reductions,
  shape home-hosted production separately.
