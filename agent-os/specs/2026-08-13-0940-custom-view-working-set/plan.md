# Working-copy views

**Status: active**
Spec folder: `agent-os/specs/2026-08-13-0940-custom-view-working-set/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-05-1059-views-across-modules/` — `useModuleViews`, `base`, `viewScopes`.
- **Extends:** `agent-os/specs/2026-08-05-0230-saved-views/` — catalogue, random ids, cap.
- **Supersedes:** live-overlay-per-view (`grid:{tab}.{id}` as a second mutable copy of a named view).
- **Supersedes the first draft of this spec:** Custom… as a selected picker value, “no Save”, and Replace-a-view-you-pick.

## Context

Auto-persisting settings and document-style Save / Save As were stacked. The live state _was_ the named view, so Save As did not isolate, and the picker claimed you were still on Full Outline after it had drifted.

This spec commits to **working-copy + explicit Save**. The live grid is a working copy. Named views are snapshots. Auto-persist applies only to the working copy. Achieve’s Customize Current View (live-edit of the named view) is an intentional divergence.

## Decisions

| #   | Decision                                                                                   |
| --- | ------------------------------------------------------------------------------------------ |
| 1   | Working copy. Named views change only on Save / Save as.                                   |
| 2   | Picker stays on the named view. Dirty is an “Unsaved changes” mark, not a Custom… option.  |
| 3   | Save writes the working copy over the _active_ saved view. Available on shipped defaults (which are now ordinary editable views). |
| 4   | Save as deep-copies the working copy into a new view and switches to it. Source unchanged. |
| 5   | Switching views loads that view’s definition. Dirty working copy is discarded. No prompt.  |
| 6   | Reload restores the working copy + active view. Dirty stays if they still differ.          |
| 7   | Reset this grid reloads the active definition.                                             |
| 8   | Shipped defaults are editable and renamable; Settings can restore defaults by module or globally. |

## Acceptance criteria

- [ ] Tweaking Full Outline keeps the picker on Full Outline and shows Unsaved changes.
- [ ] Reload keeps Full Outline + unsaved + the same tweaks.
- [ ] Save and Rename work on shipped default views.
- [ ] Save as creates a new view, switches to it (clean). Picking Full Outline is the preset.
- [ ] Save on a saved view writes the working copy and clears unsaved.
- [ ] Tweak, Save as, switch back: the first view is what it was before the tweak.
- [ ] Switching views discards dirty with no prompt.
- [ ] Reset reloads the active definition.
- [ ] Notes / Chooser extras follow the same machine.
- [ ] Settings can restore default views per module and globally.
- [ ] Unit tests in `src/lib/settings`. Browser on Outline and Tasks.

## Changes from original plan

| #   | Change                                                                                                                        | Why                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Dropped Custom… as the selected value and “no Save.” Restored Save = write to the _active_ named view. Dirty is an indicator. | Treating dirty as leaving the document was still a hybrid. Working-copy Save needs an active document. |
| 2   | Dropped Replace view….                                                                                                        | Save already overwrites the active saved view.                                                         |
| 3   | Switch discards dirty, no prompt.                                                                                             | Confirmed; personal tool, not SAP-style.                                                               |
| 4   | Shipped defaults are now ordinary editable/renamable views, with restore-defaults actions in Settings (module + global).    | Built-in read-only handling was unnecessary ceremony. Defaults should behave like any other view and be recoverable in one place. |

## Tasks

1. This folder (revised).
2. `useModuleViews` + ViewPicker implement the state machine.
3. Extras isolation (Save as copies working extras; switch loads V).
4. `data-grid.md`, tests, browser, freeze.

> While this spec is **active**, material changes update these files and append to **Changes from original plan**.
