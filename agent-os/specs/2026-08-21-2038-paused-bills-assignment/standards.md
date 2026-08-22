# Standards for Paused bills and assignment visualization

Referenced, not copied, so later edits stay in force.

- `@agent-os/standards/development/testing.md` — pure logic beside the lib module; no React component tests; every mutation `userId`-scoped with a second-user case
- `@agent-os/standards/development/dates.md` — calendar keys not `Date` / `startOfDay`; `todayKey` from the reader
- `@agent-os/standards/development/clean-code.md` — app → components → lib → db; assignment math in `src/lib/finances`
- `@agent-os/standards/components/ux-principles.md` — clarity over cleverness; progressive disclosure
- `@agent-os/standards/database/migrations.md` — generate the CHECK change; commit sql + snapshot + journal together
- `@agent-os/standards/api/agent-tools.md` — strict schemas; unknown statuses still rejected
- `@agent-os/standards/development/security.md` — prove ownership before writing status
