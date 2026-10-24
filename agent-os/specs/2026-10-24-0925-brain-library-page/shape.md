# Brain — Shaping Notes

**Status: active**

## Scope

A PersonalBrain (TheBrain) clone as a seventh Library page, `/library/brain`: standalone
**thoughts** joined by parent/child and jump links, explored through the **plex** (active
thought centred; parents above, children below, jumps left, siblings right; click to
recentre with animation). Markdown note per thought, types (colour), tags, link labels,
search and recent history, and a `brain` MCP domain for Grok.

### Out of scope

- `.brain` import, attachments/URLs per thought, links to Notes/Contacts/outline nodes
- Find integration, multiple brains, typed links beyond a free-text label, one-way jumps
- Plex drag-to-link, second-degree neighbours, thought icons/images

## Decisions

- Standalone thoughts (no pointers into other app records) — chosen over a graph-over-records model.
- Match PersonalBrain's rules: loops allowed; exactly one link per pair of thoughts, so
  re-linking updates the existing row. Siblings are derived, never stored.
- Active thought lives in `?thought=<id>`; browser history is the history.
- Hand-built layout (pure, tested) with absolutely-positioned chips over SVG edges; no
  graph library, following the Timeline ribbon.
- Mobile: stacked lists, no plex. Desktop is the priority.
- MCP tools in v1 (user choice).
- Durable feature, unlike Houses: no deletion-in-one-commit constraint.

## Context

- **Visuals:** None; classic PersonalBrain look.
- **References:** Houses spec/code, Timeline ribbon, Notes editor (see `references.md`).
- **Product alignment:** Achieve has no equivalent; personal reference data beside Contacts
  and Timeline. No governing prior spec.

## Standards Applied

See `standards.md`.
