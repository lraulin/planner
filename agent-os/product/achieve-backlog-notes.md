# Notes from Achieve menus + user manual

Captured 2026-07-28 while closing the weekly-planning slice. Source material:
`screenshots/menus/*`, `screenshots/APUserManual.pdf` (TOC + overview), and the existing
roadmap. This is **idea inventory**, not a commitment list — rank against daily pain before
shaping a spec.

## Already covered by our app

| Achieve surface                                | Ours                            |
| ---------------------------------------------- | ------------------------------- |
| Outline / Projects / Tasks / Goals / Wish List | Main tabs                       |
| Weekly Schedule + Time Charts                  | `/schedule` + template editor   |
| Weekly Planning Wizard                         | `/schedule/plan`                |
| ABCD priorities + rank                         | Outline + forms                 |
| Project/task detail forms                      | Per-type drawers                |
| Indent / outdent / insert / delete             | Outline keyboard + context menu |

## High-value candidates (align with roadmap)

| Idea                                | Why it earns a slot                                                | Roadmap home                             |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| **Quick Task Entry / capture**      | Global “dump a thought” without full outline focus                 | ✅ In-app + Alfred; Reminders still open |
| **Task Chooser / Next Action list** | Cross-project top actions — the “what do I do now” surface         | Phase 2 Task Chooser                     |
| **Pomodoro → Actual Effort**        | Manual effort fields exist; no way to earn them while working      | Phase 2 Pomodoro track                   |
| **Google Calendar sync**            | Achieve Tools menu; our calendar is local-only                     | Phase 2 Google track                     |
| **Real multi-user auth**            | Schema is ready; `getCurrentUserId` is still a hard-coded dev user | Phase 2 Better Auth                      |
| **Import/export**                   | Own-your-data mandate; Achieve has Outlook import                  | Phase 2                                  |

## Outline polish (small, no new product line)

From Outline / Edit / View menus — useful without matching every shortcut:

- **Expand / Collapse All** and **expand to depth N** (we only toggle one row today)
- **Find** in the outline (Ctrl+F) — jump to a name
- **Remove priority gaps / renumber ranks** — hygiene after heavy reordering
- **Pickup / drop rows** as cut-paste reparent (we have drag; keyboard variant optional)
- **Filter shortcuts** / toggle filter row — we have column filters; keyboard access is thin

## Explicitly low priority or out

| Achieve item                                                       | Why skip for now                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Daily Planning Wizard, Next Action / Advanced Task Capture wizards | Overlap weekly wizard + Task Chooser; don’t multiply wizards yet                 |
| Motivational Images / Thought Master / Wish Brainstorming          | Nice-to-have coaching chrome                                                     |
| Outlook Synchronization                                            | Microsoft lock-in; CSV/export first                                              |
| Automated Scheduling (chapter 7)                                   | Explicitly out of weekly-wizard scope                                            |
| Contacts, File Organizer, Resources tabs                           | Resources already out; contacts/files are other products                         |
| Overview tab as productivity process dashboard                     | Optional later; tabs already navigable                                           |
| Notes tab                                                          | Placeholder in TabStrip; needs a product decision (plain notes vs project notes) |
| Customize Keyboard / Options dialogs                               | Ship defaults first                                                              |

## Manual concepts worth keeping in mind

From the overview chapters:

- **Result Area categories** (Work / Personal) — we have a free-text category field; no
  global category list yet.
- **Priority without rank ranks as “bottom of letter”** (A ≈ A2500) — confirm our sort
  matches when re-touching priority sorting.
- **Projects can be single-step** (“pay a bill”) — don’t force tasks under every project.
- **Detail forms are optional depth** — “just because you can fill a field doesn’t mean you
  must”; keep partial saves (already a standard).
- **Task Chooser sorts with parent-relative ranks** — if we build it, inherit L.A.P. the
  way the outline already does.

## Suggested next shape-specs (when ready)

1. **Quick capture** (in-app modal + optional Alfred later) — smallest daily win.
2. **Better Auth** — unblocks multi-device and everything OAuth-related.
3. **Pomodoro MVP** — writes Actual Effort on a selected task/project.
4. **Task Chooser** — after capture + priorities feel solid day-to-day.
