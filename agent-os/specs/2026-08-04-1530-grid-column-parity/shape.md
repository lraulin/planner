# Grid Column Parity — Shaping Notes

**Status: frozen / complete** (2026-08-04)

## Shape

The Show Fields dialog is a menu of columns a tab _defines_, not a list of its default
columns. This slice expands those definitions while leaving each view's saved/default order
alone. The row model is widened only for values that occur in more than one grid or that
are requested by the supplied Achieve inventory.

## Fidelity notes

- AP allows a much larger field menu than its default views show; Planner will match that
  progressive-disclosure model.
- A value must remain faithful: no fake task Assignee inferred from its project, no generic
  Expected Cost inferred from a low/high range, and no Metric Status guessed without knowing
  whether a target is a minimum, maximum, or range.
- Existing Planner labels may remain compact (`Effort`, `L.A.P.`) when they express the same
  field named in AP. The reference document records those aliases.

## Code boundaries

- `src/lib/tree/types.ts`, `queries.ts`, and `derive.ts` own raw and ancestry-derived node
  values.
- `src/lib/tree/format.ts` owns money display.
- `src/components/grid/commonColumns.tsx` owns shared read-only column definitions.
- Individual grid files only decide which optional fields their tab defines.
- Metrics remains its purpose-built table; it is not converted to `DataGrid` in this slice.
