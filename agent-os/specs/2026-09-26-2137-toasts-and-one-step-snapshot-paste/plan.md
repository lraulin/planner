# Toasts and one-step bank snapshot paste

**Status: frozen / complete** (2026-09-26)  
Spec folder: `agent-os/specs/2026-09-26-2137-toasts-and-one-step-snapshot-paste/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` (the snapshot
  paste and its Activity receipt),
  `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/` (the Accounts top actions).
- **Supersedes:** the "no toast" decisions in `2026-07-30-1018-inbox-quick-capture` (toast
  note only; closing stays the success signal), `2026-08-14-1045-export-clipboard` D7 (clipboard
  writes may now toast), `2026-08-17-0927-attach-from-clipboard` (NoticeDialog → error toast),
  `2026-08-25-0922-grid-checkboxes-bulk-category` ("do not add a toast stack"; the skip counts
  become a toast). The rest (`budget-fix-this`, `move-to-ready-to-assign`) only deferred, so
  their outcomes are covered without supersession.

## Context

Pasting a bank snapshot on Finances ▸ Accounts takes two clicks. The toolbar's **Paste bank
snapshot** (`AccountsView.tsx:341`) only toggles a panel, and the panel's **Paste from
clipboard** (`AccountOperations.tsx:92`) does the read and apply. The receipt then renders in
that panel, which can take up to 45dvh.

The app has no shared way to report an action's outcome. Seven specs deferred toasts with "if
one lands later it covers this too" (quick-capture, export-clipboard, attach-from-clipboard,
grid-checkboxes-bulk-category, budget-fix-this, move-to-ready-to-assign, mobile-swipe).
Meanwhile Budget, Payees, Supplies, Refresh accounts, BankSyncPanel, ActivityDrawer and the
snapshot panel each hand-roll a dismissible notice, and `useAttachFromClipboard` falls back to a
modal `NoticeDialog`. `modal-pattern.md` asks for a convention "chosen for the whole app", and
that is this spec. Under "When the model is wrong, change the model", two or more workarounds for
the same missing concept means building the concept.

## Decisions (confirmed with Lee)

- **D1: Paste is one action.** On Accounts, a document `paste` event outside a typing target
  (`isTypingTarget`), with no modal open (`isModalOpen`), whose text passes
  `looksLikeBankBrowserSnapshot` (`src/lib/finances/bankSnapshot.ts:142`) applies it. That is
  zero clicks. Other clipboard text is ignored.
  The toolbar **Paste bank snapshot** button reads `navigator.clipboard.readText()` and applies
  it in one click. It is also a page command (`menu` row + palette, per `navigation.md`).
  The textarea is a **fallback only**: it opens when clipboard read is denied, or when the
  clipboard holds something that is not a snapshot, with the reason shown. It no longer shows by
  default. iPhone Safari's own "Paste" callout is an OS step we cannot remove.
- **D2: The app-wide feedback convention is toasts.**
  - Placement: bottom-right on desktop, bottom-center above the bottom nav and `pb-safe` on
    phone. Newest at the bottom. At most 3 visible; older ones drop.
  - Tones:
    - Success fades after about 6s, and hovering or focusing it pauses the timer.
    - Warning and error toasts stay until dismissed (×).
    - A toast whose outcome carries warnings (snapshot receipt) is a warning.
  - Content: a title, an optional one-line body, at most one **action** (a link or a callback,
    e.g. "View Activity"), and optional **details** behind a "Details" disclosure. The full
    snapshot receipt goes there: deltas and warnings list.
  - When a toast is the right surface: the **outcome of an action whose own surface does not
    visibly show it**. Toasts are not used for:
    - persistent state (the Google sync failure banner, "Reconnect bank / Match accounts")
    - dialog/field validation, where a failed modal stays open with an inline error
    - modal success, where closing still is the signal
    - drawer "Saved" state
    - structured import reports in Settings panels, where the panel is the report
- **D3: We build it ourselves, with no dependency.** `ToastProvider` + `useToast()` + a fixed
  outlet, mounted once in `src/app/layout.tsx`, using our Tailwind tokens. Z-index sits above
  page content and below `ModalShell` (`z-50`), so a dialog still covers it. No portal (same
  stance as `modal-pattern.md`).
- **D4: Migrate every action-outcome notice in this spec.** One convention, not two (see Task 5).
  Standards change with it.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                                                                                                                                                                                             | Why                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | The queue reducer is generic over toast content and the timer is a pure `ToastTimer` (`startTimer` / `pauseTimer` / `resumeTimer` / `timeLeft`) taking `now`.                                                                                                                                      | Keeps React out of `src/lib/toast/` and makes "pause preserves remaining time" testable. |
| 2   | The outlet is `z-40` and lifted by two tap-target rows plus the safe-area inset on phone.                                                                                                                                                                                                          | The bottom nav is an in-flow two-row bar, not a fixed one.                               |
| 3   | `BankSnapshotPaste` became `useBankSnapshotPaste()` + `BankSnapshotFallback`, both in `AccountOperations.tsx`. The hook holds the fallback reason.                                                                                                                                                 | Toolbar button, palette command and document paste share one apply path.                 |
| 4   | `RefreshBanksButton` renders only the button.                                                                                                                                                                                                                                                      | Its inline notice and Activity link became a toast.                                      |
| 5   | `NoticeDialog` is **kept**: `ScheduleView` still uses it. Only `useAttachFromClipboard` stopped using it, so the hook no longer returns `noticeDialog`.                                                                                                                                            | It has another caller.                                                                   |
| 6   | Migrated beyond the list: `ItemList` and `MetricDrawer` CSV import results (success only; errors stay inline), Payees rebuild summary (a warning when charges are unresolved or split), and the partial bulk-category result in `FinancesView` (a warning; "none updated" stays the error banner). | Same rule: an outcome the surface does not show.                                         |
| 7   | `ActivityDrawer` keeps a `restored` flag to disable the button.                                                                                                                                                                                                                                    | The old "Restored." line was what disabled it.                                           |
| 8   | The `PayeeDrawer` alias notice and the `ViewPicker` "View saved" flash stay inline.                                                                                                                                                                                                                | They are in-place drawer or control state.                                               |

