# Standards applied — Notes column grouping

**Status: frozen / complete** (2026-08-07)

- `agent-os/standards/components/data-grid.md`: progressive three-level grouping, group
  rows as display state, and a visible column for every groupable value.
- `agent-os/standards/development/testing.md`: bucket derivation and ordering stay pure in
  `src/lib/notes/grouping.ts` with plausible-mistake unit tests; no component tests.
- `agent-os/standards/development/dates.md`: every date key comes from `toDateKey`; display
  uses UTC components so calendar days cannot drift by timezone.
- `agent-os/standards/development/clean-code.md`: the grid component orchestrates state;
  grouping semantics live in the Notes library.
