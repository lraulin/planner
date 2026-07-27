# References for Per-Type Detail Forms

Unlike the Outline tab spec, this one builds on real code. Everything below is in-repo and
was read during shaping.

## In-Codebase Patterns to Follow

### Server actions

- **Location:** `src/app/outline/actions.ts`
- **Relevance:** the drawer saves through server actions; `drawer-pattern.md` names this
  file explicitly as the pattern to follow.
- **Key patterns:**
  - A `run()` wrapper resolves `getCurrentUserId()` itself, so no caller can pass a user in.
  - Actions return `{ ok: false, error }` rather than throwing — an illegal operation is a
    normal outcome the UI renders inline, not a crash.
  - `revalidatePath("/outline")` on success; there is no separate refresh call.
  - **Extension needed:** a `runQuery<T>` sibling returning `{ ok: true, data }` that does
    _not_ revalidate, for the drawer's read path.

### User-scoped mutations

- **Location:** `src/lib/tree/mutations.ts`
- **Relevance:** `src/lib/detail/mutations.ts` mirrors its signatures and scoping.
- **Key patterns:**
  - Every function takes `userId` first and scopes every query on it.
  - `requireNode(tx, userId, nodeId)` throws a clear message when a row is missing or
    belongs to someone else — copy this for `requireItem`.
  - `Executor` type alias (`Db | Tx`) lets helpers run inside or outside a transaction.

### Value parsing and formatting

- **Location:** `src/lib/tree/format.ts`
- **Relevance:** the drawer's Effort and Priority fields must accept and render exactly what
  the grid cells do. **Reuse, do not reimplement.**
- **Key patterns:** `formatEffort` / `parseEffort` (`"45 min"`, `"2 h"`, `"3:45 h"`,
  `"3 d"`), `formatPriority` / `parsePriority` (`"A1"`, bare `"A"`). Both parsers return
  `undefined` for unrecognised input, distinct from `null` for cleared — which is what makes
  "revert and flag the field" possible.

### Sibling ordering

- **Location:** `src/lib/tree/sortKey.ts`
- **Relevance:** `node_items` rows are ordered lists. Reuse `between()` rather than integer
  positions, for the same reason the outline does: a move rewrites one row.

### Integration-test harness

- **Location:** `src/lib/tree/mutations.test.ts`
- **Relevance:** the template for the new detail-mutation tests.
- **Key patterns:** `describe.skip` when `DATABASE_URL` is absent, a fresh user per test so
  seeded dev data is never touched, cleanup in `afterAll`, and assertions on readable
  `"depth:name"` strings rather than raw rows.

### Grid, selection, and keyboard

- **Location:** `src/components/outline/OutlineGrid.tsx`, `OutlineRow.tsx`, `HintBar.tsx`
- **Relevance:** where the drawer is wired in.
- **Key patterns:**
  - Optimistic edits layer over server state via `patches`; there is no local copy of the
    tree. `apply()` clears the patch layer once the server answers, either way.
  - `useOutlineKeyboard` binds to `document` and bails while a field has focus. The `Enter`
    → `F2` swap happens in its switch.
  - `window.confirm` at `OutlineGrid.tsx:207` is the deviation this spec removes.
  - `GRID_TEMPLATE` is exported from `OutlineGrid.tsx` and shared with the row — the
    sub-grid should use the same shared-template approach for its own columns.

### Design tokens

- **Location:** `src/app/globals.css`
- **Relevance:** the drawer must look like the outline, not like a bootstrapped form.
- **Key patterns:** `--surface` / `--surface-raised` / `--rule` / `--ink-muted` and the four
  priority hues, all exposed to Tailwind through `@theme inline`. `prefers-reduced-motion`
  is handled globally, so the drawer adds no inline transition.

## External Reference: Effexis Achieve Planner

- **Location:** `visuals/project_form/` and `visuals/result_area_form/` in this spec folder;
  originals in the repo root `screenshots/`.
- **Relevance:** the authoritative source for tabs, field names, and sub-grid columns.

### Result Area form (6 tabs)

| Tab     | Contents                                                                           |
| ------- | ---------------------------------------------------------------------------------- |
| General | Name, Category, Priority, Description, Importance, Label, Default Resource, Reason |
| Mission | Mission (prose) + **Guiding Principles** list (Priority, Title, Description)       |
| Vision  | Ideal Outer Vision, Ideal Inner Vision                                             |
| Wish    | Four lists: Want and Don't Have, Don't Want and Have, Want and Have, Want to Avoid |
| S.W.O.T | Strengths, Weaknesses, Opportunities, Threats (four prose panes)                   |
| Notes   | Free prose — maps onto the existing `nodes.notes`                                  |

### Project form (11 tabs)

| Tab          | Contents                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General      | Name, Focus, Priority, Project Start, Target End, Deadline, Expected Effort*, Effort to Date*, Effort Left*, % complete*, Subprojects*, Tasks*, Scheduling Status*, Effort Driven, Only show next task in chooser, Reminder, Type, Status, Sensitivity, Lead Time, Assigned To, Block Size, Result Area*, Project Notes, Recompute task deadlines, Contexts, Place, Time per week |
| Objectives   | Purpose (prose) + **Objectives** list (Priority, Title, Description, Criteria, Stakeholders)                                                                                                                                                                                                                                                                                      |
| Vision       | Ideal Vision, Sufficient Vision                                                                                                                                                                                                                                                                                                                                                   |
| Stakeholders | List: Priority, Title, Type (Owner/Sponsor/Customer/Supplier/Indirect/Investor/Other), Description, Stake                                                                                                                                                                                                                                                                         |
| Risks        | List: Priority, Title, Description, Severity, Probability, Detection, Prevention, Mitigation                                                                                                                                                                                                                                                                                      |
| Strategy     | **Priorities/Constraints** list (Priority, Title, Description), Strategy prose, **Candidate Strategies** list (Priority, Title, Description, Advantages, Disadvantages, Decision)                                                                                                                                                                                                 |
| Team         | **Roles** list: Title, Type (Mentor/Partner/Support/Talent/Worker/Other), Description, Ideal Candidate, Priority, Candidates, Role Filled, By, Pool                                                                                                                                                                                                                               |
| Contacts     | List: Name, Association, Contact                                                                                                                                                                                                                                                                                                                                                  |
| Issues       | List: Priority, Source, Summary, Description, Resolution, Resolved                                                                                                                                                                                                                                                                                                                |
| Attachments  | List: Priority, Name, Description, URL                                                                                                                                                                                                                                                                                                                                            |
| Details      | Billing Information, Company, Mileage, Expected Cost, Low Cost, High Cost, Cost to Date, Description, Created*, Modified*, Completed                                                                                                                                                                                                                                              |

`*` = derived or structural in our model; renders read-only or is already covered by the
tree (Result Area is the ancestor; Type is `nodes.type`; Subprojects/Tasks are child counts;
Created/Modified are existing timestamps).

### Conventions worth keeping

- Sub-grids prompt in their header: _"press `<Insert>` key to add new row, `<Ctrl+Enter>` to
  edit row"_ — matching the outline's own Insert convention.
- Priorities appear on nearly every sub-grid row, in the same `A1` notation as the outline.
