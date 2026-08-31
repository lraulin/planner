# Standards for the page-bar arrange mode

Applied as of standards commit `6192620bace854340d475553c5bb212b74e0cde4`.
References, not copies — see AGENTS.md.

- `agent-os/standards/components/navigation.md` — the page bar, one `modulePages` accessor,
  one command registry as the way a view publishes what it can do, `shell` scope for what the
  shell remembers.
- `agent-os/standards/components/responsive.md` — HTML5 drag stays desktop-only; the ranking it
  provides now also exists as explicit controls below `md`.
- `agent-os/standards/components/ux-principles.md` — a control's cursor names its primary
  action; a mode announces itself.
- `agent-os/standards/development/testing.md` — `movePage` is pure and lives in `src/lib` with
  a sibling test; no React component tests.
- `agent-os/standards/development/clean-code.md` — the arrow path is expressed in `placePage`
  rather than as a second, parallel notion of an index.
- `agent-os/standards/development/commits.md` — Spec trailer on the implementing commit.

## Deviations

None. This spec **closes** the `responsive.md` deviation the 2026-08-29 spec recorded: the
phone now has an explicit reorder path.
