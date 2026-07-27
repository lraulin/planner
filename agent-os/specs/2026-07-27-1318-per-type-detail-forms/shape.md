# Per-Type Detail Forms — Shaping Notes

## Scope

Build the **right-sliding detail drawer** and the per-type forms it holds, at full Achieve
parity for **Result Areas and Projects**:

- **Result Area** — 6 tabs: General, Mission, Vision, Wish, S.W.O.T, Notes
- **Project** — 11 tabs: General, Objectives, Vision, Stakeholders, Risks, Strategy, Team,
  Contacts, Issues, Attachments, Details

**Amended 2026-07-27:** Goal and Task captures arrived the same afternoon, so all four types
landed at full parity in one spec rather than two. See **Round two** below.

This is the third Phase 1 item in `agent-os/product/roadmap.md`, and the first work to
actually implement `standards/components/drawer-pattern.md` — until now that standard
described a pattern nothing had built.

### Also delivered, because this work unblocks them

- **The 🟡 priorities & scheduling item.** Effort Left, Actual Effort, and % complete are
  stored and rolled up today but only reachable from the seed. The Task form makes them
  editable.
- **The `window.confirm` deviation.** `ux-principles.md` flags the outline's delete flow as
  a known deviation to fix "when the drawer work lands". The `ConfirmDialog` built here for
  unsaved changes serves delete too.

### Out of scope

- ~~**Goal and Task full forms.**~~ Delivered in round two, below.
- **Recurrence.** Achieve's Project toolbar has a Recurrence dialog; there is no recurrence
  model in the schema and adding one is its own spec.
- **Labels, resource pools, and the resource-assignment dialog.** Multi-user concepts that
  mean nothing at personal scale today.
- **Templates.** Achieve's New Project dialog offers a Template picker.
- **Attachments as real files.** The Attachment row stores a title, description, and URL;
  no upload, no blob storage.

## Decisions

- **One `node_items` table with a `kind` discriminator**, not a table per list. Achieve's
  two forms hold 14 repeating child lists (Objectives, Priorities/Constraints, Candidate
  Strategies, Stakeholders, Risks, Roles, Contacts, Issues, Attachments, Guiding
  Principles, and the four Wish quadrants). They share the same shape — an ordered list of
  priority + title + description rows with a few extra fields each — so they share one
  table, one CRUD action set, and one sub-grid component driven by a per-kind config. A
  table per list would mean ~14 migrations and ~14 near-identical action sets.
  Rejected JSONB for the per-kind extras: it would cost Drizzle typing on exactly the
  fields most likely to want querying later (risk severity, issue resolved).

