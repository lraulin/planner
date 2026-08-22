# Standards for Register — Track as bill

The following standards apply to this work. Referenced, not copied, so later edits stay in force.

- `@agent-os/standards/components/navigation.md` — a command without a menu is not shipped; unavailable is disabled with the specific reason, never absent; the row menu is the same registry as Item / palette / `⋯`; nothing is reachable only by right-click
- `@agent-os/standards/components/modal-pattern.md` — every centered dialog is `ModalShell`; unmount a dialog that holds a draft; failed submit keeps it open; closing is the success signal
- `@agent-os/standards/components/responsive.md` — long-press is the row menu as a bottom sheet; `ModalShell` is already a bottom sheet below `md`; swipe is not a path for this (irreversible-looking capture)
- `@agent-os/standards/development/testing.md` — pure logic beside the lib module; no React component tests; no new mutation, so no new integration suite; existing `upsertRecurringBill` cross-user coverage stands
- `@agent-os/standards/development/dates.md` — cadence and next-due are `YYYY-MM-DD` keys; `todayKey` from `useToday` / `localDateKey`; never `Date` / `startOfDay` for calendar arithmetic
