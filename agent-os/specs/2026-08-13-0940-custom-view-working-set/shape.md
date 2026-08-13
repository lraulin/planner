# Working-copy views — Shaping Notes

**Status: active**

## Scope

End the hybrid: one model, visible to the user.

- Live grid is a working copy; named views are snapshots.
- Stay on the named view; show Unsaved changes when dirty.
- Save / Save as with document meanings and deep-copy isolation.
- Switch loads a clean snapshot (discard dirty). Reload keeps the working copy.

### Out of scope

- Confirm-on-switch.
- Live-edit of the named view (Achieve Customize Current View).
- Editing frozen view specs.

## Decisions

See `plan.md`. The revision from Custom… / no-Save back to working-copy Save is change #1 there.

## Context

- **Visuals:** None.
- **References:** SAP Fiori variant management (working copy); Notion/Airtable (the live-edit alternative we did not take).
- **Product:** Coherence, not a roadmap item. Achieve divergence is explicit.
