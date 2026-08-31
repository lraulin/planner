# Standards for Compact row-menu submenus

Applied as of standards commit `9e6440766b11ea14b42a3b24bde7fcfbc6be7fb8`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/navigation.md` — folding rule this spec amends; unavailable is disabled with a reason; one shape across row menu and menu bar; Commands panel stays expanded.
- `agent-os/standards/components/data-grid.md` — `rowMenu` stays `(id: string | null) => MenuItem[]`; placement lives on the command.
- `agent-os/standards/components/ux-principles.md` — nothing mouse-only; nested members still print their shortcut.
- `agent-os/standards/components/responsive.md` — below `md` the sheet drills into a submenu with a Back row; more nested families must keep that path.
- `agent-os/standards/development/testing.md` — pure logic in `src/lib/**` with an adjacent test; no React component tests; no new mutation path so no new integration test.
- `agent-os/standards/development/commits.md` — one logical change; Spec trailer pointing at this folder.

## Deviations

`navigation.md` currently says do not fold `Move`. This spec updates that sentence: `Move` nests; `Item` and `Danger` stay flat; `Go` is a new declared family. Floor of two and “declared, not derived from length” stay.
