# References — Inbox & Quick Task Entry

## Screenshots

`screenshots/` (referenced in place rather than copied into `visuals/` — both paths are
gitignored, so copying only duplicates local files):

| File                                                | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Inbox project.png`                                 | Achieve's Outline with `<Inbox>` (IP, priority D, deadline 7/31/26) as a **top-level project** under Category `<None>`, its `<New Tasks>` child project, and one captured task. Also shows "Get meds" — a **task sitting directly under the Health & Fitness Result Area**, which is the evidence that the strict `LEGAL_PARENTS.task` rule was never Achieve's rule                                                                                    |
| `Quick task entry box.png`                          | The Quick Task Entry dialog: textarea, the hint _"You can add a Note for each task using ## to separate the task name and note (multiline notes not supported)"_, Priority / Effort / Deadline / Context / Project fields, and the three checkboxes — "Enter multiple tasks (one per line) with indent to create subtasks" (checked), "Open information form after adding tasks", "Activate Achieve Planner when tasks added". Add / Close buttons      |
| `task_tab/Screenshot 2026-07-30 at 10.10.30 AM.png` | Achieve's Tasks tab **always grouped by project**: `Project : <Inbox>\<New Tasks> (5 items)`, `Project : Bigger muscles/V-shape (1 item)`, `Project : Get meds (1 item)`. Note the group label is a backslash **path** for nested containers, and that "Bigger muscles/V-shape" is a **Goal** yet still labeled "Project" — a goal hosting direct tasks is treated as their project for grouping. "Group by Area" is a separate checkbox layered on top |
| `task_tab/Screenshot 2026-07-30 at 10.10.50 AM.png` | The Select Project dialog (Achieve's project picker): filter box + Clear, a tree with priorities in parens, `<All Projects>`, `<Inbox>` → `<New Tasks>`, and **`<No Project>`** — first-class confirmation that a task need not be under a project. Checkboxes: Show Completed Projects, Group by Result Area, Show Deferred                                                                                                                            |

The first and third screenshots between them justify the two halves of the hierarchy change:
a project at root, and a task under a result area.

## Code to follow

| Need                                                    | Existing example                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The rule being replaced                                 | `src/lib/tree/hierarchy.ts` — `LEGAL_PARENTS`, `canNest`, `assertCanNest`, `defaultChildType`                                                                                                    |
| Every caller of that rule                               | `createNode` and `moveNode` in `src/lib/tree/mutations.ts`; `resolveDrop` in `src/lib/tree/dnd.ts` (also names `LEGAL_PARENTS` in a doc comment)                                                 |
| Node creation to reuse verbatim                         | `createNode` in `src/lib/tree/mutations.ts` — transaction, `assertCanNest`, `sortKeyFor`, per-type detail row insert                                                                             |
| Sibling ordering                                        | `src/lib/tree/sortKey.ts` — `between`, `first`, `sequence`                                                                                                                                       |
| Applying many fields in one write                       | `saveNodeDetail(userId, nodeId, values)` in `src/lib/detail/mutations.ts` — handles core (priority/deadline/state) **and** `task.effortMinutes` / `task.contexts` together                       |
| Outline read path to extend                             | `loadOutline` in `src/lib/tree/queries.ts` — hand-written recursive CTE; `is_inbox` must be added to its select list and to `OutlineNode` in `src/lib/tree/types.ts`                             |
| Existing list-marker parsing (**lift, do not rewrite**) | `parseListMarker()` in `src/lib/notes/editing.ts` (private — indent + `-*+` + `1.`/`1)` + `[ ]`/`[x]`), `stripLeadingMarkers()` in `src/lib/notes/snippet.ts` (private — also `>` and `#{1,6}`)  |
| Existing scalar parsers to reuse in the dialog          | `parseEffort`, `parsePriority` in `src/lib/tree/format.ts`                                                                                                                                       |
| Integration test harness                                | `src/lib/tree/mutations.integration.test.ts` — `makeUser()`, `describeDb`, `afterAll` cleanup; helpers in `src/lib/testing/database.ts`                                                          |
| The cross-user block to copy                            | `mutations.integration.test.ts` "user isolation" describe — read / rename / delete / move-under all attempted by a second user                                                                   |
| Where to mount the feature                              | `src/components/shell/TabStrip.tsx` — rendered by every authed page including `/schedule/plan`, and **not** by `/login`, so it scopes the shortcut correctly with no pathname guard              |
| Centered modal shell (3 copies to unify)                | `src/components/detail/ConfirmDialog.tsx`, `src/components/grid/ShowFieldsDialog.tsx`, `src/components/notes/NoteFilterDialog.tsx` — identical backdrop + `useModalFocus` + capture-phase Escape |
| Focus management                                        | `useModalFocus` in `src/components/detail/focus.ts`                                                                                                                                              |
| Closest existing dialog to the capture box              | `src/components/notes/NoteFilterDialog.tsx` — a real form with an autofocused text input, unmounted when closed so the draft resets                                                              |
| The keyboard guard idiom (4 copies to unify)            | `useOutlineKeyboard` in `src/components/outline/OutlineGrid.tsx`, `src/components/tabs/useGridTab.ts`, `src/components/notes/NotesGrid.tsx`, `src/components/tabs/WishesGrid.tsx`                |
| Server action shape                                     | `src/app/outline/actions.ts` — the `run()` / `ActionResult` wrapper, `revalidatePath("/", "layout")`                                                                                             |
| Optimistic client writes                                | `useOptimisticNodes` in `src/components/grid/useOptimisticNodes.ts` (`patch` + `apply`)                                                                                                          |
| Form field components                                   | `src/components/detail/fields.tsx` — `ContextsField`, `TextArea`, date and select fields                                                                                                         |
| Toolbar chrome for the trigger button                   | `src/components/tabs/tabChrome.tsx` — `ToolbarButton`, `ToolbarSelect`                                                                                                                           |
| Agent tool to relax                                     | `createNodeTool` in `src/lib/agent/tools.ts`; live docs at `docs/agent-api.md`                                                                                                                   |
| Hand-written migration precedent                        | `drizzle/0006_notes.sql`, `drizzle/0007_better_auth.sql` + `drizzle/meta/_journal.json`                                                                                                          |

