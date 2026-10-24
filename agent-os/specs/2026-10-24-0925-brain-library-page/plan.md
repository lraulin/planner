# Brain — a PersonalBrain clone as a Library page

**Status: frozen / complete** (2026-10-24)
Spec folder: `agent-os/specs/2026-10-24-0925-brain-library-page/`

Root spec (no governing prior spec). References: Houses (`2026-09-17-0853-houses-library-page`,
new Library page + MCP domain), Timeline ribbon (`2026-08-14-1724-timeline-ribbon`, hand-built
SVG with pure layout in `src/lib`), Notes editor (`2026-07-29-1045-notes-markdown-editor`,
`MarkdownEditor` + `useAutosave`).

## Context

Lee wants PersonalBrain (TheBrain) inside the planner: a network of **thoughts** joined by
**parent/child** and **jump** links, explored through the **plex** — the active thought in
the centre, parents above, children below, jumps to the left, siblings to the right. Click a
neighbour and it animates to the centre. Each thought carries a markdown note.

Achieve has no equivalent; this is personal reference data beside Contacts, Timeline and the
rest of Library. Unlike Houses it is **durable**, not disposable. Thoughts are standalone in
v1 — they do not point at Notes, Contacts or outline nodes.

## Decisions

| Decision             | Choice                                                                                                                                                                                                                                                | Why                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Where                | New `PageEntry` `brain` in the `library` array → `/library/brain`                                                                                                                                                                                     | Library exists; no sidebar/icon work (Houses precedent)                                          |
| Thought              | `brain_thoughts`: name, markdown `note`, nullable `typeId`, `lastVisitedAt`                                                                                                                                                                           | Standalone thoughts                                                                              |
| Links                | `brain_links`: `parentId`/`childId`-style `fromId`,`toId`, `kind` `'child'\|'jump'`, `label` text                                                                                                                                                     | Two kinds cover the plex; siblings are derived, never stored                                     |
| One link per pair    | Unique expression index on `(userId, least(from,to), greatest(from,to))`; CHECK `from <> to`                                                                                                                                                          | PersonalBrain rule; changing kind or flipping direction **updates** the link                     |
| Loops                | Allowed — no ancestry check                                                                                                                                                                                                                           | PersonalBrain is a network, not a tree                                                           |
| Jumps                | Undirected; stored with `from < to` (CHECK when `kind='jump'`)                                                                                                                                                                                        | One canonical row per jump                                                                       |
| Cross-user integrity | Composite FKs `(fromId,userId)` / `(toId,userId)` → `brain_thoughts(id,userId)`                                                                                                                                                                       | Schema makes a cross-user link impossible (precedent: `finance_scenario_lines_scenario_user_fk`) |
| Types                | `brain_thought_types`: name, `color` (palette key from `chartCatVar`)                                                                                                                                                                                 | Colour/identity per thought; one type per thought                                                |
| Tags                 | `brain_tags` + `brain_thought_tags` join, composite user FKs                                                                                                                                                                                          | Many tags per thought                                                                            |
| Home thought         | `isHome` boolean, partial unique index per user                                                                                                                                                                                                       | Page opens on Home, else most recently visited, else empty state                                 |
| Active thought       | URL state `?thought=<id>`                                                                                                                                                                                                                             | Browser back/forward **is** the history; deep-linkable                                           |
| Recent               | Ordered by `lastVisitedAt`, stamped on activation                                                                                                                                                                                                     | Recent-thoughts list without a history table                                                     |
| Plex rendering       | Pure `src/lib/brain/plex.ts` computes positions; client draws absolutely-positioned thought chips over an SVG edge layer; CSS transform transitions keyed by thought id animate recentering                                                           | No graph library (Timeline-ribbon precedent); layout is tested                                   |
| Notes pane           | Right of the plex, `MarkdownEditor` wrapped in `useAutosave`                                                                                                                                                                                          | Same no-Save-button reasoning as notes                                                           |
| Search               | Type-to-jump box (`/` focuses): `ilike` on name, then note, limit 20                                                                                                                                                                                  | Enough at personal scale                                                                         |
| Creating             | On the active thought: "Add child / parent / jump" inline input that autocompletes existing thoughts — choosing one links it, Enter on new text creates it                                                                                            | Avoids duplicate thoughts, the classic PersonalBrain failure                                     |
| Commands             | Every verb (add child/parent/jump, rename, unlink, delete, set type, set home) has a menu entry and a right-click menu on a thought chip                                                                                                              | navigation standard: no command without a menu                                                   |
| Delete               | Confirm via `ModalShell`; cascades its links; neighbours may become orphans (still reachable by search)                                                                                                                                               | Matches PersonalBrain                                                                            |
| Mobile               | Below md: active thought + Parents / Children / Jumps / Siblings as tappable lists, note below; no plex                                                                                                                                               | Desktop is the priority                                                                          |
| MCP                  | New `brain` domain                                                                                                                                                                                                                                    | So Grok can add thoughts and links                                                               |
| Out of scope         | `.brain` import, attachments/files/URLs per thought, links to other app records, Find integration, multiple brains, link types beyond a free-text label, one-way jumps, plex drag-to-link, distant-thought (2nd-degree) display, thought icons/images | Keep v1 to the core plex loop                                                                    |

