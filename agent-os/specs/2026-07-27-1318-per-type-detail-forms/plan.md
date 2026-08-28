# Per-Type Detail Forms (Result Area + Project)

**Status: frozen / complete** (2026-07-27)  
Spec folder: `agent-os/specs/2026-07-27-1318-per-type-detail-forms/`

> Status classified retroactively on 2026-08-27. This spec predates the status-line
> convention and carries no acceptance checkboxes; the date above is its last
> implementation commit. It is a historical as-built record — further change opens a
> new delta-spec.

## Context

The Outline tab is delivered: the hierarchy renders, and the fields that appear as grid
columns are editable inline. But `agent-os/product/roadmap.md` lists **Per-type detail
forms** as the next unstarted Phase 1 item, and the fields that _don't_ fit on a row have
nowhere to live — Achieve's Project form has 11 tabs and its Result Area form has 6, and
none of that is reachable today. Two other things are blocked behind it: Effort Left,
Actual Effort, and % complete are stored and rolled up but only reachable from the seed
(the 🟡 roadmap item), and `ux-principles.md` records a known deviation — the outline's
delete flow uses `window.confirm` — to be fixed "when the drawer work lands".

The goal is full Achieve parity for **Result Areas and Projects**, including the repeating
child lists (Objectives, Risks, Stakeholders…). Most of these fields will sit empty most of
the time; that is fine and intended. Filling them in is a brainstorming aid, and the
excessive level of detail is a large part of what made Achieve worth reimplementing. Goals
and Tasks get a minimal drawer over the schema that already exists so no row has a dead
gesture; their full forms wait on reference captures.

## Decisions made while shaping

- **Storage for the 14 repeating lists:** one `node_items` table with a `kind`
  discriminator, shared columns, and nullable typed columns for the per-kind extras. One
  migration, one CRUD action set, one reusable sub-grid component.
- **Goals and Tasks:** minimal single-pane drawer now, over existing schema.
- **Open trigger:** `Enter` / double-click opens the drawer (as Achieve does); `F2` takes
  over inline rename; a small open-record button appears on the selected row.
  `Cmd+Enter` stays bound to insert-sibling.
- **Nested editing:** Achieve opens a modal on top of a modal to edit a sub-grid row. We
  don't — the row expands into an inline editor within the tab (`ux-principles.md`).

## Task 1: Save spec documentation

Create `agent-os/specs/2026-07-27-1318-per-type-detail-forms/` with:

- **plan.md** — this plan
- **shape.md** — scope, the four decisions above, and their rationale
- **standards.md** — full text of `components/ux-principles.md` and
  `components/drawer-pattern.md` (both apply directly: the drawer _is_ the pattern these
  documents describe, and this is the first work to implement it)
- **references.md** — pointers to `src/app/outline/actions.ts` (server-action shape),
  `src/lib/tree/mutations.ts` (user-scoped mutation style), `src/lib/tree/format.ts`
  (effort/priority parse+format to reuse in fields), `src/lib/tree/sortKey.ts`
  (`between`, reused for sub-list ordering), and `src/lib/tree/mutations.test.ts`
  (integration-test harness to copy)
