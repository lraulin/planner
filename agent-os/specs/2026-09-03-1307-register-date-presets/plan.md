# Register calendar date presets

**Status: frozen / complete** (2026-09-04)  
Spec folder: `agent-os/specs/2026-09-03-1307-register-date-presets/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-04-1745-filter-control-per-kind/` — date columns still offer mutually exclusive named bands plus Custom; this adds a second band family rather than putting month windows on the Achieve deadline list.
- **Extends:** `agent-os/specs/2026-08-02-1208-custom-column-filters/` — Custom remains the escape hatch for ranges the bands do not name (a specific past month, future-dated rows, blanks).
- **Extends:** `agent-os/specs/2026-08-05-0100-views-as-settings/` — This Month is the All Transactions _default_; Clear all vs Reset this grid keep their meanings. Named views keep whatever Date they stored.
- **Extends:** `agent-os/specs/2026-08-24-1945-register-prepared-rows/` — the Date band still runs in `prepareRegister` over the whole ledger. This spec does **not** add a SQL date window.
- **Extends:** `agent-os/specs/2026-08-28-1356-budget-activity-register-links/` — Activity’s Date chip stays custom `gte`/`lte` for the linked budget month (absolute, not “This Month” relative to today).
- **Supersedes:** `2026-08-04-1745-filter-control-per-kind` only on “every `filterKind: "date"` column shares `DATE_PRESETS`.” Register **Date** (`transactionDate`) gets a calendar family. Task/project deadline columns keep the Achieve list. Posted is unchanged.

## Context

The Register Date funnel currently offers Achieve Planner deadline bands: `(Past & None)`, `(Next 14 Days)`, `(None)`, future windows, and so on. Those were designed for tasks (overdue, upcoming, undated). A transaction always has a date; future-dated rows are rare; the budget’s unit is a calendar month.

Without a This Month band, looking at “just this month” means Custom criteria. Opening All Transactions with no Date filter shows the whole ledger in the prepared index.

This is Register daily-use, not a named roadmap line. Note it at freeze under Financial planning.

## Decisions

1. **New `FilterKind`: `calendar`.** Presets hang off kind (`presetOptions`). `date` stays the Achieve deadline list. Register Date (`registerFields.date`) becomes `calendar`. Posted stays `date`. Custom operators for `calendar` are the same compare ops as `date` (`gte` / `lte` / …), so Activity’s month bounds keep working.
2. **Register Date bands** (plus the universal `(All)` and `(Custom)...`):
   - `(This Month)` — calendar month of today, 1st through last day (remaining days of the month included).
   - `(Last Month)` — previous calendar month, full.
   - `(Last 7 Days)` — today−6 through today, inclusive.
   - `(Last 30 Days)` — today−29 through today, inclusive.
   - `(This Year)` — Jan 1 through Dec 31 of the current calendar year.
3. **Dropped on this column:** `(None)`, `(Has Date)`, `(Past)`, `(Past & None)`, `(Today Past & None)`, `(Today & Past)`, `(Today)`, `(Yesterday)`, `(Tomorrow)`, `(Next 7 Days)`, `(Next 14 Days)`, `(Today & Future)`, `(Today Future & None)`. Use Custom if they are ever needed.
4. **Inclusive rolling windows.** Achieve’s `last-7-days` is exclusive of today (a “previous 7 days” deadline window). Calendar `(Last 7 Days)` / `(Last 30 Days)` include today — “what posted recently.”
5. **All Transactions always opens on This Month.** Entering the built-in All Transactions view reseeds Date to `(This Month)`, even if last visit ended on Last 30 or All. Changing the band during the visit works until you leave. Reset this grid restores This Month. Clear all clears Date for this visit; the next All Transactions visit reseeds. Named views keep their stored Date. Activity keeps its custom month. Uncategorized is not reseeding in this slice (historical uncategorized stays findable).
6. **No SQL date window.** `listTransactions` still loads the ledger; `prepareRegister` narrows it. Initial server `parseRegisterQuery` on `/finances/register` should include This Month so the first paint is not an all-history index.
7. **Matching contract.** `YYYY-MM-DD` of `transactionDate` vs wall-clock today (`useToday` / `localDateKey`). Unknown today → match everything (same SSR/hydration rule as deadline presets). Blanks fail every named calendar band. Reuse `monthKeyOf` / `monthEndKey` / `shiftDays` — do not reimplement month math. Stale Achieve option ids on a `calendar` column do not hide rows (unknown id → match).
8. **Labels** keep the date-funnel parentheses: `(This Month)`, `(Last Month)`, `(Last 7 Days)`, `(Last 30 Days)`, `(This Year)`.

## Acceptance criteria