- **`Enter` opens the drawer; `F2` renames inline.** Achieve opens the form on `Enter`, and
  `F2` is the Windows rename convention its users already know. A visible open-record button
  on the selected row keeps the gesture discoverable, per `ux-principles.md` ("prefer
  explicit, discoverable actions over hidden gestures"). `Cmd+Enter` stays bound to
  insert-sibling.

- **Sub-grid rows expand inline; no nested modals.** Achieve opens a modal on top of a
  modal to edit an Objective or a Risk. That is precisely the container behaviour
  `ux-principles.md` exists to leave behind, so a row expands into an editor within its
  tab instead.

- **Rollups render read-only.** Project General shows Expected Effort, Effort to Date,
  Effort Left, and % complete. All four are computed from descendants by `derive()`, so
  they display but do not edit — "never offer an editor whose result would be invisible
  behind a computed value."

- **Most of these fields will stay empty, and that is the point.** Lee's framing during
  shaping: the excessive level of detail was a large part of Achieve's charm, and filling
  a form in occasionally is a brainstorming aid. Parity is the goal, not utilisation.

- **The drawer fetches on open via a server action**, seeded with the `OutlineNode` the
  grid already holds. Keeps `loadOutline` from growing, and gives the form its rollups
  without recomputing them. Considered and rejected: a URL search param with server-rendered
  content, which would be linkable but forces a round trip on every open and splits the
  outline's selection state across the client/server boundary.

## Context

- **Visuals:** `visuals/project_form/` (22), `visuals/result_area_form/` (6),
  `visuals/goal_form/` (14), `visuals/task_form/` (6), and `visuals/wishes_form/` (1),
  copied from the repo-root `screenshots/`. Every tab and every sub-grid editor dialog of
  all four forms is captured.
- **References:** See `references.md` — all in-repo, from the Outline tab spec.
- **Product alignment:** Confirmed against `mission.md` ("Achieve's exact workflow" —
  hence parity rather than a curated subset) and `tech-stack.md` (every table carries
  `user_id`; Postgres via Drizzle; free tier).

## Standards Applied

- **`components/ux-principles.md`** — the decision guide drives every choice above: grid +
  drawer over modal, tabs for form sections, inline editing reserved for grid columns,
  read-only rollups, validate on blur, allow partial saves, confirmation dialogs for
  destructive actions only.
- **`components/drawer-pattern.md`** — the drawer's structure, width, positioning, focus
  handling, open/close flow, unsaved-changes prompt, and the server-action save contract
  (check the error first, close only on success).

---

## Round two — Goal and Task (2026-07-27, same day)

Round one shipped Result Area and Project and deferred Goal and Task for want of reference
captures. Lee captured them a couple of hours later, along with the Wish List, so both forms
were built to the same parity rather than being spun out into a follow-up spec.

### What the captures settled

- **A Dream is a Goal with a checkbox ticked.** Achieve has no Dream entity. Its Goal form
  carries a `Dream` checkbox beside a `Range` dropdown, and the form is otherwise identical.
  `node_type` stays four values. The old "Dreams/Goals" phrasing in
  `specs/2026-07-27-1100-scaffold-and-outline-tab/shape.md` has been corrected in place.
- **A Wish is one record with a Type**, not four kinds — Title, Result Area, Priority, Type,
  Description, **Purpose** — surfaced on its own top-level **Wish List** tab that groups
  across result areas. Our four `wish_*` kinds encode that Type in the discriminator, which
  yields the same rows and makes the future Wish List tab a query over four kinds. Kept as
  is; `purpose` was the one genuinely missing field and has been added.
- **Achieve's task states number nine, not five.** Postponed, Delegated, Should Delegate,
  and Proposed joined the enum. Delegated and Should Delegate carry real weight in the
  weekly review — "who else could do this" is a step of the process, not a synonym for
  Waiting.

### Decisions

- **Goal gets all twelve tabs**, including Progress. That tab is closer to a time-series log
  than a form — review cadence, dated scores, dated wins — but the log is the point of it,
  and modelling it as two dated `node_items` lists cost nothing beyond two more kinds.
- **Goal Progress and Goal Wins lead with a date and carry no priority.** Every other list
  in the app is priority + title; these two are the exception, which the per-kind column
  config already handles without a second renderer.
- **Task Contacts and Attachments reuse the Project kinds.** The payoff of one `node_items`
  table: a list appearing on two forms is one config and one renderer, not two of each.
- **Goal Team reuses the `role` kind**, with `assignedTo` added. Achieve's Goal Team grid has
  that column and its Project Team grid does not; one kind serves both and the field is
  simply left blank on projects.
- **`Range` is free text, not an enum.** Only "1-Year" is legible in the capture, so the
  option list is unknown. A guessed enum would bake a wrong constraint into a migration;
  widening text later is free. **Worth correcting once the real list is known.**
- **State labels were consolidated.** Three copies of the state list existed (outline grid,
  its row, the forms). Widening the enum would have left two of them behind, so they now
  read from `STATE_LABELS` / `STATE_OPTIONS` in `src/lib/tree/hierarchy.ts`.

### Still out of scope

Recurrence, templates, labels, resource pools, and file upload for attachments — unchanged
from round one. Newly noted from these captures, and **not** built:

- The **Wish List**, **Goals**, and **Life Plan** top-level tabs. The data behind Wish List
  now exists; the tab itself is a separate piece of work.
- **Resource assignments** on the Task Schedule tab, which need the resource model that
  round one already declared out of scope.
- Achieve's **Scorecard** view. The `scorecard` flag is stored; nothing renders it.
