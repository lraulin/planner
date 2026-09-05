# Standards for the grid column track model

**Status: frozen / complete** (2026-09-05)

Applied as of standards commit `81b5fe3384620ca1e6163feacb64b280c793f204`. References, not
copies — see AGENTS.md. This spec also **amended** `components/data-grid.md`; the section
"Column widths: definite tracks, one filler at the end" landed with the fix.

- `agent-os/standards/components/data-grid.md` — one template shared by header, rows, group
  headers and footer; the column menu mirrors every header gesture (Reset width stays the
  discoverable form of the handle's double-click).
- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the
  model": the elastic name column was already being worked around, and the alternative fixes
  appealed only to the present shape of the code.
- `agent-os/standards/development/testing.md` — the template and resize arithmetic moved to
  `src/lib/grid/template.ts` with an adjacent unit test; no React component tests, and the
  browser drive is what covers the rendering half.
- `agent-os/standards/components/responsive.md` — the compact path keeps no track surface and
  no header; the phone layout is untouched.
- `agent-os/standards/development/commits.md` — one logical change, imperative subject, body
  naming the root cause.

## Deviations

None.
