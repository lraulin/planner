# Standards for page-bar drag reorder

Applied as of standards commit `84a86b0a30a5b286f68c00c7f9a0ead2060144b9`.
References, not copies — see AGENTS.md.

- `agent-os/standards/components/navigation.md` — page bar, one `modulePages` accessor,
  shell scope for anything the shell remembers.
- `agent-os/standards/components/responsive.md` — HTML5 drag is mouse-shaped; off below
  `md`.
- `agent-os/standards/development/testing.md` — pure merge/place helpers in `src/lib`
  with a sibling test file; no React component tests.
- `agent-os/standards/development/clean-code.md` — lib never imports app; one list, one
  merge, no second order stored only in the bar.
- `agent-os/standards/development/commits.md` — Spec trailer on implementing commits.

## Deviations

`responsive.md` says any ranking drag provides on desktop must also exist as an explicit
command in the long-press menu. This slice has no Move left/right (or equivalent). The
ranking is chrome preference, not outline/grid data; a phone still _displays_ the order
saved on desktop. Follow-up if daily phone use needs a reorder path.