## Related specs

| Spec                                                | Relationship                                                                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-27-1100-scaffold-and-outline-tab` (frozen) | **This spec changes behavior it decided.** It established `LEGAL_PARENTS` and the drag snap-out that depends on it. Per the lifecycle rule in `AGENTS.md`, that folder is _not_ edited — this spec is the delta record            |
| `2026-07-28-1121-main-grid-tabs` (frozen)           | Owns the grid keep-filters that inbox items now flow through unchanged, and already lists "Project scope is a select rather than a filtered tree popover" as known-open polish — which is why the capture box uses a plain select |
| `2026-07-29-1045-notes-markdown-editor` (frozen)    | Source of the marker-parsing helpers being lifted, and the precedent for documenting a deliberate departure from `drawer-pattern.md` in a spec's `standards.md`                                                                   |
| `2026-07-29-1500-ai-interoperability` (frozen)      | Owns `create_node`, whose root guard Task 7 relaxes. Its "Alfred" out-of-scope line is where external intake was first deferred                                                                                                   |
| `2026-07-29-1630-email-password-auth` (frozen)      | Established `getCurrentUserId()` (browser) and `getOwnerUserId()` (machine) as the two identity paths that converge on a plain `userId` in `src/lib/**`                                                                           |

## External

- `/Users/leeraulin/Code/planner-agent` — the sibling instruction repo. `scripts/call-tool.sh`
  is the exact HTTP shape an Apple Shortcut would replicate, and `skills/capture/SKILL.md`
  already encodes capture classification rules (actionable → task, multi-step → project,
  reference → note) including "Tasks only under **project** or **task**", which this spec
  makes obsolete.
- `screenshots/AP Tour - Capturing New Projects & Tasks.mhtml` — Achieve's own tour of the
  capture flow, if more fidelity is ever wanted.
