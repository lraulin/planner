# Toasts and one-step bank snapshot paste — Shaping Notes

**Status: active**

## Scope

Two things that share one cause:

1. Pasting a bank snapshot on Finances ▸ Accounts is one action, not two clicks. ⌘V on the
   page applies it; the toolbar button reads the clipboard and applies in one click.
2. The app gets one outcome-reporting convention: toasts, bottom corner, no screen space when
   idle. The snapshot receipt is the first user; every other action-outcome notice migrates.

### Out of scope

- Undo / soft-delete behind a toast (mobile-swipe's deferred idea). The toast can carry an
  action, but no undo is built here.
- ⌘V anywhere in the app. Only Accounts listens.
- Sonner or any other toast dependency.
- Persistent-state banners (Google sync failure, reconnect bank), modal validation errors,
  modal "closing is success", drawer "Saved", Settings import reports.
- Removing the iOS Safari "Paste" callout (an OS step).

## Decisions

See `plan.md` D1–D4. In short: paste guards are `isTypingTarget` + `isModalOpen` +
`looksLikeBankBrowserSnapshot`; the textarea is a fallback only; toasts are built in-house;
success fades ~6s (hover pauses), warning/error persist; at most 3 visible.

## Evidence that a convention is needed

Seven frozen specs deferred toasts ("if one lands later it covers this too"). Hand-rolled
dismissible notices exist in BudgetView, PayeesView, SuppliesView, RefreshBanksButton,
BankSyncPanel, ActivityDrawer and the snapshot panel; `useAttachFromClipboard` uses a modal
`NoticeDialog` for want of a toast stack. `modal-pattern.md` said the convention should be
"chosen for the whole app rather than introduced by whichever feature happened to want one
first". This spec is that choice.

## Sketch

```
                              ┌──────────────────────────────────┐
                              │ ✓ Chase •••9910                ✕ │
                              │ 2 posted transitions, 3 pending  │
                              │ View Activity         Details ▾  │
                              └──────────────────────────────────┘
```

## Context

- **Visuals:** None.
- **References:** see `references.md`.
- **Product alignment:** Lee validates on the deployed iPhone, so push to `master`. Desktop is
  the priority, but the toast must clear the bottom nav on phone.

## Standards Applied

See `standards.md`.