## Acceptance criteria

- [x] `/library/brain` appears in Library and the ⌘K palette; opens on Home → last visited → empty state with "Create first thought"
- [x] Plex shows parents above, children below, jumps left, siblings right; clicking any neighbour recentres with animation and updates `?thought=`; browser Back returns
- [x] Add child/parent/jump from the active thought; autocomplete links an existing thought instead of duplicating
- [x] A second link between the same two thoughts is impossible; re-linking changes kind/direction in place
- [x] Note autosaves; rename, type (coloured chip), tags, link labels (shown on edge hover/label) all persist
- [x] Search jumps to a thought by name or note text; recent list shows last visited
- [x] Delete asks for confirmation and removes the thought's links
- [x] Phone width shows the stacked-list fallback
- [x] A second user cannot read, link to, change, or delete the first user's thoughts, links, types or tags — at the mutation layer and over MCP
- [x] Grok can list/search, get (with neighbours), create (optionally linked), update, link, unlink, and delete thoughts
- [x] `npm run lint && npm run typecheck && npm test` pass (DB tests actually ran); `npm run smoke` and `npm run smoke:agent` pass

## Changes from original plan

| #   | Change                                                                                                                                                                                               | Why                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Task 2 landed in commit `2df785ac`, not under a Brain message                                                                                                                                        | A parallel session's `git commit` swept the staged migration into its own commit; it was already pushed, so history is left as is |
| 2   | `brain_thought_types.color` is a `smallint` palette index 0–7 (CHECK), not a string key                                                                                                              | `chartCatVar(index)` takes an index; the index follows the theme                                                                  |
| 3   | `brain_thoughts.typeId` FK is composite with **no** ON DELETE action; `deleteThoughtType` clears its thoughts first                                                                                  | `SET NULL` on a composite key would null `user_id` too                                                                            |
| 4   | `linkTo.relation` on create and `linkThoughts(…, relation, otherId)` both mean "what the other thought is to this one"                                                                               | One reading everywhere; a mirrored create was a trap                                                                              |
| 5   | The Recent list is the search box's empty state, not a separate panel                                                                                                                                | One control for "get me to a thought"; empty focus shows Recent, typing searches                                                  |
| 6   | "Set type…" opens a menu at the pointer; Rename, Set type, Home, Unlink, Edit link label and Delete are in the row menu of any neighbour, but Add child/parent/jump and Edit tags only on the centre | The verbs that only make sense for the active thought are not offered on a neighbour                                              |
| 7   | Visits are stamped by a client effect calling `markThoughtVisitedAction` (revalidates nothing), not during render                                                                                    | A GET render that writes is the wrong place for a write, and the stamp must not re-render the plex                                |
| 8   | Edges fade in on recentre rather than sliding with the chips                                                                                                                                         | An SVG endpoint cannot be transitioned portably; chips slide, lines are underneath and fade                                       |
| 9   | `+N more` opens a menu of the hidden neighbours                                                                                                                                                      | The plan only said the chip exists; a chip that cannot be opened loses thoughts                                                   |
| 10  | MCP `type` is a **name that must already exist**; an unknown name fails before any write and lists the types                                                                                         | Agents should not mint types (and their colours) as a side effect; types are managed on the Brain page                            |
| 11  | `createThought` takes `typeId` and `tags` inside its transaction                                                                                                                                     | A replayed `create_thought` returns `created: false` and skips them, so applying them afterwards would lose them on a retry       |
| 12  | "Link not found between those thoughts." (was "…not linked")                                                                                                                                         | `errors.ts` classifies on "not found"; a foreign id and a missing link must answer the same way over MCP                          |
| 13  | Search dropdown renders `fixed` against the input's rect                                                                                                                                             | The toolbar row clips overflow; found in the browser pass, not by any test                                                        |
| 14  | The `frontend-design` skill was not run for Task 6                                                                                                                                                   | The page reuses the app's tokens, chip and menu components; no new visual language was introduced                                 |