## Task 1: Save spec documentation

Create the spec folder with `plan.md` (Status: active, empty **Changes from original plan**),
`shape.md`, `standards.md` (pin standards SHA `30a9c769`), and `references.md` (the specs and
code paths above). No visuals; the ASCII toast mock from shaping goes in shape.md.

## Task 2: Toast model in `src/lib/toast/`

Pure logic plus `toast.test.ts`. Queue reducer: push, dismiss, cap at 3, and whether a tone
auto-expires. Tests that would catch plausible mistakes:

- the cap drops the **oldest**
- warning/error never auto-expire
- dismissing an id that has already dropped is a no-op
- pausing preserves the remaining time rather than resetting it

## Task 3: `ToastProvider` / `useToast()` / outlet in `src/components/shell/`

- API: `toast.success(title, opts)`, `toast.warning(…)`, `toast.error(…)`, where `opts` =
  `{ body?, action?: { label, href } | { label, run }, details?: ReactNode }`. It returns the id.
- The outlet is fixed and `role="status"` (errors use `role="alert"`, wiring not compliance).
  × uses `title="Dismiss"` (the icon-only rule). Tap targets are `min-h-tap` on phone.
- Mount it in `src/app/layout.tsx` inside `SettingsProvider` so every route has it.
- `useToast()` outside the provider throws. That is a wiring error; do not no-op it.

## Task 4: One-step snapshot paste on Accounts

- `AccountsView.tsx`:
  - delete the `snapshotOpen` toggle panel
  - the toolbar button calls a shared `applySnapshotFromClipboard()`
  - add a `paste` listener on `document` using the D1 guards
  - add an `accounts.pasteSnapshot` page command next to Reconcile (menu row + palette)
- `AccountOperations.tsx`:
  - split `BankSnapshotPaste` into a hook (read → `pasteBankSnapshotAction` →
    `router.refresh()` → toast) and a small fallback textarea panel that shows only after a
    denied read or non-snapshot text
  - the receipt becomes a toast:
    - title: account name
    - body: `describeBankSnapshotWrite`
    - details: the deltas line plus warnings
    - action: "View Activity" → `/finances/activity?event=…`
  - a server error becomes an error toast
  - move `describeBankSnapshotWrite` / `formatSignedDelta` into `src/lib/finances/` with a test
    if non-trivial wording logic grows. Otherwise leave them.
- `RefreshBanksButton`: the inline notice + Activity link become a success/error toast.

## Task 5: Migrate the other action-outcome notices

Apply the D2 rule at each site:

- **Moves:**
  - `BudgetView` notice (and its dismiss banner JSX)
  - `PayeesView` / `SuppliesView` notices
  - `BankSyncPanel` sync notice
  - `ActivityDrawer` "Restored." / its error
  - `useAttachFromClipboard` `NoticeDialog` → error toast. Delete `NoticeDialog` if it has no
    other callers.
  - `ItemList` / `MetricDrawer` clipboard-attach status
  - grid bulk-action skip counts where they use `ErrorBanner` for a non-error outcome
- **Stays:** `ScheduleView` Google sync banner, the connection reauth lines, Settings import
  reports, and drawer Saved / autosave status.

Grep `setNotice(` / `setStatus(` / `role="status"` again at the end so no hand-rolled
outcome notice remains.

## Task 6: Update standards

- `modal-pattern.md`: replace "Do not add a toast on top of that. There are none in the app…"
  with: modals still signal success by closing; the app-wide outcome surface is `useToast()`.
- `ux-principles.md`: add a short **Feedback** section with the D2 rule (when to toast, tones,
  what stays inline).
- Run `/index-standards` if a new standard file is added. Prefer editing the existing two.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit`, typecheck, lint.
- Start the dev server and run `npm run smoke`, because `src/app/**` changed.
- In the browser (run-planner), on Accounts:
  - ⌘V with a copied `# planner-bank-snapshot v1` capture applies it and shows a warning or
    success toast with a working View Activity link
  - ⌘V inside the grid's filter box does nothing extra
  - ⌘V of arbitrary text does nothing
  - the toolbar button applies in one click
  - a denied clipboard read opens the fallback textarea
- Check one migrated notice per view (Budget, Payees, Supplies, Activity restore). Check the
  phone width layout (toast above bottom nav, safe area).
- Push to `master` so Lee can check it on the iPhone.
- Freeze: status, as-built drift in **Changes from original plan**, roadmap entry.

> While this spec is **active**, when we make a material change to requirements, design, or
> scope (including from feedback on what was implemented), update the relevant sections and
> append to **Changes from original plan**. Skip pure implementation details. Freeze when
> verified.

## Follow-ups (new work — not amendments to this frozen spec)

- **Not verified in a browser:** a real snapshot's receipt toast and its View Activity link
  (the checks ran against real data, so only a junk snapshot was applied), and the phone
  layout above the bottom nav. Lee checks both on the iPhone.
- Verified in the browser: ⌘V of arbitrary text does nothing; a denied clipboard read opens the
  fallback textarea; a server error shows a persistent error toast bottom-right.
- Not exercised: ⌘V inside the grid filter box (covered by `isTypingTarget`), and the migrated
  Budget, Payees, Supplies and Activity-restore notices (typecheck, lint and `npm run smoke`
  only).
