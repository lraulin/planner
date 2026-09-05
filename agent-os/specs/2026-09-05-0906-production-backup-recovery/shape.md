# Production Backup and Recovery — Shaping Notes

**Status: frozen / complete** (2026-09-05)

## Scope

Two independent recovery systems for the production PostgreSQL database: provider-side
Neon recovery and portable encrypted dumps synchronized by the installed Dropbox desktop
client. A user LaunchAgent on this Mac owns scheduling and retry behavior.

### In scope

- Seven-day Neon PITR and weekly 90-day snapshots.
- A read-only dump role, Keychain-held secrets, encrypted/verified/atomic dumps, tiered
  retention, freshness status, LaunchAgent setup/uninstall, and PostgreSQL 18 restore drill.
- Operational runbooks, migration safety policy, cost controls, and metered-plan wording.

### Out of scope

- Planner UI or schema changes.
- Dropbox API integration, first-party blob storage, or a new paid service.
- Moving production home.
- Any further category/tag cleanup; that work already shipped under its own frozen spec.

## Product alignment

- `agent-os/product/mission.md`: own the data; avoid a second abandoned-tool failure.
- `agent-os/product/roadmap.md`: full export is portability, while database recovery is an
  operational layer beneath it.
- `agent-os/product/tech-stack.md`: Neon is now a metered Launch-plan dependency whose cost
  needs an explicit bound.

## Operational constraints

- Dropbox desktop sync, Mac login frequency, Docker, and 1Password remain external
  prerequisites.
- The passphrase recovery copy is a human checkpoint because loss of both the Mac and its
  Keychain must not make off-machine archives unreadable.
- Neon scheduled backups cap retention at 35 days. Weekly 90-day snapshots are therefore
  manual API snapshots created idempotently by the Mac job, with the API configuration in
  Keychain.
- PITR history is charged from actual database change volume. The first complete billing
  month is measured rather than inferred from the current database size.

## Status

Implementation and live recovery verification are complete. `plan.md` is the authoritative
as-built record.
