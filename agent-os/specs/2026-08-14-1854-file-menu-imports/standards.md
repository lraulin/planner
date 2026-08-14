# Standards for File-menu imports

File references only — the files stay the source of truth.

@agent-os/standards/components/navigation.md
@agent-os/standards/components/modal-pattern.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/development/commits.md

These cover:

- Menu bar is the complete catalog; File is leftmost; a command without `menu` is not shipped (except `go.*`); same label/icon/action on every surface; toolbar ⊂ menus; declared families fold, a single command does not
- Every centered dialog is `ModalShell` (`labelledBy`, capture-phase Escape)
- Modals for confirmations and this kind of task; error prevention over recovery
- Pure logic in `src/lib` with a sibling test; no React component tests
- One shared implementation per concern; app → components → lib
- One logical change per commit; effect-naming subject; Spec trailer
