# Standards for Inbox & Quick Task Entry

Three standards apply. One of them we **deliberately depart from**; that is recorded first
because it is the decision most likely to look like a mistake to a future reader.

---

## Departure: `components/ux-principles` — "never use a modal for a create flow"

The standard says, verbatim:

> ### Avoid modals for routine editing
>
> Modals hide context, increase cognitive load, and feel interruptive. Reserve them for:
>
> - **Destructive confirmations** — "Delete this project and everything under it?"
> - **Critical blocking actions** where the user _must_ decide before continuing
>
> Never use a modal for a standard create/edit flow.
>
> **This is the main place we depart from Achieve Planner.** Achieve opens a modal for
> everything, and routinely opens modals on top of modals. That is the part of its design
> worth leaving behind — the workflow it encodes is excellent; the containers it uses are
> not.

The quick capture box is a centered modal on a create flow. That is a real conflict, not an
oversight. The reasons it is still right here:

1. **It is not a record form.** Every case the standard is aimed at — a Project form, an
   Objective row, a Task's fields — edits _a thing that already exists and is on screen_.
   The drawer wins there because the grid behind it is the context you need. Capture has no
   record and no row; there is nothing for a drawer to be anchored to.
2. **Context preservation does not apply — it inverts.** The rule protects your view of the
   outline while you work on something in it. During capture the outline is _irrelevant by
   definition_: the thought you are offloading arrived from somewhere else entirely, and the
   faster the app gets out of the way, the better it has done its job. Preserving context
   here would mean preserving context you are not using.
3. **A drawer would be worse on the app's own terms.** Drawers are anchored, animated,
   ~45rem wide, and tied to a selected node. For "type a line and hit Enter" that is slower
   to open, slower to dismiss, and implies a record relationship that does not exist.
4. **It is closer to a command palette than a form** — transient, keyboard-invoked, owns no
   data, dismissed with Escape, leaves nothing behind. Neither the standard's permitted
   cases nor its prohibited case describes that shape.

Two principles from the same standard actively _require_ this design:

> **Keyboard first** — this app replaces a keyboard-driven Windows tool. Anything reachable
> by mouse should be reachable by key, and the primary workflows should be faster by
> keyboard than by mouse.

> ### Minimise required fields
>
> Only hard-require what is genuinely essential. […] In this app almost nothing is truly
> required — a node needs a type and a place in the tree; even the name can be filled in
> later.

The capture box is the purest expression of both: one keystroke to open, a name, Enter.

**Consequence:** `ux-principles.md` should grow a third permitted case — _a transient,
keyboard-invoked command surface that owns no record_. That is a standards edit, so it goes
through `/discover-standards` as a follow-up rather than being slipped in here.

Reused rather than reinvented, so the departure stays narrow: `useModalFocus` from
`src/components/detail/focus.ts` (focus-in, Tab trap, focus restore) and the same
capture-phase Escape handling the three existing centered dialogs use.

---

## `development/testing`

Full text:

> This is a personal project with one developer and no users to page at 3am. Tests here are
> not a quality ritual and not a coverage target — they are a **tripwire**. Their job is to
> notice when something quietly stops working: a refactor that drops a `userId` from a
> `where` clause, a date helper that shifts by an hour across DST, an agent that "fixes" a
> bug by deleting the guard that caught it.
>
> That purpose sets the bar. A test earns its place if it would **fail loudly on a plausible
> mistake**. If breaking the code would not break the test, the test is decoration.
>
> ## What gets tested
>
> **Pure logic in `src/lib/**` — always.** Recurrence expansion, sort keys, tree slicing,
> date geometry, filters. These are cheap to test, hold the trickiest reasoning in the
> codebase, and are exactly where a wrong answer looks plausible. Adjacent `foo.test.ts`.
>
> **Database mutations and queries — always, as `*.integration.test.ts`.** Every one of
> these takes a `userId` and is expected to scope by it. Prove it: a mutation suite is not
> done until it has a case where **a second user tries to read, change, and delete the first
> user's row and fails at every step**. A dropped `userId` is one of the easiest mistakes to
> make and is completely invisible when you only ever test with one user.
>
> **React components — no.** There is no testing-library setup and adding one is not
> currently worth it. […] If a component grows real logic, extract it to `src/lib/**` and
> test it there.
>
> **Server actions in `src/app/**/actions.ts` — no.** They are thin wrappers that resolve
> the user and delegate. Test what they delegate to.
>
> ## What a good test looks like here
>
> - **Name the invariant, not the mechanics.** `"does not let one user rename another's
chart"` survives a rewrite. `"calls db.update with the right args"` does not.
> - **Pin behaviour that is easy to get subtly wrong**, and say why in a comment when the
>   expected value is non-obvious.
> - **Prefer real values over mocks.** Integration tests use the real Postgres from
>   `npm run db:up`, each under a freshly created user, cleaned up in `afterAll`. Do not mock
>   Drizzle — a mocked query proves nothing about the query.
> - **Cover the boundary, not every value.**
>
> ## What not to write
>
> - Snapshot tests. They pass whatever the code does, which is the opposite of a tripwire.
> - Tests that restate the implementation line by line.
> - Tests for framework or library behaviour.
> - Tests for trivial pass-throughs, getters, or type-only modules.
>
> Integration tests **skip loudly** when Postgres is unreachable […] That means a green
> `npm run test:unit` does **not** mean the database logic passed. Check for the skip
> warning before trusting a green run on a change that touched `src/lib/**/mutations.ts` or
> `queries.ts`.

**How it applies here.** `parseCapture` is the archetype of "tricky reasoning where a wrong
answer looks plausible" — indentation normalization across tabs and space widths silently
produces a _valid-looking_ but wrong tree, which no type check and no eyeball will catch.
That test file is the most valuable artifact in this spec.

`ensureInbox` / `captureItems` get the cross-user block, and it has a shape specific to this
feature: it is not enough that B cannot write into A's project. **B's `ensureInbox` must not
return A's inbox** — a `where is_inbox` lookup that forgets `user_id` would return the wrong
user's row and the single-user tests would all still pass. That is precisely the dropped-
`userId` mistake the standard exists to catch.

The hierarchy change also demands a _negative_ test: it would be easy to write `RANK[child]

> = RANK[parent]` and accidentally allow a goal under a project (by flipping the comparison),
> which no positive test would notice.

Per the standard, `src/app/capture/actions.ts` gets **no** tests, and no component tests are
written for the dialog.

---

## `api/agent-tools` + `api/error-handling`

Relevant only to Task 7 (relaxing `createNodeTool`'s root guard). The governing rules:

> 2. **One write path** — tools call `src/lib/**` mutations/queries only. Do not reimplement
>    SQL in the route handler.
> 3. **Stable names** — tool names are part of the agent contract; rename only with a
>    deliberate version or dual-support window.

The guard relaxation obeys both: no tool is renamed, no argument is removed, and the
validation simply stops duplicating a rule that `assertCanNest` already owns in the lib.
Loosening a required argument is backward compatible — every request that worked before
still works.

From `api/error-handling`: a foreign-user id must read as **not found**, never as a
permission error that confirms the id exists. `createNode` already gets this right via
`requireNode`, and `captureItems` inherits it by delegating rather than doing its own lookup.
