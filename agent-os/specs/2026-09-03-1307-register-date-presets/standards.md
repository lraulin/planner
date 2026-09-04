# Standards for Register calendar date presets

**Status: frozen / complete** (2026-09-04)

Applied as of standards commit `2781563b9f72897bcab8ea38b7d288dc42d8c7e9`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/data-grid.md` — still one DataGrid; Date stays a mutually exclusive band funnel plus Custom; chips + Showing N of M; This Month is a view default, not a hidden row predicate; Clear all vs Reset this grid.
- `agent-os/standards/development/testing.md` — band matching lives in `src/lib/grid/**` with a `filters.test.ts` tripwire. No React component tests. No new mutations, so no new integration file.
- `agent-os/standards/development/dates.md` — `transactionDate` is a calendar day; “today” is `localDateKey` / `useToday`. Month bounds via `monthKeyOf` / `monthEndKey`, not `Date` arithmetic. Unknown today must not empty the grid on SSR.
- `agent-os/standards/development/clean-code.md` — one matcher per kind in `lib/grid`; Register columns only switch `filterKind`. Components do not reimplement “is this in This Month?”
- `agent-os/standards/development/commits.md` — one logical change per commit; Spec trailer to this folder.

## Deviations

None.
