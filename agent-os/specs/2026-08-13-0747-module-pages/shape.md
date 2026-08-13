# Module pages — Shaping Notes

**Status: active**

## Scope

One consistent pattern for navigating between destinations **inside** a module, applied to every
module that has any today, plus the vocabulary to talk about it.

- A **Page** tier between Module and View, with one registry and one shell-owned control.
- Conversion of all four modules that currently do this their own way: Fitness, Notes, Schedule,
  and Day.
- Day relocated into Schedule as two of its pages.
- `navigation.md` amended, since it currently governs modules and commands and is silent on
  everything between them.

### Out of scope

- **Any new feature.** This is chrome. No page gains a capability it does not have today.
- **Building the Finances Insights page.** It gets a `reserved` registry entry; the active
  `finances-insights-dashboard` spec builds it.
- **Deciding Day's future.** It moves; whether it survives is still open.
- **Resolving the three week-shaped surfaces** (Calendar at `dayCount 7`, Week Plan, the
  `/schedule/plan` wizard). Named in `plan.md`, deliberately not fixed here.
- **Renaming View to Lens.** Considered and rejected; see below.
- **Converting the remaining hand-written row menus to registered commands.** Still the
  follow-up the navigation spec left open.

## Decisions

### The rejected axis, kept because it explains the shape

The first pass split intra-module destinations by whether they showed the **same records
differently** (Schedule Calendar\|Agenda, Notes Grid\|Journal → a persisted "presentation") or
**different records** (Fitness Sessions\|Exercises → a route). Two tiers, two controls.

Lee rejected it mid-shaping: _"…or not necessarily, like in Fitness. But I'm not sure that's
essential to how subsections/pages should be organized."_

He was right, and the reason is worth keeping: the axis does not survive contact with the cases.
Notes Grid→Journal changes which notes you see and what a selection means; Fitness changes the
entity; Schedule changes neither. Three points on a spectrum, and every future feature would have
had to pick a side of a line that is not there — which is precisely how the current inconsistency
was generated in the first place.

The axis that does carry weight is **"is this a place you can be?"**. All of them are: each has
its own selection, scroll position and meaning of "selected". One concept, one control.

### Why "Page"

Considered: Section, Screen, Page, Tab, Presentation, Workspace.

- **Section** collides twice — `SECTIONS` (sidebar Plan/Do/Track/Library) and `MENU_SECTIONS`
  (command-menu grouping). One of them would have to be renamed to use it.
- **Tab** is retired vocabulary, and `tab` still names grid settings scopes. Reusing it would
  resurrect a dead word.
- **Presentation** is accurate for Notes and Schedule and wrong for Fitness — it is the rejected
  axis wearing a name.
- **View** is taken, by Achieve's own word.
- **Screen** has no collision but is mobile-flavoured for a desktop-first tool and does not carry
  the URL intuition.
- **Page** maps 1:1 to a URL segment and a `page.tsx`, and reads naturally in the sentences Lee
  actually says: _"add an Insights page to Finances"_.

### Why not rename View → Lens

Lee floated it: _"Maybe lens could be a more precise term for that."_ Rejected — **View** is
Achieve's own word for a saved column/filter preset ("Active Task Status"), and it is in
`data-grid.md`, the UI, and every grid call site. Renaming is churn for a synonym.

But the ambiguity he half-noticed is real and does get fixed: `tabChrome.tsx` calls toolbar row 2
"the lens row" while `NotesPresentationSwitch` and `FitnessView` each call an individual control
a "lens control". After this spec, **lens names exactly one thing** — the row.

### Why the bar gets its own row

Asked and answered directly: _"Yes I agree it should be its own row."_

The alternative was the left zone of the command row behind a `ToolbarDivider`, which saves ~34px
on four modules. Rejected because the page bar is navigation, at the same rank as the sidebar,
and putting it among the verbs is the flattening `TabToolbar`'s two-row split already exists to
prevent — the same argument, one tier up. The cost is bounded by the ≥2-built-pages rule: eight
modules pay nothing.

### Why underline tabs and not the segmented control we already have

Both patterns stay, and the split is the point:

> **Underline tabs = navigation. Bordered segments = a setting with 2–3 values.**

Consistency here does not mean one control for everything — that is how `Sessions | Exercises`
ended up looking like a density picker. It means one control per question, used identically
everywhere. Density keeps its bordered segment; every navigation switcher becomes an underline
tab.

### Why pages are URLs even when they used to be settings

Schedule and Notes stored their choice in `user_settings` and never touched the address bar. A
page is a place: it needs Back, reload, open-in-new-tab, and deep links. The stickiness that
motivated the settings approach is preserved separately, by the bare module path redirecting to
`lastPage` — so nothing is lost by promoting them to routes, and the browser starts working
correctly on them.

### Why Day moves into Schedule

Lee, mid-shaping: _"let's move day to Schedule. I'm still not sure what I want to do with it,
but… we can unhide I guess; since it's a section in schedule it will be less of a sore thumb."_

`modules.ts` had already written down this option: _"restoring or folding it into Schedule is a
status flip, not a rebuild."_ Folding is what lets an unfinished surface be visible without
reading as a broken top-level module, while its future stays undecided. It also forces the module
rename — "Weekly Schedule" containing a Day page would be a lie.

Recorded because it cuts against a standing note that Day may be removed and that no new work
should be built on `daily_items`: **this is a relocation, not an endorsement**, and no
`daily_items` work happens here.

## Context

- **Visuals:** None. The layout is described in `plan.md` as an ASCII sketch; the two reference
  implementations already exist in the codebase (`FitnessView`'s segment for the shape,
  `Sidebar`'s active treatment for the styling vocabulary).
- **References:** See `references.md`.
- **Product alignment:** No roadmap item. This is the navigation debt the module/View split left
  behind, and the precondition for Finances Insights landing somewhere sensible.

## Standards Applied

- `components/navigation` — the standard being amended; every rule at the module tier is
  re-applied at the page tier.
- `components/ux-principles` — a page must have a visible tappable path; keyboard-first desktop,
  touch-complete phone.
- `components/responsive` — the page bar is the one chrome row that survives below `md`; adaptive,
  not shrunken.
- `development/testing` — pure logic in `src/lib` with tests, no component tests, `npm run smoke`
  after touching `src/app/**`.
