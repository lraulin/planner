# References for Production Backup and Recovery

**Status: frozen / complete** (2026-09-05)

## Product and policy

- `agent-os/product/mission.md` — own-your-data mandate.
- `agent-os/product/tech-stack.md` — production hosting and cost constraint.
- `agent-os/standards/database/migrations.md` — production migration workflow.
- `agent-os/specs/2026-09-02-1050-retire-tags-and-legacy-category/` — already-completed
  destructive cleanup; explicitly not part of this work.

## Implementation anchors

- `package.json` — command surface.
- `scripts/migrate-on-deploy.mjs` — current production-migration entry point.
- `src/db/schema.ts` — representative restore-verification table names.
- `/Users/leeraulin/Library/CloudStorage/Dropbox/Planner Backups` — desktop-synchronized
  archive destination.

## External references

- Neon pricing: <https://neon.com/pricing>
- Neon snapshots/versioning: <https://neon.com/docs/ai/ai-database-versioning>
- Neon organization API scoping: <https://neon.com/docs/manage/orgs-api>
- Neon history window: <https://neon.com/docs/postgres/backup-restore/history-window>
- PostgreSQL 18 `pg_dump` / `pg_restore` documentation.
