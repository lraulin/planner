# Standards for Metrics Tab + Import/Export

The following standards apply to this work.

---

## development/testing

# Testing

This is a personal project with one developer and no users to page at 3am. Tests here are
not a quality ritual and not a coverage target — they are a **tripwire**. Their job is to
notice when something quietly stops working: a refactor that drops a `userId` from a
`where` clause, a date helper that shifts by an hour across DST, an agent that "fixes" a
bug by deleting the guard that caught it.

That purpose sets the bar. A test earns its place if it would **fail loudly on a plausible
mistake**. If breaking the code would not break the test, the test is decoration.

## What gets tested

**Pure logic in `src/lib/**` — always.** Recurrence expansion, sort keys, tree slicing,
date geometry, filters. These are cheap to test, hold the trickiest reasoning in the
codebase, and are exactly where a wrong answer looks plausible. Adjacent `foo.test.ts`.

**Database mutations and queries — always, as `*.integration.test.ts`.** Every one of these
takes a `userId` and is expected to scope by it. Prove it: a mutation suite is not done
until it has a case where **a second user tries to read, change, and delete the first
user's row and fails at every step**. A dropped `userId` is one of the easiest mistakes to
make and is completely invisible when you only ever test with one user.

**React components — no.** There is no testing-library setup and adding one is not
currently worth it. The bug class that actually bit this codebase in components was
unhandled promise rejections, and that is caught by the type-aware ESLint rules
(`no-floating-promises`, `no-misused-promises`) far more cheaply than by rendering tests.
If a component grows real logic, extract it to `src/lib/**` and test it there.

**Server actions in `src/app/**/actions.ts` — no.** They are thin wrappers that resolve
the user and delegate. Test what they delegate to.

## What a good test looks like here

- **Name the invariant, not the mechanics.** `"does not let one user rename another's
chart"` survives a rewrite. `"calls db.update with the right args"` does not.
- **Pin behaviour that is easy to get subtly wrong**, and say why in a comment when the
  expected value is non-obvious — DST boundaries, end-of-month clamping, inclusive vs
  exclusive range ends, "end after N occurrences" when the window starts later.
- **Prefer real values over mocks.** Integration tests use the real Postgres from
  `npm run db:up`, each under a freshly created user, cleaned up in `afterAll`. Do not mock
  Drizzle — a mocked query proves nothing about the query.
- **Cover the boundary, not every value.** One test for "interval 0 floors to 1" beats six
  tests for intervals 1 through 6.

## What not to write

- Snapshot tests. They pass whatever the code does, which is the opposite of a tripwire.
- Tests that restate the implementation line by line. When the code changes they change
  with it and never catch anything.
- Tests for framework or library behaviour. Drizzle and Vitest are already tested.
- Tests for trivial pass-throughs, getters, or type-only modules.

## When adding a feature

1. Put the real logic in `src/lib/**`, not in the component.
2. Write the pure tests alongside it. If the logic branches on dates, include a DST or
   month-boundary case.
3. If it touches the database, add an `*.integration.test.ts` — including the cross-user
   case.
4. Run `npm test`. The pre-commit hook runs the unit tests and pre-push runs everything,
   but do not make the hook the first time you find out.

## Mechanics

|                        |                                                                   |
| ---------------------- | ----------------------------------------------------------------- |
| Unit tests             | `foo.test.ts` beside `foo.ts`, no database, must stay hermetic    |
| Integration tests      | `foo.integration.test.ts`, real Postgres, one fresh user per test |
| Run everything         | `npm test`                                                        |
| Run only the fast ones | `npm run test:unit`                                               |

Integration tests **skip loudly** when Postgres is unreachable, so a stopped container
never blocks a commit — see `src/lib/testing/database.ts`. That means a green
`npm run test:unit` does **not** mean the database logic passed. Check for the skip
warning before trusting a green run on a change that touched `src/lib/**/mutations.ts` or
`queries.ts`.

---

## database/migrations

# Migrations

Drizzle, `drizzle/` for the SQL, `drizzle/meta/` for the snapshots it diffs against.

## Changing the schema

```sh
# 1. edit src/db/schema.ts
npm run db:generate     # writes drizzle/NNNN_name.sql + meta/NNNN_snapshot.json + journal entry
# 2. read the generated SQL before trusting it
npm run db:migrate      # applies it locally
```

Commit the **`.sql`, the snapshot, and the `_journal.json` entry together**. They are one
change; a commit with two of the three is the bug described below.

## Never hand-write a migration without its snapshot

`db:generate` diffs the _last snapshot_ against `schema.ts`. Drop one and the next generate
diffs from a stale baseline, emits SQL that re-creates things that already exist, and has to
be hand-written too — which drops another snapshot. **One omission poisons every migration
after it.**

