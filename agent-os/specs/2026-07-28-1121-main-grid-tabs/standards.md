# Standards for Main Grid Tabs

Applied as of standards commit `b39d49a`. References, not copies — see AGENTS.md.

- `agent-os/standards/components/ux-principles.md`

  **Why it applies:** this spec builds four grids and one column chooser. The standard
  decides which cells are editable inline and which are read-only rollups, forbids the modal
  Achieve uses for its Select Project dialog, fixes the `Enter` / `F2` bindings the new tabs
  must match, and mandates revert-and-flag rather than silent clearing on unparseable input.

- `agent-os/standards/components/drawer-pattern.md`

  **Why it applies:** all four new tabs open the same `NodeDetailDrawer` on `Enter` and
  double-click. The open/close flow, the `{open && node && ...}` guard, the focus return to
  the originating row, and the server-action contract carry over unchanged. Note the one
  place this spec touches it: `revalidatePath("/outline")` is hardcoded in `run()`, which
  breaks the "there is no separate refresh call to make" promise once a mutation originates
  from `/projects`.

Deviations: none recorded.

<!-- The standards text was formerly inlined here. It lives in agent-os/standards/
     and, as it stood at freeze, in `git show b39d49a:agent-os/standards/<path>.md`. -->