- [x] Register Date funnel lists `(All)`, `(Custom)...`, then the five calendar bands — not the Achieve deadline list.
- [x] Tasks / Projects / Goals Deadline (and other `filterKind: "date"` columns) still show the Achieve bands.
- [x] Posted still uses the Achieve date list.
- [x] All Transactions first paint and every subsequent visit show This Month as the Date chip; the prepared index `shown` count is that month, not the whole ledger.
- [x] Picking Last Month / Last 7 / Last 30 / This Year / All / Custom updates the grid for this visit; leaving All Transactions and returning restores This Month.
- [x] Reset this grid on All Transactions restores Date = This Month. Clear all drops the Date chip until the next All Transactions visit.
- [x] A named Register view that stored a Date filter keeps it.
- [x] Budget Activity still opens with Date = custom `gte` first of that month AND `lte` last of that month, including when that month is not the current month.
- [x] Custom Date criteria on Register Date still accepts `>=` / `<=` calendar days.
- [x] Pure tests: each band on a fixture around a month/year boundary (Jan 1, Feb 29 leap, month last day); Last 7/30 include today; unknown today matches all; blanks fail named bands; Achieve `date` matchers unchanged.
- [x] `npm run test:unit`, lint, typecheck; `npm run smoke` with the dev server up; browser-verified Register Date funnel, default chip, band switch, Activity drill-down, and a Tasks deadline funnel still showing Achieve bands.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                           | Why                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | Reseed skips the write when Date is already This Month (including the view default).             | Writing the default into `grid:finances` marked Unsaved changes on every All Transactions visit.     |
| 2   | All Transactions empty copy is "no rows match" when the ledger has rows but This Month is empty. | Opening in a month with no transactions used to show the import panel as if the register were blank. |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-09-03-1307-register-date-presets/` with:

- **plan.md** — this full plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, context)
- **standards.md** — references only; pin `2781563b9f72897bcab8ea38b7d288dc42d8c7e9`
- **references.md** — governing specs and code studied
- **visuals/** — none

Then stop. Implementation starts in a fresh session at Task 2.

## Task 2: Calendar kind, presets, and matchers

Add `calendar` to `FilterKind`. In `src/lib/grid/filters.ts` (and `customFilter.ts` for the kind / `operatorsForKind`):

- `CALENDAR_DATE_PRESETS` with the five ids/labels above.
- `presetOptions("calendar")` returns that list; `presetOptions("date")` is unchanged.
- Matching: a `calendar` column uses the new bands; a `date` column still uses `matchesDeadline`.
- `(This Month)` / `(Last Month)` / `(This Year)` via `monthKeyOf` + `monthEndKey` (already leap-aware). Rolling windows via `shiftDays`, inclusive of today.
- `operatorsForKind("calendar")` = date compare ops so Custom and Activity `gte`/`lte` still parse.
- `matchesCustom` treats `calendar` like `date` for comparisons.
- Unit tests in `filters.test.ts` (and custom-filter tests if operators need a case): one per band, year/month edges, inclusive today, `today === null`, blanks, unknown id does not hide.

Do not change Register wiring in this task.

## Task 3: Register Date column and All Transactions default

- `registerFields.date.filterKind = "calendar"` (Posted stays `"date"`).
- All Transactions `GridDefaults.filters` includes Date = `(This Month)`.
- Entering All Transactions **reseeds** Date to This Month so existing `grid:finances` blobs (no Date key, or a leftover Achieve id) do not keep showing all history. Other stored filters stay. Named-view scopes are not reseeding.
- `/finances/register` initial `parseRegisterQuery` includes the This Month options-filter so the RSC index is already month-scoped.
- Activity `activityViewFilters` unchanged (custom month bounds). Uncategorized defaults unchanged.
- Register query / chip tests: All Transactions default is This Month; Activity month is still the linked month; a stored named-view Date is left alone.

## Task 4: Verify, freeze spec, update roadmap

- Confirm acceptance criteria in the app (desktop Date funnel + chip; switch bands; leave and return; Activity from a non-current Budget month; Tasks Deadline still Achieve).
- Update plan/shape for any material as-built drift; complete **Changes from original plan**.
- Mark files **Status: frozen / complete** (date); leftover ideas go under **Follow-ups (new work)**.
- Note under `agent-os/product/roadmap.md` Financial planning that Register Date uses calendar bands and defaults to This Month.

**Follow-ups (not this spec):** Posted column on the same calendar list; SQL `from`/`to` so the ledger is not loaded when a month band is on; Last Year; Uncategorized defaulting to This Month.

---

Frozen 2026-09-04. Further change is a new delta-spec, not an edit to this folder.