> While this spec is **active**, when we make a material change to requirements, design, or
> scope (including from feedback on what was implemented), update the relevant sections and
> append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-10-24-0925-brain-library-page/` with `plan.md` (this plan),
`shape.md`, `standards.md` (pinned to standards commit `5e153504`), `references.md`. No
`visuals/` — classic PersonalBrain look, none provided. Commit and push.

## Task 2: Schema + migration

In `src/db/schema.ts` add `brainThoughtTypes`, `brainThoughts`, `brainLinks`, `brainTags`,
`brainThoughtTags`, each with `userId` FK cascade and a `unique(id, userId)` target for the
composite FKs. Constraints per Decisions (pair unique expression index, `from <> to`, jump
ordering CHECK, `kind` as `text` + CHECK + `BRAIN_LINK_KINDS` const tuple, home partial unique,
unique type/tag name per user). Indexes for neighbour reads: `(userId, fromId)`, `(userId, toId)`;
`(userId, lastVisitedAt desc)`. `npm run db:generate` → read the SQL → `npm run db:migrate`;
commit `.sql` + snapshot + journal together (`database/migrations.md`).

## Task 3: Pure logic in `src/lib/brain/` with tests

- `neighbourhood.ts` — from the active id and the raw link rows, derive `{ parents, children,
jumps, siblings }`: siblings = other children of any parent, de-duplicated, excluding the
  active thought and anything already a parent/child/jump. Test the overlaps and the loop case.
- `plex.ts` — given counts and container size, positions for each zone (children wrap into
  rows; zones overflow to a "+N more" chip past a cap), plus edge endpoints. Test: zones never
  overlap, centre is fixed, stable positions for an unchanged neighbour set.
- `links.ts` — normalise a requested link (jump ordering; parent-of-X vs child-of-X into one
  `from/to`), and decide insert vs update-in-place against an existing pair row.

## Task 4: Queries and mutations

`src/lib/brain/queries.ts` — `loadPlex(userId, thoughtId)`: the active thought, its links,
the parents' child links (for siblings) and every neighbour's name/type in **one** SQL round
trip (CTE), per `database/read-latency.md`; `searchThoughts`, `recentThoughts`, `listTypes`,
`listTags`. `src/lib/brain/mutations.ts` — create (optionally linked, in one transaction),
rename, setNote, setType, setTags (create-on-demand), setHome, link/relink/unlink,
setLinkLabel, delete, markVisited; every one takes `userId`.
`mutations.integration.test.ts` — includes the second-user read/change/delete/link-to cases;
add Brain tables to `src/lib/db/crossUserReads.integration.test.ts`.

## Task 5: Page, actions, navigation

`src/app/(shell)/library/brain/page.tsx` + thin `actions.ts`; register in
`src/lib/navigation/pages.ts` (keywords: "personalbrain thebrain mind map thoughts links
graph network ideas"), update `pages.test.ts` and `cachePolicy.ts` as Houses did. Commands in
the command registry with menu entries. After touching `src/app/**`: dev server + `npm run smoke`.

## Task 6: Plex UI

`src/components/brain/` — `BrainView` (plex + notes pane split, search box, recent list),
`Plex` (chips + SVG edges, transitions, right-click menu, link label on edge),
`ThoughtChip` (type colour), `AddLinkInput` (autocomplete), `ThoughtNotePane`
(`MarkdownEditor` + `useAutosave` from `src/components/notes/`), type/tag editors, delete
confirm on `ModalShell`, `BrainMobile` stacked-list fallback below md. Use
`useElementSize` for plex dimensions. Run the `frontend-design` skill for the look.

## Task 7: `brain` MCP domain

`src/lib/agent/brainTools.ts` + contracts in `contracts.ts`, registered in `tools.ts`/`mcp.ts`:
`list_thoughts` (search, compact), `get_thought` (note + neighbourhood), `create_thought`
(optional `linkTo` + `kind`, `externalSource`/`externalId` retry safety), `update_thought`
(name, note, type by name, tags), `link_thoughts`, `unlink_thoughts`, `delete_thought`.
Follow `api/agent-tools.md`; give fields that collide with the global `fieldDescriptions`
their own `.describe()` (Houses change #4). `brainTools.integration.test.ts` with cross-user
cases; update the hardcoded tool counts (`mcp.test.ts`, `route.test.ts`, `tools.test.ts`,
`scripts/smoke-agent.mjs`) and `docs/agent-api.md`.

## Task 8: Verify, freeze spec, update roadmap

- Lint, typecheck, `npm test` (confirm no DB-skip warning), `npm run smoke`, `npm run smoke:agent`
- Drive it in the browser (`run-planner`): build a small brain, recentre, back button, search,
  delete; check phone width
- Push to `master`; Lee checks on desktop and iPhone
- Update plan/shape for as-built drift; mark **frozen / complete**; follow-ups listed separately
- Add a Brain entry to `agent-os/product/roadmap.md` (Phase 3, Library section)

## Verification

End-to-end: unit tests for `neighbourhood`/`plex`/`links`; integration tests for mutations,
cross-user reads and MCP tools against Docker Postgres; `npm run smoke` for every route;
manual browser pass via `run-planner` on desktop and narrow width.

## As built

- **Schema:** `src/db/schema.ts` — `brain_thoughts`, `brain_links`, `brain_thought_types`,
  `brain_tags`, `brain_thought_tags`; migration `0104_bouncy_microbe` (landed in `2df785ac`).
- **Pure logic:** `src/lib/brain/{neighbourhood,plex,links,snippet,thoughtId,commands}.ts`.
- **Data:** `queries.ts` (`loadPlex` is one statement), `mutations.ts`; both user-scoped.
- **Page:** `src/app/(shell)/library/brain/{page,actions}.tsx`; UI in `src/components/brain/`.
- **MCP:** `src/lib/agent/brainTools.ts`, seven tools in `domain: brain`; `docs/agent-api.md`
  regenerated.
- **Verification (2026-10-24):** lint, typecheck, `npm test` (381 unit files / 90 integration
  files, no DB skip), `npm run smoke` (65 routes) and `npm run smoke:agent` passed. Driven in a
  browser: create, link all three kinds, recentre, Back, search by note, note/tags/type
  persistence, delete, the `+N more` overflow and edge labels at 1280px, and the stacked lists at
  390px.

## Follow-ups (new work — not amendments to this frozen spec)

- **Lee's own check on desktop and the deployed iPhone is still to come.** Anything found there
  belongs in a delta-spec.
- Agents cannot create or recolour types (Change 10). If that turns out to be wanted, add
  `create_thought_type` rather than creating types implicitly.
- Out of scope in v1, still out: `.brain` import, attachments/URLs per thought, links to
  Notes/Contacts/outline nodes, Find integration, multiple brains, one-way jumps, drag-to-link,
  second-degree neighbours, thought icons.
- Edges cross behind chips when a zone wraps to several rows; a bundled or curved edge would read
  better if large neighbourhoods become common.
- No keyboard navigation between chips beyond Tab; arrow-key recentring was not built.
