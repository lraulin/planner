# Bills open-record gestures — Shaping Notes

**Status: frozen / complete** (2026-09-05)

## Scope

Make the existing Bills drawer reachable the same way every other catalog grid opens a
record. The Bill name stops being an always-on input. Enter, double-click on the name, and
compact tap open the drawer; F2 / Shift+Enter rename.

### Out of scope

- A Budget-style persistent inspector on `/finances/bills`. The overlay drawer stays.
- Stripping in-grid editors from amount, cadence, status, group, or next charge.
- Adding Delete. Bills are cancelled, not deleted.
- Payees’ always-on name input (same smell; not this page).
- Drawer field content (due day, lead, `BillFields`).

## Decisions

- The panel is not missing. The open-record gesture is. Shaping started from “no panel /
  in-grid only”; clicking through showed a drawer that only opens from empty space past the
  last column, or from the row menu.
- Breaking the shared pattern would need a primary-use-case reason. Renaming is not that
  reason. Opening due day / lead / scheduled / payees is. Amount and cadence staying
  inline _is_ justified — those cells’ job is the edit — so the envelope-workflow
  “double-click inside a control stays in the editor” rule is kept for them and dropped
  for the name by not making the name a control.
- Budget’s name-double-click-to-rename does not apply here. Budget has a persistent
  inspector; Bills has an overlay drawer, so it follows Outline / Jobs / Contacts.

## Context

- **Visuals:** None.
- **References:** See `references.md`.
- **Product alignment:** Bills is the obligation registry from
  `2026-09-05-1200-finances-envelope-workflow`. Opening the record is a primary job after
  `2026-09-05-1401-bill-due-dates-and-lead-time`; always-on name editing is not.

## Standards Applied

See `standards.md`.
