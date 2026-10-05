# Scenarios — Shaping Notes

**Status: frozen / complete** (2026-10-04)

## Scope

A Finances page, **Scenarios**, that answers "will my income cover the month I am planning
to live?" for a month that does not exist yet. Each scenario is a named worksheet: Regular
income and bills arrive live from the app and can be switched off or repriced for that
scenario only; free-form lines cover everything else. Income minus the rest is the
remainder.

The prompting case is a house purchase closing in about three weeks. Rent is still a real
bill, the mortgage is not yet one, and this month's dollars are all assigned, so the Budget
page has nowhere to put the question.

### Out of scope

- Applying a scenario to budget targets or allocations.
- A dated cash-flow projection, a cushion runway, or one-off purchases (fence, catio). A
  scenario is one steady-state month.
- Agent tools that write a scenario.
- Detecting that a bill and a Supplies line describe the same spending.

## Decisions

Each was put to Lee as a question with the evidence first; the answer is what is recorded.

- **Own page, not a section of Bills or Budget.** Lee's condition: most bills will be the
  same in a scenario as they are today, and he will not duplicate them by hand. That is
  what makes bills live rows rather than copies.
- **Several named scenarios**, not one standing worksheet.
- **Bills are live and switchable** per scenario, with an optional amount override.
- **A line can do all four things offered:** take an amount at any cadence; show last
  year's actual beside the plan; pull its amount from Supplies; hold sub-lines.
- **Both actuals helpers are in:** seed lines from last year's spending, and name the
  spending no line covers.
- **Page name is Scenarios.** "Forecast" already names the Next 12 months panels on Bills;
  "Plan" is the weekly Plan module and Budget's Plan margin.
- **A read-only agent tool**, so the conversation in Chats that raised this can read the
  real worksheet.
- **Supplies groups become rows.** A group was a free-text label on each item, so a line
  could only have followed it by matching the string, and a rename would have dropped the
  line to $0 silently. Lee chose the migration over linking to items only.

### Why a sub-line breakdown here and not in the budget

Lee has tried splitting envelopes this finely ("one can of formula a week") and found the
receipt-checking and split transactions cost more than they return. A planning worksheet
has no transactions to attribute, so the same breakdown is free here. This is the reason
D2 keeps the page from writing to the budget.

## Evidence gathered while shaping (2026-10-04)

| Figure                                       | Per month       | Source                      |
| -------------------------------------------- | --------------- | --------------------------- |
| Declared active bills excluding Rent         | $1,001.71       | `list_recurring_bills`      |
| Rent → mortgage                              | $2,100 → $2,429 | bill; Lee's spreadsheet     |
| Trailing-12 cost of living excluding housing | $3,142.88       | `get_spending_breakdown`    |
| …of which is not a bill                      | ≈ $2,141        | difference of the two above |
| Spreadsheet income (take-home + VA)          | $4,802.86       | Lee's spreadsheet           |
| Spreadsheet remainder                        | $1,372.16       | Lee's spreadsheet           |

The $1,001.71 is the annual total of active bills ($39,643.47) less Rent ($25,200) and
less three detected-but-undeclared merchants ($2,422.97), over twelve. It matched the
spreadsheet's 1001.7 to the cent, which is how the spreadsheet's Bills figure was
identified as "Bills page total, rent subtracted by hand".

Two bills inside that figure end at closing and were not in the spreadsheet: Renter's
Insurance ($220/yr) and Rent Reporting ($4.99/mo).

## Context

- **Visuals:** `visuals/spreadsheet.png` — the LibreOffice sheet this replaces.
- **References:** see `references.md`.
- **Product alignment:** Finances is outside Achieve Planner's scope, and neither Actual
  Budget nor YNAB has this surface. It is net-new intent in the same family as Supplies,
  and it leaves the envelope math alone.
- **Origin:** a conversation in Chats about where zero-based budgeting stops. Its framing
  is the one kept here: an envelope budget is a funding schedule for money you hold; a
  spending plan is a test of income against a way of living.

## Standards Applied

See `standards.md`.
