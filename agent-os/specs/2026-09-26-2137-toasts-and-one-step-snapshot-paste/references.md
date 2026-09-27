# References for Toasts and one-step bank snapshot paste

## Governing specs

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends. The snapshot paste, the Activity receipt (`/finances/activity?event=`).

### `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/`

- **Relationship:** Extends. Accounts top actions: Refresh accounts, Paste bank snapshot, Import.

### Specs that deferred or refused toasts

- `2026-07-30-1018-inbox-quick-capture` (toast built then removed; closing is the signal — kept)
- `2026-08-14-1045-export-clipboard` D7 — **superseded**: clipboard writes may toast
- `2026-08-17-0927-attach-from-clipboard` — **superseded**: NoticeDialog → error toast
- `2026-08-25-0922-grid-checkboxes-bulk-category` — **superseded**: no-toast-stack decision
- `2026-08-29-2033-budget-fix-this`, `2026-09-07-1314-move-to-ready-to-assign`,
  `2026-08-08-1757-mobile-swipe-row-actions` — deferred only

## Similar implementations

### Notices to migrate

- `src/components/finances/accounts/AccountOperations.tsx` — `RefreshBanksButton`, `BankSnapshotPaste`
- `src/components/finances/accounts/AccountsView.tsx` — `snapshotOpen` panel, Reconcile page command (pattern for the new command)
- `src/components/finances/budget/BudgetView.tsx` (~L1658), `payees/PayeesView.tsx`, `supplies/SuppliesView.tsx`
- `src/components/settings/BankSyncPanel.tsx`, `src/components/finances/activity/ActivityDrawer.tsx`
- `src/components/grid/useAttachFromClipboard.tsx` + `src/components/detail/NoticeDialog.tsx`
- `src/components/detail/ItemList.tsx`, `src/components/metrics/MetricDrawer.tsx`

### Stays inline

- `src/components/schedule/ScheduleView.tsx` (~L997) Google sync banner

### Building blocks

- `src/lib/finances/bankSnapshot.ts` — `looksLikeBankBrowserSnapshot`, `PLANNER_BANK_SNAPSHOT_HEADER`
- `src/lib/keyboard.ts` — `isTypingTarget`, `isModalOpen`
- `src/components/detail/ModalShell.tsx` — `z-50` layer the outlet must sit under
- `src/app/layout.tsx` — provider mount point
- `scripts/*.user.js` — the userscripts that put the snapshot on the clipboard
