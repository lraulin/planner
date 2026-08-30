# Fix This — our layout

Not a YNAB pixel clone. The job is theirs; the chrome is this app’s Budget card + ModalShell.

The shaping screenshots (`ynab-move-money.png`, `ynab-leftover-moved.png`) are envelope-to-envelope Move Money with a leftover shortcut. They are **not** the shipped UI. Lee then described YNAB’s actual Fix This panel (red hole, Un-assign money from, month chevron, category Available list). That job, plus “put the verb on the number,” is what we ship.

## Summary card (the discoverability fix)

Today the Assign button is `ml-auto` on the opposite edge from the Ready to Assign figure, behind the muted note. Lee almost did not see it.

```
┌──────────────────────────────────────────────────────┐
│  −$9,765.23  [Fix This]                              │
│  assigned more than you have                         │
│                                                      │
│  Funds from last month   Income   Assigned   …       │
└──────────────────────────────────────────────────────┘
```

- Number and button share a baseline. No `ml-auto`.
- Note sits **under** the number, never between number and button.
- Negative: button label **Fix This**, spend-token emphasis.
- Non-negative, or a past month: same slot is **Assign** (existing rule-border control).

## Un-assign dialog

```
┌ Un-assign money from                          Aug ▾ ┐
│  −$9,765.23                                         │
│  You assigned more than you have                    │
│                                                     │
│  Regular spending                                   │
│    Groceries                             $3,200.00  │
│  Bills                                              │
│    Pizza                                    $21.65  │
│    GEICO                                   $515.66  │
│    …                                                │
│  Savings                                            │
│    …                                                │
│                                                     │
│  Pizza · $21.65 Available                           │
│  Amount  [ $21.65 ]  MAX                            │
│  This will take Pizza from $21.65 Available         │
│  to $0.00. Ready to Assign from −$9,765.23          │
│  to −$9,743.58.                                     │
│                              [Cancel]  [Un-assign]  │
└─────────────────────────────────────────────────────┘
```

Empty picker month: “Nothing in {month} has Available to un-assign.”
