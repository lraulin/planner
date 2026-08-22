# Register — Track as bill — Shaping Notes

**Status: frozen / complete** (2026-08-21)

## Scope

A **Track as bill…** command on the Finances Register. Right-click (or Item menu / long-press) a spend row, confirm a name-first dialog prefilled from that merchant's history, write the existing bill declaration.

### Out of scope

- Track as spend
- Join as alias / add-to-existing
- Category, URL, unscheduled, due-day in the dialog
- New mutation, schema, or agent tool
- Jumping to Commitments after save
- Swipe or toolbar placement

## Decisions

- Name-first dialog (Commitments clarity D3), not a write on click. Copy is **Track as bill…** to match Review, not "Make it a bill".
- Bills only. Recurring spend stays a Commitments Review decision.
- Create only: already-claimed merchants disable the command with a reason. Dismissed/cancelled still hold matchers.
- Only `spend` can be a bill. Pending spend is allowed.
- Prefill from every spend charge of that `effectiveMerchant` already on the Register, not from the one row.
- One command declaration feeds every surface (`pageCommand` on `catalogCapabilities`). Modal, not expand-in-place: Register is a grid, not a proposal list.
- Reuse `setRecurringBillAction`. Closing the dialog is the success signal.

## Context

- **Visuals:** None
- **References:** Commitments Review `BillDraft`, Register `catalogCapabilities`, `upsertRecurringBill`
- **Product alignment:** Hole in the Commitments create surface, not a new roadmap item. You see the charge in the Register.

## Standards Applied

- components/navigation — not right-click-only; disable with a specific reason; one registry
- components/modal-pattern — ModalShell; unmount drafts; stay open on failed save
- components/responsive — long-press is the row menu; dialog is a bottom sheet
- development/testing — pure draft logic + unit tests; no component tests; no new mutation
- development/dates — `YYYY-MM-DD` keys; `useToday` / `localDateKey`
