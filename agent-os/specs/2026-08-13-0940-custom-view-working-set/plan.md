# Working-copy views

**Status: frozen / complete** (2026-08-25)
Spec folder: `agent-os/specs/2026-08-13-0940-custom-view-working-set/`

This is the as-built record. Named views change only on Save / Save as. Further change
opens a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-05-1059-views-across-modules/` — `useModuleViews`, `base`, `viewScopes`.
- **Extends:** `agent-os/specs/2026-08-05-0230-saved-views/` — catalogue, random ids, cap.
- **Supersedes:** live-overlay-per-view (`grid:{tab}.{id}` as a second mutable copy of a named view).
- **Supersedes the first draft of this spec:** Custom… as a selected picker value, “no Save”, and Replace-a-view-you-pick.

## Context

Auto-persisting settings and document-style Save / Save As were stacked. The live state _was_ the named view, so Save As did not isolate, and the picker claimed you were still on Full Outline after it had drifted.

This spec commits to **working-copy + explicit Save**. The live grid is a working copy. Named views are snapshots. Auto-persist applies only to the working copy. Achieve’s Customize Current View (live-edit of the named view) is an intentional divergence.

## Decisions

| #   | Decision                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Working copy. Named views change only on Save / Save as.                                                                                                                             |
| 2   | Picker stays on the named view. Dirty is an “Unsaved changes” mark, not a Custom… option.                                                                                            |
| 3   | Save writes the working copy over the _active_ saved view. Disabled on a built-in.                                                                                                   |
| 4   | Save as deep-copies the working copy into a new view and switches to it. Source unchanged.                                                                                           |
| 5   | Switching views loads that view’s definition. Dirty working copy is discarded. No prompt.                                                                                            |
| 6   | Reload restores the working copy + active view. Dirty stays if they still differ.                                                                                                    |
| 7   | Reset this grid reloads the active definition.                                                                                                                                       |
| 8   | Built-ins are read-only.                                                                                                                                                             |
| 9   | Tasks' Project picker is part of a saved view. Live value stays in `?scope=`. Save writes it; selecting that view restores it. Built-ins and pre-scope views leave the picker alone. |

## Acceptance criteria

- [x] Tweaking Full Outline keeps the picker on Full Outline and shows Unsaved changes.
- [x] Reload keeps Full Outline + unsaved + the same tweaks.
- [x] Save is disabled on a built-in.
- [x] Save as creates a new view, switches to it (clean). Picking Full Outline is the preset.
- [x] Save on a saved view writes the working copy and clears unsaved.
- [x] Tweak, Save as, switch back: the first view is what it was before the tweak.
- [x] Switching views discards dirty with no prompt.
- [x] Reset reloads the active definition.
- [x] Notes / Chooser extras follow the same machine.
- [x] Unit tests in `src/lib/settings`. Browser on Outline and Tasks.
- [x] Save a Tasks view with a project selected; switch away and back; that project is selected again. Save with All Projects clears the picker on restore. Built-in view switches leave the picker alone. `View tasks…` still lands on `?scope=` without the last view overwriting it.

Verified 2026-08-13: unit tests for overrides/equality/round-trip; Outline (Full Outline

- Unsaved changes) and Tasks (search dirties, switch discards) in the browser. Tasks
  project-picker restore verified 2026-08-13 in a follow-up commit.

## Changes from original plan

| #   | Change                                                                                                                        | Why                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dropped Custom… as the selected value and “no Save.” Restored Save = write to the _active_ named view. Dirty is an indicator. | Treating dirty as leaving the document was still a hybrid. Working-copy Save needs an active document.                                                                    |
| 2   | Dropped Replace view….                                                                                                        | Save already overwrites the active saved view.                                                                                                                            |
| 3   | Switch discards dirty, no prompt.                                                                                             | Confirmed; personal tool, not SAP-style.                                                                                                                                  |
| 4   | Tasks saved views capture the Project picker (`scope` on the catalogue entry).                                                | The picker was URL-only, so Save named the grid but not which project you were looking at. Built-ins still leave it alone so Active Status → All Tasks keeps the project. |

## Tasks

1. This folder (revised). Done.
2. `useModuleViews` + ViewPicker implement the state machine. Done.
3. Extras isolation (Save as copies working extras; switch loads V). Done.
4. `data-grid.md`, tests, browser, freeze. Done — the standard already describes the
   working-copy machine; this freeze closes the leftover **Status: active**.

## Follow-ups (new work — not amendments to this frozen spec)

- Confirm-on-switch remains out (personal tool).
- Achieve live-edit of the named view remains an intentional divergence.
