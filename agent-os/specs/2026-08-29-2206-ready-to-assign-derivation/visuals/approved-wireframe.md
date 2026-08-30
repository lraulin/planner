# Summary card — before and after

## Before

Seven equal-weight chips wrapped in a row. No operators, no alignment, no total. A $100,470.76
assignment and a $7.41 filing residue render at identical size, weight and colour.

```
┌────────────────────────────────────────────────────────────────────────┐
│  -$7.41   [ Fix This ]                                                 │
│  assigned more than you have                                           │
│ ────────────────────────────────────────────────────────────────────── │
│  Funds from last month $561.90   Income this month $100,030.95         │
│  Overspent last month $0.00   Assigned -$100,470.76   Held for next    │
│  month $0.00   Uncategorized activity -$7.41   Account reconciliation  │
│  -$122.09                                                              │
│  Account pool $95,678.08 = Ready to Assign + envelope balances.        │
│  Credit-card debt reduces the pool; a payment between on-budget        │
│  accounts does not.                                                    │
└────────────────────────────────────────────────────────────────────────┘

   ... ~400px of page, two grids ...

┌────────────────────────────────────────────────────────────────────────┐
│  3 transactions have no category since August                          │
│  -$7.41 unaccounted for                              [ Categorize ]    │
└────────────────────────────────────────────────────────────────────────┘
   ^ border-rule / bg-surface-raised — indistinguishable from chrome,
     which is why it was never noticed
```

## After

```
┌────────────────────────────────────────────────────────────────────────┐
│  -$7.41   [ Fix This ]                        Account pool $95,678.08  │
│  assigned more than you have                                           │
│                                                                        │
│  ┏━ --goal-unmet ────────────────────────────────────────────────────┐ │
│  ┃ ⚠ 3 transactions have no category since August · -$7.41           │ │
│  ┃                                                    Categorize →   │ │
│  ┗───────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ▸ How this adds up                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

Expanded:

```
┌────────────────────────────────────────────────────────────────────────┐
│  ▾ How this adds up                                                    │
│                                                                        │
│      Funds from last month                              $561.90        │
│      Income this month                              $100,030.95        │
│      Overspent last month                                 $0.00        │
│      Assigned                                      -$100,470.76        │
│      Held for next month                                  $0.00        │
│      Uncategorized activity                              -$7.41        │
│      Account reconciliation                            -$122.09        │
│     ───────────────────────────────────────────────────────────        │
│      Ready to Assign                                     -$7.41        │
│                                                                        │
│      Account pool $95,678.08 = Ready to Assign + envelope balances.    │
│      Credit-card debt reduces the pool; a payment between on-budget    │
│      accounts does not.                                                │
└────────────────────────────────────────────────────────────────────────┘
```

## Notes

- Amounts are `.tabular` (IBM Plex Mono) right-aligned in one column; labels are Archivo, left.
  The alignment plus the rule and the restated total is the entire fix — the same seven numbers
  become legible as a calculation.
- `Assigned in future months` joins the column whenever it is non-zero (`month-ahead` D3).
- The amber line is gated on **count**, never on amount, so it survives a sum that cancels to
  zero. It is absent entirely at zero count.
- The `⚠` glyph is decorative and `aria-hidden`; the line is `role="status"`.
- At phone width the amber line wraps to two rows and the pool figure drops below the note. The
  card is inside a sticky header, so neither may push the grids off screen.