That is not hypothetical: `0004` (commit `566a565`) shipped a `.sql` and a journal entry
with no snapshot, `0005`–`0008` were then all hand-written, and `db:generate` was unusable
for five migrations. `0007` made it worse by adding a snapshot that was the `0003` schema
re-stamped with new ids — a _wrong_ snapshot is worse than a missing one, because drizzle
believes it.

If you genuinely must hand-write SQL that `generate` cannot express (a backfill, a
data-preserving column swap), still regenerate the snapshot afterwards so the chain stays
intact.

**Current state:** repaired as of `0008`. Snapshots `0004`–`0006` are absent and `0007` is
wrong; they are left as history. Only the newest snapshot matters for diffing, and that one
is correct — `db:generate` works and reports "No schema changes" against a clean tree.

## Hand-written SQL, when unavoidable

Statements are separated by a breakpoint marker, and a column swap keeps the data:

```sql
ALTER TABLE "appointments" ADD COLUMN "check_state" "appointment_check" DEFAULT 'open' NOT NULL;--> statement-breakpoint
UPDATE "appointments" SET "check_state" = CASE WHEN "completed" THEN 'done'::"appointment_check" ELSE 'open'::"appointment_check" END;--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "completed";
```

Add the column, backfill it, then drop the old one — never drop first.

## Connections

Migrations run over **`DIRECT_DATABASE_URL`**, never the pooler
(`drizzle.config.ts` falls back to `DATABASE_URL`). Neon's pooled endpoint is
transaction-mode, where DDL like `ALTER TYPE ... ADD VALUE` fails with an unhelpful error.
Locally the two are the same string.

## Production

`npm run build` runs `scripts/migrate-on-deploy.mjs` before `next build`, so schema and code
ship together — a past deploy shipped code querying tables Neon did not have yet.

It is gated hard on `VERCEL_ENV === "production"`. **Preview deployments share the one Neon
database**; without the gate, a push to any branch could reshape production's schema. A
failed migration fails the build rather than deploying code whose tables do not exist.

## `db:push` — local scratch only

`db:push` writes `schema.ts` straight to a database and produces **no migration file**, so
the files and the database silently diverge. Fine for trying a shape on your own Docker
Postgres; never against Neon, and never as the thing that ships. The change is not real
until `db:generate` has produced a migration.

## `db:seed` is destructive

It **deletes the dev user's nodes, appointments and time charts** before inserting. Never
run it to refresh a database someone is using. To exercise it, point it at a scratch
database — an exported `DATABASE_URL` beats `--env-file`:

```sh
docker exec planner-postgres psql -U planner -d postgres -c 'CREATE DATABASE planner_seedcheck'
export DATABASE_URL="postgresql://planner:planner@localhost:5432/planner_seedcheck"
npx drizzle-kit migrate && npm run db:seed
```

---

## components/ux-principles

# UI/UX Design Principles

The design philosophy behind our component patterns. Read this before the
implementation-focused standards (`drawer-pattern.md`) — it explains _why_ those patterns
exist.

Adapted from the same standard in Lee's `wrcs/reactwrcs` project, where these principles
emerged from iterating through grid → tabs → modals → grid+drawer during 2025–2026. They
align with patterns used in Linear, Supabase, Retool, and other modern tools. Where this
document differs from the original, it is because Achieve Planner's model differs — see
**Tabs** below.

## Core Principles

- **Context preservation** — never hide the outline unless absolutely necessary. It is the
  user's map of everything they have committed to; losing sight of it is disorienting.
- **Consistency** — the same patterns across every view, and aligned with conventions users
  already know from elsewhere.
- **Clarity over cleverness** — if users have to guess how to do something, the design has
  already failed.
- **Error prevention > error recovery** — make dangerous or irreversible actions hard to do
  by accident.
- **Progressive disclosure** — show only what's needed now; hide complexity until relevant.
- **Immediate, clear feedback** for every action.
- **Keyboard first on desktop, touch-complete on phone** — this app replaces a keyboard-driven
  Windows tool. At `md` and above, anything reachable by mouse should be reachable by key, and
  the primary workflows should be faster by keyboard than by mouse. Below `md` that inverts:
  every action must have a visible, tappable path, because there is no keyboard, no hover and
  no right button. Neither half is optional — a shortcut with no button fails on the phone, and
  a button with no shortcut fails at the desk. See `responsive.md`.
- **Accessibility is not a goal here** — one user, no screen reader, not public. Skip ARIA
  coverage, contrast ratios and screen-reader testing; add them if this is ever released.
  Keep the handful of roles and labels that are load-bearing for other reasons (see
  `modal-pattern.md`) — they are wiring, not compliance.
  **Hit-target size and touch-reachability are not covered by this exemption.** A 44px tap
  target and a tappable path to every command are usability for the one user we have, on the
  phone he actually owns — not compliance for a hypothetical audience.
