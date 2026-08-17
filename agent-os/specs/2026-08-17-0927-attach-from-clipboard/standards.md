# Standards for Add attachment from clipboard

**Status: frozen / complete** (2026-08-17)

The following standards apply to this work.

---

## components/navigation.md

A command without a `menu` is not shipped. The row context menu is the row-scoped subset
of the same tree (`rowMenu: true`). Unavailable is disabled with the specific reason,
never absent. Right-click covers rows and blank grid space.

See `agent-os/standards/components/navigation.md`.

---

## components/ux-principles.md

Keyboard-first on desktop: a mouse verb needs a key path (menu / palette is enough; no
dedicated chord required). Immediate, clear feedback for every action. This app has no
toast stack — do not invent one for a single verb. Modals only for confirmations / capture
/ blocking notices.

See `agent-os/standards/components/ux-principles.md`.

---

## components/modal-pattern.md

Every centered dialog is `ModalShell`. `role="dialog"` for a one-button notice.
Unmount-or-hide is fine for a dialog with no draft. Do not add a toast on top.

See `agent-os/standards/components/modal-pattern.md`.

---

## development/clean-code.md

Logic in `src/lib/url/`. Thin `actions.ts`. Components never touch the db. One attach
implementation — reuse `extractHttpUrls` / `normalizeHttpUrl` / `fetchPageTitle`. Avoid
the `tree` → `detail` → `tree` cycle (same constraint as task-name URL promotion).

See `agent-os/standards/development/clean-code.md`.

---

## development/testing.md

Pure logic beside the module. Database mutations as `*.integration.test.ts` with a
cross-user case. No React component tests. A green `test:unit` does not mean the
integration file ran.

See `agent-os/standards/development/testing.md`.

---

## development/security.md

Every mutation takes `userId` first and proves ownership before writing. A missing node
and another user's node are the same error. Do not leak existence.

See `agent-os/standards/development/security.md`.
