# Standards for the Command Surface

**Status: frozen / complete (2026-08-06)**

## Applied

### `agent-os/standards/components/navigation.md`

The governing standard, and the one this slice **amended**.

Rules carried forward unchanged:

- **One registry, two renderers** became one registry, _five_ renderers — the same reason holds:
  "a command described in two places is a command whose two descriptions eventually disagree about
  whether it is available or what it is called." This slice extended that argument from labels to
  **shortcuts**, which had been described twice (a `shortcut` string, and a `switch` on `event.key`
  in one of eleven per-view listeners).
- **No command is palette-only.** Metrics, Fitness and Schedule broke this outright; they are on the
  shared surface now.
- **Unavailable is not absent** — disabled with a `title` saying why, in the menu bar, the panel,
  the row menu and the palette alike.
- **Shell state is a setting, not a `localStorage` flag.** The Commands panel's open state and
  per-section collapse go in the `shell` scope, and their parser returns defaults for an unusable
  blob because it runs before the first paint.
- **Events, not a provider, for "open this."** The panel is a sibling of its toggle, so if the
  toggle ever has to live outside the toolbar it dispatches a `window` event rather than forcing a
  provider into the root layout.

Amendments this slice makes:

- The three-surface table gains a fourth row (the per-view **menu bar**) and a fifth (the
  **Commands panel**).
- `⋯` is documented as _the phone's menu bar_ rather than a desktop tier; the desktop
  "**`⋯` must be short**" rule is superseded by "**every menu is sectioned**", because a named
  menu with headings can be complete without being unreadable.
- New rule: **a command declares its binding**, and the printed shortcut is derived from it.

### `agent-os/standards/components/data-grid.md`

- "A tab declares **what it has**, it does not assemble buttons" is exactly the contract the menu
  taxonomy extends: a tab declares commands with placements, and the shared bar decides how they
  are controlled. A menu with nothing in it does not render.
- The toolbar tier table gained the menu-bar tier and the verbs/lens row split, and the
  "separate bars for commands and view controls" rule stopped being conditional.
- The two deletion tests still apply first, and still bite: a control whose only two states are
  "unavailable" and "duplicated" belongs deleted, not promoted to a menu row.

### `agent-os/standards/components/ux-principles.md`

- Command labels use **user verbs**; the menu section headings are nouns for families, not
  implementation words.
- "A gesture nobody can see is not a discoverable action" is the whole reason the icon toolbar
  keeps a `title` and an `aria-label` on every icon-only button, and the reason the Commands panel
  exists at all.
- Dialogs stay reserved for destructive confirmation and choices the app cannot infer — the
  level/zoom pickers keep theirs, and no new dialog is introduced.

### `agent-os/standards/components/responsive.md`

- Below `md`: one panning lens row plus the pinned `⋯`, no menu bar, no panel — **adaptive, not
  shrunken**. A 208px pane on a 390px screen is a different product, not a narrower panel.
- 44×44 tap targets on the overflow and on every row inside its sheet; hit-target size is not
  covered by the accessibility exemption.
- No horizontal page overflow: wide content scrolls inside its own container.

### `agent-os/standards/components/modal-pattern.md`

No new dialogs. "Zoom to item…" and "Expand through level…" keep `ModalShell`, unchanged from the
frozen spec.

### `agent-os/standards/development/testing.md`

- The pure half — `menus.ts`, `bindings.ts`, the extended `commandDeck.ts`, the `shell` codec —
  lives in `src/lib/**` with adjacent `.test.ts` files. A test earns its place by failing on a
  plausible mistake: a menu ordered by registration order instead of `MENU_SECTIONS`, a heading
  that steals arrow-key focus, `formatBinding` printing `⌘` for an Alt binding, and — the one that
  would break three commands silently — `matchBinding` treating modifiers as a minimum rather than
  an exact match, which would make plain `Insert` fire on `⇧Insert` and `⌃Insert` too.
- **No React component tests.** `CommandBar`, `CommandMenuBar`, `MenuButton`, `MenuList` and
  `CommandsPanel` are wiring; they were verified in a real browser via the `run-planner` skill.
  That is also how the two defects this slice introduced were caught, neither of which a unit test
  would have seen: a re-registration loop from an unmemoised `setOpen`, and `⋯` running off the
  bottom of a phone once it held the whole tree.
- No database work in this slice, so no new `*.integration.test.ts` — but the `shell` scope's
  existing `mutations.integration.test.ts` cross-user case still has to pass, and a Postgres-down
  skip warning does not count as passing. It ran: 19 files, 442 tests.

### `agent-os/standards/development/dates.md`

Not applicable — no calendar or instant values are touched.

## Frontend design guidance

Per the `frontend-design` guidance and the frozen spec's precedent: use the existing palette,
typography and radii; spend the visual risk on the selection/type accent and the icon vocabulary,
not on a new colour; keep motion to `transition-colors`, which is all this app has ever used and
all `prefers-reduced-motion` will tolerate.
