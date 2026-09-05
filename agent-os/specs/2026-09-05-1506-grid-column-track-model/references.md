# References

**Status: frozen / complete** (2026-09-05)

## Code

- `src/lib/grid/template.ts` — `buildGridTemplate`, `FILLER_TRACK`, `resizedColumnWidth`, and
  the `minmax` collapse. Tested beside it.
- `src/components/grid/DataGrid.tsx` — the track surface inside the scroller, the sticky
  header's place in it, the empty-state slot, `scrollPaddingStart` for the virtualiser.
- `src/components/grid/ColumnHeader.tsx` — `ResizeHandle`; the header row's sticky class.
- `src/components/grid/columns.ts` — the `width` contract on `ColumnDef`.
- `src/components/grid/commonColumns.tsx` — the shared `nameColumn` factory's default.

## Prior specs

- `agent-os/specs/2026-07-31-1520-persistent-ui-state/` — where resizable widths came from.
- `agent-os/specs/2026-08-04-1900-column-menus-and-header-drag/` — the header's gestures.

## Reference product

- `docs/achieve-planner/user-manual.md:1095` (and `online-help.md:395`) — "To change the size
  of a column you click between the two headers … and drag to the new size."

## Reproduction

`.agents/skills/run-planner/driver.mjs` with `eval` steps that read
`getComputedStyle(header).gridTemplateColumns` and each header cell's `left`/`width`, then
synthesise a pointer drag on `button[aria-label="Resize <Column>"]`. The before/after table
in `plan.md` came from that.
