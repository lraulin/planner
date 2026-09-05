# Standards for Bills open-record gestures

Applied as of standards commit `a1645dc6cde7886e4d6f4f35b4dcda106f1343ef`. References, not
copies — see AGENTS.md. `git show a1645dc:agent-os/standards/<path>` recovers exactly what
applied at shape time.

- `agent-os/standards/components/ux-principles.md` — grid + drawer is the default; fields
  that appear as columns edit in place, but the name is the open-record target, not a
  permanent input. Outline’s Enter-opens / F2-renames split is the rule this page drifted
  from.
- `agent-os/standards/components/data-grid.md` — `onOpenDetail` and the control-exclusion
  on double-click; compact tap opens the record unless the tap was on a control.
- `agent-os/standards/components/drawer-pattern.md` — the existing overlay drawer stays;
  this spec does not invent a new shell.
- `agent-os/standards/components/navigation.md` — Open and Rename live in the command
  catalog (Item, Commands panel, `⌘K`, row menu). A hand-written row-menu Open that is
  missing from the catalog is how Enter stopped working.
- `agent-os/standards/components/responsive.md` — below `md`, list + sheet; name tap opens
  the sheet, amount/cadence taps still edit.
- `agent-os/standards/development/testing.md` — no React component tests. Any extracted
  rename-commit helper belongs in `src/lib/**` with a unit test; this work is likely
  view-only.
- `agent-os/standards/development/commits.md` — one logical change; the message records
  that the root cause was an always-on name input stealing the open-record gesture.

## Deviations

None. The envelope-workflow control-exclusion stays for real cell editors; the name simply
stops being one until Rename.
