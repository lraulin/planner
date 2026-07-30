# Inbox & Quick Task Entry — Shaping Notes

**Status: frozen / complete** (2026-07-30)

## Scope

A GTD capture path into the planner:

1. **An Inbox** — a real project, flagged `is_inbox`, holding items you have not yet decided
   about. Visible at the top of the Outline.
2. **A quick entry box** — opened with `c` from any tab, multi-line, Enter to add. Parses
   indentation into subtasks and tolerates pasted list formats. Optional Priority / Effort /
   Deadline / Contexts / Project fields.
3. **A hierarchy relaxation** — anything may sit at the top level; a child may be the same
   rank or deeper than its parent, never shallower.

### Out of scope

- **External intake** — Apple Reminders (via a Shortcut) and Alfred. Follow-up spec; needs a
  provenance/dedupe column, and the roadmap gets the staged plan.
- **An `/inbox` tab.** Processing happens in the Outline by dragging, and during weekly
  planning. Reconsider if the Outline turns out to be the wrong place to sit and process.
- **A "Move to…" picker.** Only needed if the inbox lives somewhere you cannot drag from.
- **Achieve's filtered tree project picker.** Already a known-open polish item on the frozen
  main-grid-tabs spec; the capture box uses the plain select in the meantime.
- **Grouping the Tasks tab by project**, which Achieve always does. Real gap, unrelated to
  capture — recorded as a follow-up.
- **`<New Tasks>`** — Achieve's sub-project under `<Inbox>`. Cut.
- **A distinct "inbox item" type**, and **categories** (Achieve's Personal / Work top-level
  grouping) as a home for the inbox. Both rejected — see below.
- Achieve's "open information form after adding tasks" and "activate app when tasks added".

## Decisions

The full table is in `plan.md`. The reasoning worth preserving:

**Why not "a task with no parent is an inbox item".** This was the first design, and it is
wrong. It needs no schema change and no container, which is seductive. But a top-level task
is a legitimate resting state: if you already know exactly what the thing is and it does not
need a home, the system should not demand one. That is the whole anti-busywork argument for
relaxing the hierarchy in the first place. Making "no parent" _mean_ "not yet decided"
takes that state away and quietly reintroduces the filing work it was meant to remove.

**Why the container is not a hack.** The objection to Achieve's `<Inbox>` project is that
its project fields are meaningless. They are not, once the project is named honestly: its
job is "decide what these are and what to do about them." That is a real project, with real
tasks, and it makes sense to complete it — and to have it reopen when new unprocessed items
arrive. Priority D is right. `IP` is right.

**Why not a separate item type.** Processing an item should be nothing more than moving it.
A distinct type makes processing a type conversion, and breaks immediately on a captured
item that already carries a date or a priority — which happens as soon as intake comes from
somewhere richer than a text box.

**Why not a category.** Categories are not implemented (only free text on
`result_area_details.category`), are of low value to the author, and are largely redundant
with Result Areas. Making the inbox depend on building them first is backwards.

**Why the hierarchy rule changes at all.** Both blockers are in one array. Achieve's own UI
confirms the looser rule: its project picker offers `<No Project>`, and its outline shows a
task ("Get meds") directly under a Result Area. The rank comparison is also less code than
the table it replaces, and the table was already implementing "same rank or deeper" for
three of the four types — result area was the only asymmetry.

## Context

- **Visuals:** `screenshots/Inbox project.png`, `screenshots/Quick task entry box.png`,
  `screenshots/task_tab/Screenshot 2026-07-30 at 10.10.30 AM.png`,
  `screenshots/task_tab/Screenshot 2026-07-30 at 10.10.50 AM.png`. Referenced in place;
  see `references.md`.
- **References:** `src/lib/tree/{hierarchy,dnd,mutations,queries,slice}.ts`,
  `src/lib/notes/{editing,snippet}.ts`, `src/components/shell/TabStrip.tsx`,
  `src/components/detail/{ConfirmDialog,focus}.tsx`, `src/components/notes/NoteFilterDialog.tsx`,
  `src/app/outline/actions.ts`, `src/lib/detail/mutations.ts`, `src/lib/agent/tools.ts`.
- **Product alignment:** Roadmap Phase 2 "Quick capture to inbox"; `mission.md`'s GTD
  lineage — capture, then process on your own schedule.

## Standards Applied

- **development/testing** — the parser is exactly the "tricky pure logic where a wrong
  answer looks plausible" case; the mutation gets an integration test with a cross-user
  block. No React component tests.
- **components/ux-principles** — "keyboard first" and "minimise required fields" drive the
  design; **"never use a modal for a create flow" is departed from**, with reasoning in
  `standards.md`.
- **api/agent-tools**, **api/error-handling** — only for the `create_node` guard relaxation.

## Verification

Via the `run-planner` skill (dev server + Postgres + browser):

1. `npm run test:unit`, then `npm run test:integration` — **confirm it did not print the
   skip warning.** DB tests silently skip when Postgres is down, and this spec's isolation
   guarantees live only there.
2. `npm run db:migrate`, then `npm run typecheck && npm run lint && npm run build`.
3. Press `c` on the Outline and paste a mixed-format list:

   ```
   - Call the dentist
       * Find the insurance card
       1. Check the copay
   [ ] Renew registration ## expires end of month
   ```

   Four tasks land under a new `Inbox` at the top of the outline, nesting correct, markers
   gone, a note on the last one.

4. Press `c` while renaming a cell, and with a detail drawer open — the box must not open.
5. Drag an inbox task onto a project; it leaves the inbox. Drag a result area over a task
   deep inside a project; the drop line must still snap out — to the enclosing result area
   (as a sub-area), since result areas now nest.
6. Tasks tab: captured tasks appear as ordinary rows, no exceptions.
7. Rename the Inbox to "Triage", capture again → same project. Complete it, capture →
   reopens. Delete it, capture → a fresh `Inbox`.
8. Agent API, root-level task:

   ```bash
   PLANNER_BASE_URL=http://localhost:3000 \
     ~/Code/planner-agent/scripts/call-tool.sh create_node '{"type":"task","name":"root task"}'
   ```
