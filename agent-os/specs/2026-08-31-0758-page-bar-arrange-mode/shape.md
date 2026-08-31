# Page bar: an explicit Rearrange mode — Shaping Notes

**Status: frozen / complete** (2026-08-31)

## Scope

Stop arming drag on every page-bar tab. Tabs are links with a link cursor; rearranging becomes
a mode entered from the command registry, in which the tabs are buttons that select rather than
navigate and can be moved by drag (desktop) or `←`/`→` (everywhere).

### Out of scope

- The persistence model, the merge rules, `modulePages`, the drop arithmetic, the insertion
  line — all inherited unchanged from the 2026-08-29 spec.
- Registry default order.
- Form-section tabs, sidebar module order, closable tabs, touch-drag polyfill.
- Turning the bar into a `role="tablist"`.

## Why this supersedes part of a frozen spec

The frozen spec chose “drag is always live, click still navigates, and a `suppressClick` ref
keeps the two apart”. That is a coherent design, and it shipped. What it cost only became
visible in use: every tab in the app permanently claims to be a drag handle, which contradicts
the rule the grid already follows one tier down, and the collision it manages is a collision it
created. The mode is the smaller design — it deletes the ref and the two drag handlers from the
navigation path instead of guarding them.

Per the lifecycle, a frozen spec is not edited; this folder records the four decisions it
replaces and leaves the rest of that spec standing.

## Decisions

- Registered command, not permanent chrome. One registration reaches five surfaces including
  the phone's `⋯` — which is exactly why the phone entry point costs nothing.
- The mode swaps the tabs for buttons rather than decorating the links. That is what removes
  the collision, and what makes `←`/`→` available without a desktop.
- Mode per module in component state, compared rather than cleared, so switching modules exits
  it without an effect. Not persisted: a bar that does not navigate must not survive a reload.
- Boldness spent once: tint, dashed inset outline, `⋮⋮` grips. The default bar gains nothing.

## Context

- **Visuals:** none. `ShowFieldsDialog`'s reorder list is the in-repo model for the grip glyph
  and the `bg-select` selection; `ColumnHeader` is the model for the cursor rule.
- **Product alignment:** Achieve's help says view tabs are dragged to reorder. Dragging still
  does that; it is now behind a mode, which Achieve's own docked panes are not — a deliberate
  small divergence in favour of not lying about a tab's primary action.

## Standards Applied

See `standards.md`. Pin `6192620bace854340d475553c5bb212b74e0cde4`.