- **visuals/** — copies of `screenshots/project_form/` and `screenshots/result_area_form/`

## Task 2: Schema

New migration via `npm run db:generate`. In `src/db/schema.ts`:

- **`project_details`** (nodeId PK → `nodes.id` cascade). General: `projectStart`,
  `targetEnd`, `effortDriven`, `onlyShowNextTask`, `leadTimeMinutes`, `blockSizeMinutes`,
  `sensitivity`, `assignedTo`, `place`, `timePerWeekMinutes`, `reminderAt`,
  `recomputeTaskDeadlines`. Objectives: `purpose`. Vision: `idealVision`,
  `sufficientVision`. Strategy: `strategy`. Details: `billingInformation`, `company`,
  `mileage`, `expectedCost`, `lowCost`, `highCost`, `costToDate`, `description`.
- **`result_area_details`** (extend existing): `description`, `importance`, `reason`,
  `mission`, `idealOuterVision`, `idealInnerVision`, `strengths`, `weaknesses`,
  `opportunities`, `threats`. The Notes tab maps to the existing `nodes.notes`.
- **`node_items`** — `id`, `userId`, `nodeId` (cascade), `kind` (new pgEnum), `sortKey`,
  `priorityLetter`, `priorityRank`, `title`, `description`, plus nullable extras:
  `criteria`, `stakeholders`, `itemType`, `stake`, `severity`, `probability`, `detection`,
  `prevention`, `mitigation`, `advantages`, `disadvantages`, `decision`, `idealCandidate`,
  `candidates`, `filled`, `filledBy`, `association`, `contact`, `source`, `resolution`,
  `resolved`, `url`. Index on `(userId, nodeId, kind, sortKey)`.
  `kind` values: `objective`, `constraint`, `strategy`, `stakeholder`, `risk`, `role`,
  `contact`, `issue`, `attachment`, `guiding_principle`, `wish_want_dont_have`,
  `wish_dont_want_have`, `wish_want_have`, `wish_want_avoid`.

Issues' "Summary" and Contacts' "Name" map onto `title`. `itemType` carries both the
Stakeholder type (Owner/Sponsor/Customer/Supplier/Indirect/Investor/Other) and the Role
type (Mentor/Partner/Support/Talent/Worker/Other); the option list comes from the per-kind
config, not the column. Recurrence, labels, and resource pools are out of scope.

Every table carries `userId` and every query scopes by it, per `tech-stack.md`.

## Task 3: Data layer

New `src/lib/detail/queries.ts` and `src/lib/detail/mutations.ts`, following the
user-scoped style of `src/lib/tree/mutations.ts`:

- `loadNodeDetail(userId, nodeId)` — the type-detail row plus `node_items` grouped by kind.
  `loadOutline` is untouched, so the outline query does not grow.
- `saveNodeDetail(userId, nodeId, values)` — one transaction: update the core `nodes`
  fields, upsert the type-detail row.
- `createNodeItem` / `updateNodeItem` / `deleteNodeItem` / `moveNodeItem` — ordering via
  the existing `between()` in `src/lib/tree/sortKey.ts`.

Actions in `src/app/outline/detail-actions.ts`, reusing the `run()` wrapper convention from
`src/app/outline/actions.ts` (`{ ok: false, error }` rather than throwing, `revalidatePath`
on success). Add a `runQuery<T>` sibling that returns `{ ok: true, data }` and does **not**
revalidate, for the read path.

## Task 4: Drawer shell and confirmation dialog

New `src/components/detail/`:

- **`Drawer.tsx`** — backdrop, right panel, `w-full sm:w-[90%] md:max-w-[45rem]`, mounted
  below the `TabStrip` so app chrome stays clickable. Escape and backdrop click close,
  focus trapped while open, focus returned to the row that opened it. No inline transition
  — `globals.css` already handles `prefers-reduced-motion`.
- **`ConfirmDialog.tsx`** — replaces `window.confirm` at
  `src/components/outline/OutlineGrid.tsx:207`, and serves the unsaved-changes prompt.
- **`fields/`** — `TextField`, `TextArea`, `SelectField`, `CheckboxField`, `DateField`,
  `MoneyField`, `ReadOnlyField`, plus `EffortField` and `PriorityField` that reuse
  `parseEffort` / `formatEffort` / `parsePriority` / `formatPriority` from
  `src/lib/tree/format.ts`. Validate on blur; unparseable input reverts and flags the field.
- **`FormTabs.tsx`** — tabs within the drawer. On save, validate every tab and switch to the
  first one holding an error.

## Task 5: The reusable sub-grid

- **`itemKinds.ts`** — config per kind: label, insert hint, column set, editor fields, and
  `itemType` options. This single table drives all 14 lists.
- **`ItemList.tsx`** — renders one kind: header row, rows in `sortKey` order, `Insert`
  (and a button) to add, `Enter` to expand the selected row into an inline editor, `Delete`
  to remove via `ConfirmDialog`. Mirrors the outline's keyboard conventions.

## Task 6: The forms

- **`ResultAreaForm.tsx`** — General (name, category, priority, description, importance,
  reason) / Mission (mission + Guiding Principles list) / Vision (Ideal Outer, Ideal Inner)
  / Wish (four quadrant lists) / S.W.O.T (four panes) / Notes.
- **`ProjectForm.tsx`** — General / Objectives (purpose + list) / Vision / Stakeholders /
  Risks / Strategy (Priorities-Constraints list, strategy text, Candidate Strategies list) /
  Team / Contacts / Issues / Attachments / Details. On General, Expected Effort, Effort to
  Date, Effort Left and % complete render **read-only** — they are rollups, and
  `ux-principles.md` forbids an editor whose result is invisible behind a computed value.
- **`SimpleNodeForm.tsx`** — Goal and Task, single pane. Task adds Effort, Effort Left,
  Actual Effort, % complete and contexts, which closes out the 🟡 roadmap item.
- **`NodeDetailDrawer.tsx`** — picks the form by node type, owns dirty state and save.
  Seeded with the `OutlineNode` the grid already holds (so rollups are available without a
  second computation) and awaits `loadNodeDetail` for the rest. Guard on
  `{open && node && detail && …}`; key the form on node id. On save: check the error first,
  stay open and render it inline if the save failed; close only on success.

## Task 7: Wire into the outline

In `src/components/outline/OutlineGrid.tsx` and `OutlineRow.tsx`:

- Add `detailId` state and an `openDetail` command.
- Keymap: `Enter` → `openDetail`, `F2` → inline rename (currently `Enter` at
  `OutlineGrid.tsx:412`). Double-click on the name opens the drawer rather than the editor.
- Add an open-record button to the selected row.
- Replace `window.confirm` in `removeSelected` with `ConfirmDialog`.
- Update `HintBar.tsx` for the new bindings.

## Task 8: Tests and docs

- Integration tests for the new mutations under local Postgres, copying the harness in
  `src/lib/tree/mutations.test.ts` (own user per test, `describe.skip` without
  `DATABASE_URL`): detail upsert round-trip, item ordering, cascade delete with the node,
  and cross-user scoping.
- Unit test that every `kind` in the enum has an entry in `itemKinds.ts`.
- Update `agent-os/product/roadmap.md`: mark per-type detail forms delivered, note Goal and
  Task forms as outstanding, and close out the 🟡 priorities item.
- Remove the `window.confirm` known-deviation note from
  `agent-os/standards/components/ux-principles.md`.

## Verification

1. `npm run db:up`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`.
2. `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`.
3. `npm run dev`, then in the browser at `/outline`:
   - Select a Result Area, press `Enter` → drawer opens with the outline still visible
     behind it. Walk all six tabs; type into Mission and SWOT; add a Guiding Principle and
     two Wish items with `Insert`; save; reopen and confirm everything persisted.
   - Select a Project, press `Enter` → walk all eleven tabs. Add an Objective, a Risk with
     severity and probability, a Stakeholder with a type, a Candidate Strategy, a Role, a
     Contact, an Issue, and an Attachment. Confirm Expected Effort and % complete are
     read-only and match the outline's rollup for that row.
   - Enter an unparseable effort (`"soon"`) → field flags and reverts, save stays enabled.
   - Edit a field, press Escape → unsaved-changes dialog. Cancel keeps the drawer open with
     the edit intact.
   - `F2` on a row still renames inline; `Cmd+Enter` still inserts a sibling; `Tab` /
     `Shift+Tab` still indent and outdent.
   - Delete a row with children → the new confirmation dialog, not the browser's.
   - Tab through the open drawer to confirm focus is trapped; close and confirm focus
     returns to the originating row.
   - Narrow the window to phone width → the drawer goes full-width and the page does not
     scroll horizontally.