- **Performance is UX** — slow expand/collapse or heavy re-renders destroy usability in a
  dense grid.
- **Forgiveness & safety** — let users recover easily; never force inaccurate data entry.

## Layout & Navigation

### Grid + drawer is the default

The **outline grid + right-sliding drawer** is the standard pattern for list + form work
(see `drawer-pattern.md`):

- **Grid** for scanning, filtering, reordering, and fast inline edits
- **Drawer** for the full record — the grid stays visible, preserving context

Below `md` this becomes **list + full-screen sheet**. Context preservation is the principle the
drawer serves, and on a 390px screen it is unaffordable — there is no room to keep the grid
visible and still show a form worth filling in. The compact layout gives up that principle
knowingly, in the one place where the alternative is worse. Everything else on this page still
applies. See `responsive.md`.

### Inline editing for grid-visible fields

Fields that appear as grid columns — name, priority, effort, deadline, state, focus — are
edited **in place**. Opening a drawer to change a priority would be absurd. The drawer is
for the fields that don't fit on a row.

Where a value is a rollup of its descendants (a parent's effort), the cell is **read-only**.
Never offer an editor whose result would be invisible behind a computed value.

### Avoid modals for routine editing

Modals hide context, increase cognitive load, and feel interruptive. Reserve them for:

- **Destructive confirmations** — "Delete this project and everything under it?"
- **Critical blocking actions** where the user _must_ decide before continuing
- **Fast capture** — a transient, keyboard-invoked surface that owns no record

Never use a modal for a standard create/edit flow.

#### The capture exception

Quick capture (`QuickCaptureDialog`) is a modal on what looks like a create flow, and is
still right. The discriminator is **whether context preservation is wanted**:

|                      | Standard create/edit | Fast capture            |
| -------------------- | -------------------- | ----------------------- |
| Purpose              | Full record editing  | Get it out of your head |
| Context preservation | High                 | **Low, intentionally**  |
| Bound to a record    | Yes                  | No — nothing exists yet |
| Bulk / freeform text | No                   | Yes                     |
| Pattern              | Drawer               | Modal                   |

The rule protects your view of the outline while you work _on_ something in it. During
capture the outline is irrelevant by definition — the thought arrived from somewhere else,
and the faster the app gets out of the way the better it has done its job. A drawer would
also be slower to open, slower to dismiss, and would imply a record relationship that does
not exist.

**This does not license** a modal for anything with an id: editing a node, a note, or an
appointment stays in a drawer. If you would return to it and edit it again, it is not
capture. Keep a capture surface extremely lean, so it reads as a tool rather than a form.

**This is the main place we depart from Achieve Planner.** Achieve opens a modal for
everything, and routinely opens modals on top of modals. That is the part of its design
worth leaving behind — the workflow it encodes is excellent; the containers it uses are not.

`ConfirmDialog` in `src/components/detail/` serves the first two cases — the outline's delete
flow and the drawer's unsaved-changes prompt; use it rather than `window.confirm`. Every
centered dialog, including those, is built on `ModalShell`. See `modal-pattern.md`.

The stacked-modal rule bites hardest in the repeating lists inside a detail form — Achieve
opens a second modal to edit an Objective or a Risk. We expand the row in place instead
(`ItemList`).

### Tabs organise sections within a form

Tabs are the **correct** pattern for grouping sections of a complex record form, and this
app uses them exactly as Achieve does — a Project or Result Area opens with its fields
grouped across several tabs.

The original version of this standard argued against tabs. That argument was aimed at using
tabs to represent **individual data items** — one tab per record — which was a quirk of that
app's earlier design and is not something we do. It was never an argument against tabs as a
way to organise sections of a single form.

The distinction that matters:

| Tabs for…                     | Verdict                             |
| ----------------------------- | ----------------------------------- |
| Sections of one record's form | **Correct.** Use them.              |
| One tab per data item         | Wrong. That's what the grid is for. |

## Editing Triggers

Prefer explicit, discoverable actions over hidden gestures, and standardise whichever
trigger is chosen across every view — users should never have to relearn how to open a
record.

The bindings, which every view must match:

| Gesture                  | Opens                                          |
| ------------------------ | ---------------------------------------------- |
| `Enter`, or double-click | The full record, in a drawer — as Achieve does |
| `F2`                     | Inline name editing, the Windows convention    |

Both also appear as toolbar buttons, and the selected row carries a small open-record
affordance — a gesture nobody can see is not a discoverable action.

Below `md`, **single tap** opens the record and **long press** opens the row menu. Double-click
and right-click do not exist on touch, so these are translations of the same bindings rather
than a second set to learn. `F2` has no compact equivalent — inline rename happens in the
sheet. See `responsive.md`.

## Forms & Validation

### Minimise required fields

Only hard-require what is genuinely essential. Ask: "can the system function without this
right now?" If yes, make it optional. In this app almost nothing is truly required — a node
needs a type and a place in the tree; even the name can be filled in later.

### Allow partial saves

Let users save incomplete records. Forcing completeness produces junk data, lost work, and
abandonment — people frequently know a task exists before they know how long it will take.

### Use drawers for complex forms

For forms with many fields, conditional sections, or dropdowns needing room to expand, use
the drawer. Never cram them into grid cells.

### Save stays open; leave is separate

A drawer is a workspace, not a one-shot dialog. For structured record forms (node detail,
appointments) without autosave, commit and leave are independent. Use the shared
`DrawerFooter` — never invent a different button set:

```
[ Cancel ]                          [ Save ]   [ Save & Close ]
```

- **Save** (outlined) commits and **stays open**, with "Saved" / "Unsaved changes" feedback
  (⌘/Ctrl+S).
- **Save & Close** (solid primary, rightmost) commits then leaves (⌘/Ctrl+Enter); failed
  saves stay open.
- **Cancel** (ghost, left) / header × / Escape leave the drawer; if dirty, confirm discard.

Do not make a single Save that always closes — that forces reopen thrashing across tabs.
Do not ship only stay-open Save either: finishing an edit then becomes Save + Cancel every
time. Document-like surfaces (notes, session log) **autosave** instead; short nested
sub-editors may treat Save as done (Cancel + Save only). Details live in
`drawer-pattern.md`.

### Inline validation

- Validate **on blur**, not while typing.
- Error messages must be **specific and actionable** — "Effort must look like 2 h, 45 min,
  or 3:45 h", not "Invalid input".
- Clear the error state as soon as the user corrects it.
- Keep **Save** available unless a submit is in progress; show blocking errors on the save
  attempt rather than disabling the button.
- Unparseable input in a grid cell **reverts to the stored value and flags the cell** rather
  than saving something wrong or silently clearing it.
  Validation here is light by design (see partial saves); it is still not a reason to close
  on Save — stay open so a rare failure can be fixed in place.

## Decision Guide

| Question                                                                         | If yes →                                    | If no →                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Is the field already a grid column?                                              | Edit inline                                 | Drawer                                           |
| Is the value a rollup of descendants?                                            | Read-only                                   | Editable                                         |
| Are there more than 3–4 fields to edit at once?                                  | Drawer (not modal, not inline)              | Inline is fine                                   |
| Does the form have distinct groups of fields?                                    | Tabs within the drawer                      | A single scrolling pane                          |
| Is this destructive or irreversible?                                             | Confirmation dialog                         | Just do it, with clear feedback                  |
| Does it edit a record that already exists?                                       | Drawer, never a modal                       | A modal may be right — see the capture exception |
| Does the user need the outline visible while editing?                            | Drawer                                      | Drawer is still fine                             |
| Is this long-form writing with little to validate?                               | Autosave drawer                             | Explicit Save / Save & Close footer              |
| Is this a short nested "return a value" editor?                                  | Save may close (exception)                  | Save stays open; Save & Close finishes           |
| Is the viewport below `md`?                                                      | List + full-screen sheet                    | Grid + right drawer                              |
| Is the action only reachable by hover / right-click / double-click / a shortcut? | It is broken on touch — add a tappable path | Ship it                                          |

---

## components/drawer-pattern

# Form Drawer Pattern

> For why we use drawers instead of modals, see `ux-principles.md`.

Editing a full record uses a **right-sliding drawer**, never a modal and never full-page
navigation. The outline stays visible behind it.

Adapted from the `wrcs/reactwrcs` standard of the same name. That version is written for MUI
and AG Grid (`<Drawer anchor="right">`, `ModalProps`, `sx`, `refreshData`); none of that
applies here. This project is Tailwind, React Server Components, and server actions — so the
**rules** carry over and the code does not.

## Structure

A drawer is a client component holding its own form state, rendered from the page shell:

```tsx
<Drawer open={open} onClose={requestClose} labelledBy="node-form-title">
  {open && node && <NodeForm node={node} onClose={requestClose} />}
</Drawer>
```

## Rules

- **Guard the content**, not the container: `{open && node && ...}`. Never render a form
  before the record it edits is available.
- **Do not unmount the form on close** if the user might reopen it mid-edit. Where state
  must survive, lift it; where it must not, key the form on the node id so switching records
  resets it.
- **Width**: full-width on small screens, capped around `720px` on desktop
  (`w-full sm:w-[90%] md:max-w-[45rem]`).
- **Position below the app chrome** — the tab strip stays visible and clickable.
- **Below `md` the drawer is a full-screen sheet** at `100dvh` (not `100%` — a fixed parent
  resolves against iOS's large viewport and puts the footer under Safari's toolbar). There is
  no visible backdrop and no chrome behind it to preserve; the header carries the notch inset
  and a tap-sized close button. No slide-in — motion is disabled globally, so "sheet" here
  describes the shape, not an animation. See `responsive.md`.
- **Escape closes**, a backdrop click closes, and focus is trapped inside while open. Return
  focus to the row that opened it. If the form is dirty, both paths go through the same
  unsaved-changes prompt as Cancel — never bypass it.
- **Respect `prefers-reduced-motion`** — the slide transition is already disabled globally
  in `globals.css`, so don't reintroduce it inline.

## Open/close flow

1. **Edit** — set the selected node and open, together.
2. **Create** — clear the selected node and open, together.
3. **Close** — reset open, selected node, and dirty state in one action. Leaving any of the
   three behind is the source of most drawer bugs.

## Unsaved changes

If the form is dirty, closing prompts for confirmation. This is a destructive-confirmation
case under `ux-principles.md`, so a dialog is appropriate here.

## Saving — two models, pick by content

### Explicit Save stays open (default for structured records)

Node detail forms, appointments, and any multi-field record with a draft use **Save that
does not close**. Leaving is a separate action (Cancel / × / Escape).

Why: a drawer is a workspace, not a one-shot dialog. People edit across tabs, checkpoint
mid-way, then keep going. Tying commit to leave forces either reopen thrashing or living
under a permanent "Unsaved changes" banner.

**Always use `DrawerFooter`** (`src/components/detail/Drawer.tsx`). Do not hand-roll
footer buttons — layout, hierarchy, and shortcuts live there so every form matches.

```
[ Cancel ]                          [ Save ]   [ Save & Close ]
```

| Control          | Style                    | Behaviour                                    |
| ---------------- | ------------------------ | -------------------------------------------- |
| **Cancel**       | Ghost / text, left       | Leave. If dirty → discard confirmation.      |
| **Save**         | Outlined secondary       | Persist, stay open, show **Saved**.          |
| **Save & Close** | Solid primary, rightmost | Persist then leave. Failed write stays open. |

Sticky at the bottom of the drawer (`flex-none` under a scrolling body). Both Save
buttons disable while a write is in flight.

Below `md` the **same three buttons** restack — Save & Close full-width on top, Save and Cancel
beneath — and the footer pads with `.pb-safe` so it clears the home indicator. The arrangement
changes; the button set does not. Do not drop a button on the phone to save room.

```
[      Save & Close      ]
[  Save  ]      [ Cancel ]
```

```tsx
const result = await saveNodeAction(values);
if (!result.ok) {
  setError(result.error); // check the error first
  return; // and stay open so the user can fix it
}
setDirty(false);
setJustSaved(true); // footer shows "Saved"; clear when the next edit dirties the form
// do NOT close — the user closes when they are done
// revalidatePath already refreshed the grid behind the drawer
```

Rules for this model:

- **Save** persists, clears dirty, shows brief **Saved** feedback, **stays open**.
- **Save & Close** persists then leaves — the finishing action, not a substitute for
  stay-open Save. Failed writes still stay open with the error.
- **Cancel** / header × / Escape / backdrop leave the surface. If dirty, prompt to discard
  — every leave path must share the same dirty-aware handler.
- Never close a drawer over a failed save — the user's input disappears with it.
- On **create**, promote the draft to the new id in local state so the next Save is an
  update, then stay open. `onSaved` (if the parent needs one) means **refresh background
  data**, not **close the drawer**.

Keyboard (wired in `DrawerFooter` / `Drawer`):

| Shortcut     | Action                     |
| ------------ | -------------------------- |
| ⌘/Ctrl+S     | Save (progress, stay open) |
| ⌘/Ctrl+Enter | Save & Close               |
| Escape       | Cancel (with dirty check)  |

Footer status (mutually exclusive, next to Cancel):

| State                         | Label             |
| ----------------------------- | ----------------- |
| Dirty                         | Unsaved changes   |
| Clean after a successful Save | Saved             |
| Saving in flight              | (button: Saving…) |

### Autosave (document-like surfaces)

Use when there is nothing meaningful to validate on commit and sessions are long writing
rather than form fill:

- Notes drawer
- Fitness session log
- Daily notes pane

There is no Save button and no discard prompt. Debounced writes + a status line
("Saves as you type" / "Saved · 2s ago" / Retry on failure). A failed autosave keeps the
text on screen and the drawer open.

Do **not** add a Save button to an autosave drawer for consistency with node forms —
match the task, not the chrome.

### Short sub-editors (exception)

A nested, single-purpose editor whose only next step is "return the result and leave"
(e.g. create/edit exercise from the session log) may treat **Save as done** and close on
success. That is a return value hand-off, not a multi-tab record workspace. Prefer this
only when staying open would strand the user with nothing useful to do next.

## Server actions

Drawer forms submit through **server actions**, following the pattern already established in
`src/app/outline/actions.ts`: the action returns `{ ok: false, error }` rather than throwing,
so a rejected save renders inline instead of crashing the view.

`revalidatePath` in the action refreshes the outline, so there is no separate refresh call
to make from the form for grid data. Parents that hold client-side schedule state still
need an `onSaved` refresh callback — that callback must **not** close the drawer.

## Tabs inside the drawer

Group a record's fields into tabs when there are enough to warrant it, as Achieve does. On
save, run full validation across **every** tab and switch to the first tab containing an
error — never leave a user staring at a valid-looking tab wondering why save did nothing.

---

## components/modal-pattern

# Modal Pattern

> For _when_ a modal is allowed at all, see `ux-principles.md`. Three cases only.

Every centered dialog is built on **`ModalShell`** (`src/components/detail/ModalShell.tsx`).
Never hand-roll the backdrop — four dialogs each carried their own copy before it was
extracted, and they had already drifted apart on backdrop opacity.

```tsx
const titleId = useId();

<ModalShell open={open} onClose={close} labelledBy={titleId} width="max-w-lg">
  <div className="p-5">
    <h2 id={titleId}>Show Fields</h2>…
  </div>
</ModalShell>;
```

`ModalShell` supplies the backdrop and click-away, focus-in / Tab-trap / focus-restore
(`useModalFocus`), the Escape handler, and the `role` wiring. It renders nothing when `open`
is false. **Padding is yours** — the shell sets no padding so a dialog can have a flush
header or footer.

Focus handling stays for keyboard reasons, not accessibility ones: it is why Escape returns
you to the row you opened the dialog from, and why Tab does not wander into the grid behind
it.

## Rules

- **The `role` is functional, not decoration.** `"alertdialog"` for a destructive
  confirmation, `"dialog"` for everything else — and `isModalOpen()` finds a dialog by
  exactly these, so dropping the role breaks the capture shortcut's guard (below).
- **`labelledBy` points at the dialog's own heading.** A `useId` and an `id` on the `<h2>`;
  it keeps every dialog's API uniform for no real cost.
- **Escape is handled in the capture phase.** A grid's own keydown listener would otherwise
  see it first and cancel an inline edit _behind_ the dialog.
- **A visible button always accompanies a keyboard shortcut.** Touch has no Enter key, and
  a gesture nobody can see is not a discoverable action. `responsive.md` generalises this to
  hover, right-click and double-click as well.
- **Below `md`, `ModalShell` renders a bottom sheet** — anchored to the bottom edge, rounded
  top corners, `max-h-[85dvh]` with its own internal scroll, padded with `.pb-safe`. This is
  handled once in the shell, so every dialog gets it; a dialog that needs to opt out is a
  dialog worth reconsidering.

## Unmount a dialog that holds a draft

**Closing discards. Unmount the dialog rather than hiding it**, so the next open starts
clean:

```tsx
{
  open && <QuickCaptureDialog onClose={close} />;
} // not: <Dialog open={open} …>
```

Both draft-holding dialogs do this — `NoteFilterDialog` via an outer wrapper that returns
`null`, `QuickCaptureDialog` via the parent. It is what makes Cancel mean cancel, and it
avoids the bug it replaces: reseeding state from props inside an effect.

Passing `open` down and letting `ModalShell` unrender is right only for a dialog with no
draft of its own, like `ConfirmDialog`.

## Closing is the success signal (modals only)

A failed submit **keeps the dialog open** and renders the error inline; a successful one
closes it. The dialog disappearing is what tells the user it worked.

**Drawers are different.** Structured record drawers keep Save and leave separate — Save
stays open and shows "Saved"; Cancel / × leaves. Save & Close is the finishing commit.
Both surfaces still obey "never close over a failed save." See `drawer-pattern.md`.

Do not add a toast on top of that. There are none in the app, and a feedback convention
should be chosen for the whole app rather than introduced by whichever feature happened to
want one first.

## Modals are invisible to their own guard unless they use the shell

The app-wide capture shortcut suppresses itself with `isModalOpen()`
(`src/lib/keyboard.ts`), which queries `[role="dialog"], [role="alertdialog"]`. A dialog
built outside `ModalShell`, or missing its `role`, will not be seen — and `c` will open
quick capture on top of it.

## Deliberately not provided

No stacking, no scroll lock, no portal. Nothing here needs them, and `ux-principles.md`
names stacked modals as the specific Achieve behaviour worth leaving behind. If you find
yourself wanting a second modal over the first, the second one is probably a drawer.

---

## components/responsive

# Responsive & Touch

> For the philosophy these rules serve, see `ux-principles.md`. For how the drawer and
> dialogs reshape below `md`, see `drawer-pattern.md` and `modal-pattern.md`.

The app is a desktop instrument first: a dense grid, a right drawer, and a keyboard. It also
has to work on a phone, because `agent-os/product/mission.md` promises "reachable from phone,
tablet, and any OS" and the app is installable as a PWA.

Those two things are not the same layout at two sizes.

## The core rule: adaptive, not shrunken

A 28px row with six columns does not become usable by getting narrower. Below the breakpoint
the app presents **a different information architecture over the same data**:

| Desktop                        | Phone                                   | Why                                                          |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Grid + right drawer            | List → full-screen sheet                | Context preservation is cheap on 1440px, impossible on 390px |
| Multi-column panes, side rails | One column, segmented control to switch | Horizontal scrolling is a failure state                      |
| Hover reveals, double-click    | Persistent affordances, single tap      | There is no hover on touch                                   |
| Right-click menu               | Long-press menu                         | There is no right button                                     |
| Keyboard shortcuts             | Bottom nav, buttons, a capture FAB      | The keyboard is secondary and covers half the screen         |
| Sticky column headers          | Sticky section headers                  | There are no columns to head                                 |
| Drag to reorder                | An explicit "Move to…" action           | See **Drag is mouse-shaped**, below                          |

If a view cannot be re-thought this way for a reasonable cost, it degrades gracefully — it
scrolls horizontally inside its own container and says so. It does not get squashed.

## One breakpoint carries the weight

**`md` — 48rem / 768px.** Below it is _compact_: phones, and iPad in portrait. At and above it
is _the instrument_: the full grid, the right drawer, the tab strip, the keyboard model.

- Use `md:` for anything structural. `sm:` is for minor reflow inside an already-compact
  layout (a two-up field row becoming one-up).
- **Do not invent per-component breakpoints.** A component that needs its own is usually a
  component that should be branching on `useIsCompact()` instead.
- In JS, branch with `useIsCompact()` (`src/components/shell/useIsCompact.ts`), which reads the
  same 48rem line through `matchMedia`. Never read `window.innerWidth` directly, and never
  branch on a user-agent string.
- The server snapshot of `useIsCompact()` is `false`, so SSR renders the desktop layout and
  hydration swaps. Every page is `force-dynamic`, so there is no cached-HTML mismatch.

## Touch targets

**44 × 44 px minimum** below `md` (Apple HIG). Use `--tap-target` (`2.75rem`), not a
hand-picked height.

The desktop UI is full of controls far below this, and they are correct there — they are simply
not reusable in a compact layout:

| Control                   | Desktop size | Where              |
| ------------------------- | ------------ | ------------------ |
| Grid row                  | 28px         | `--row-height`     |
| Expand / collapse chevron | 16px         | `cells.tsx`        |
| Column filter funnel      | ~10px        | `ColumnHeader.tsx` |
| Column resize handle      | 4 × 16px     | `ColumnHeader.tsx` |
| Focus checkbox            | 14px         | `cells.tsx`        |

Where a compact layout needs the same action, it gets a new control at tap size — it does not
scale the desktop one up by a few pixels.

Spacing matters as much as size: two 44px targets touching each other still produce mis-taps.
Leave real gaps between adjacent interactive elements in a list.

## The 16px input rule

**Every focusable `input`, `select` and `textarea` renders at ≥16px below `md`.** This is not a
typography preference. iOS Safari zooms the viewport when you focus a control smaller than
16px, and it does not zoom back out when you blur — one tap on a 13px cell editor and the rest
of the session is scrolled sideways.

The app's base size is `text-[0.8125rem]` (13px), so this is handled centrally in
`globals.css` rather than per component:

```css
@media (max-width: 47.999rem) {
  input,
  select,
  textarea {
    font-size: 1rem;
  }
}
```

Do not override it back down with a utility class on an individual field.

Body copy should be ≥16px on phone for the same readability reason, but that one is a
preference; the input rule is a hard constraint.

## Safe areas and the viewport

The iPhone has a notch/Dynamic Island at the top and a home indicator at the bottom, and in an
installed PWA there is no browser chrome absorbing them.

- `viewport-fit=cover` is set once, in the `viewport` export in `src/app/layout.tsx`. Never add
  a raw `<meta name="viewport">` — Next owns that tag.
- Anything pinned to a viewport edge (the bottom nav, a sticky drawer footer, a compact header)
  pads with the `.pt-safe` / `.pb-safe` / `.px-safe` utilities in `globals.css`. Do not write
  `env(safe-area-inset-*)` inline; a value that appears in three files will drift in two.
- **Never `100vh`.** iOS reports the _large_ viewport for `vh`, so a `100vh` element sits partly
  under Safari's toolbars. Use `dvh` (or `svh` where content must never be clipped).
- The shell keeps `body { overflow: hidden }` and the `h-full` flex chain
  (`html` → `body` → page → `min-h-0 flex-1 overflow-auto` scroller). The scroll container is
  always an inner element, never the page. Add `overscroll-behavior: none` on the shell so a
  scroll that reaches the end does not rubber-band the whole app.
- The soft keyboard is handled by `interactiveWidget: "resizes-content"`, which shrinks the
  layout viewport so a sticky footer stays above the keyboard. Reach for `visualViewport` only
  if a specific surface still misbehaves.

## Touch gestures

| Gesture        | Meaning below `md`                  | Desktop equivalent |
| -------------- | ----------------------------------- | ------------------ |
| Single tap     | Open the record                     | Double-click       |
| Long press     | Row context menu, as a bottom sheet | Right-click        |
| Swipe on a row | One reversible action per direction | (none)             |

Rules:

- **Nothing is reachable only by hover, only by right-click, only by double-click, or only by a
  keyboard shortcut.** This generalises `modal-pattern.md`'s "a visible button always
  accompanies a keyboard shortcut." Before shipping a compact layout, list every action the
  desktop view offers and confirm each has a tappable path. The commands most likely to be
  missed are the ones that exist _only_ in a right-click menu.
- **Swipe is for reversible actions only** — complete, reschedule, archive. Never delete
  without a confirmation, and never bind a swipe to something with no undo.
- **A swipe must not fight the scroll.** Lock to the horizontal axis only after the pointer has
  moved further horizontally than vertically past a threshold; until then, let the list scroll.
- Long-press and swipe thresholds are **pure logic and live in `src/lib/touch/`** with tests
  (`development/testing.md`) — an off-by-one in a slop threshold is invisible until it is
  infuriating.

### Drag is mouse-shaped

HTML5 drag-and-drop is the reorder mechanism on desktop, and `DataGrid` arms `draggable` on
`onMouseDown` so a drag does not steal text selection inside cell editors. `onMouseDown` does
not reliably precede a touch drag, so **drag-to-reorder is disabled below `md`**, deliberately.

Any ranking or reparenting that drag provides on desktop must also exist as an explicit command
in the long-press menu ("Move to A/B/C/D", "Move up", "Indent"). Do not add a touch-drag
polyfill to preserve the gesture; add the command.

## Dark mode

Dark mode is first-class and stays driven by `prefers-color-scheme` in `globals.css`. There is
no theme toggle and no `data-theme` attribute; adding one is a product decision, not a styling
one.

Every new surface is checked in both schemes. Hard-coded light values exist today — the
`.schedule-calendar` gold column headers and white event cards — and they are a known,
contained exception, not a pattern to copy.

## Overflow

The page body never scrolls horizontally. Wide content — a data grid, a wide table, a code
block, a 7-day calendar — scrolls **inside its own `overflow-x: auto` container**. A view that
genuinely cannot work narrow says so in one line rather than silently clipping.

## Verification checklist

There are no component tests (`development/testing.md`), so this is the gate. Check any surface
you touched at **390 × 844** (iPhone 12) before calling it done:

1. No horizontal scroll on the page body, in portrait and landscape.
2. Tap every interactive element — none below 44px, none needing a second precise tap.
3. **Focus a text input and confirm the page does not zoom.**
4. Open the soft keyboard: sticky footers and add-rows stay above it.
5. Bottom-pinned chrome clears the home indicator; top chrome clears the notch.
6. Every desktop action on the view has a tap path (walk the right-click and shortcut lists).
7. Both colour schemes.
8. The installed PWA, not just Safari — standalone has no browser chrome to hide behind.
9. **Then re-check the view at 1280 × 800.** Compact work regresses desktop density more often
   than the reverse.

---

## api/response-format

# API response format

All HTTP surfaces under `/api/**` (starting with the agent API) use a single JSON envelope so
clients and coding agents can branch on one field.

## Success

```json
{
  "ok": true,
  "data": {}
}
```

- HTTP status **200** for successful tool calls (including creates).
- `data` is the tool-specific payload. Prefer plain JSON-serializable values: strings, numbers,
  booleans, arrays, objects. Dates are **ISO-8601 strings**.

## Failure

```json
{
  "ok": false,
  "error": {
    "code": "validation",
    "message": "type is required"
  }
}
```

- Always include `code` and a human-readable `message`.
- Do not leak stack traces or internal exception strings that include secrets.

## Content type

- Request bodies: `application/json` (empty object `{}` is fine when a tool has no args).
- Responses: `application/json`.
