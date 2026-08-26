# References for Payee evidence, merge from the envelope, and normalizer repair

## The ledger analysis that decided this spec

**This section is the evidence for what this spec does _not_ build.** It was measured once,
against a real production export, and must outlive the conversation that produced it. Anyone
proposing an amount/date matcher or a rules table again should re-measure before arguing.

**Source:** `Transactions.csv`, a 7,322-row Finances export of the production ledger
(2020-02 … 2026-08), taken 2026-08-25. Not committed — it is personal financial data. The
local dev database was checked first and rejected as stale: it holds 7,030 real transactions
but only **11 envelopes**, predating the current budget work, and shows Apple as fully
categorised to a single envelope, which production contradicts.

Merchant grouping used the app's own `normalizeMerchant` (`src/lib/finances/classify/merchant.ts`)
so the numbers match how the app actually groups.

### Shape of the ledger

|                   |                                                               count |
| ----------------- | ------------------------------------------------------------------: |
| Rows              |                                                               7,322 |
| Envelopes in use  |                              28 (+ `Uncategorized`, `Not budgeted`) |
| Categorised       |                                                                ~900 |
| **Uncategorized** |                                                           **5,528** |
| `Not budgeted`    | 892 — all transfers and interest/fees, correctly outside the budget |

### Finding 1 — one payee never needs two envelopes

Of **72** categorised merchants, exactly **one** routes to more than one envelope:

```
PAYPAL TO LEE RAULIN INST XFER → Spotify(3), Dropbox(1)
```

That is an opaque-identity artifact — a PayPal rail string the bank did not attach a merchant
to — not a categorisation split. The same query against the local database found only
`Pizza Hut → Discretionary(96), Pizza(1)`, a stray misfile with fully overlapping amounts.

**Therefore: the payee is the correct grain. A finer grain has nothing to discriminate.**

### Finding 2 — payee+amount+date matching would recover zero rows

Every bill envelope is already cleanly separated by its merchant strings, with **no unfiled
leakage**:

```
CVS ExtraCare               CVSEXTRACARE(31)
Copilot (GitHub)            GITHUB INC(34)
Home Security (SimpliSafe)  SIMPLISAFE(34)
Water & Sewer               ST MARYS COUNTY METROPOLI(30)
Dante's Meds (VetSource)    VETSOURCE(11)
```

…and likewise YouTube, VA, SMECO, ChatGPT, MetLife, Comcast, Anthropic, Geico, SuperGrok,
Taylor Gas, Evergreen, Lotus Eaters, Rent.

A matcher implementing Actual's schedule identity — payee + amount within 7.5% + date within
±2 days of a cadence occurrence — was run against every bill's unfiled same-merchant rows.
**It recovered 0 rows.** There is no work for it to do.

Two near-misses that look like counter-evidence and are not:

- **26 uncategorised `$5.00` CVS charges** are not missed ExtraCare rows. ExtraCare normalises
  to `CVSEXTRACARE`; those are `CVS/PHARMACY` — genuinely discretionary $5 purchases.
- **A `$2.11` Apple charge repeating 46× on day 10** is a real subscription pattern, but no
  bill has been declared for it. When one is, the payee claim files it. Nothing needs a matcher.

Signal strength, for the record, if this is ever revisited:

| envelope           | amount as discriminator                                   | date as discriminator                              |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| CVS ExtraCare      | strong — 1 distinct amount                                | day 19 (28 of 31)                                  |
| Spotify            | **weak — 6 distinct amounts** (price rose over the years) | strong — day 13                                    |
| Apple (undeclared) | $2.11 × 46                                                | day 10 — but day 10 is also many unrelated charges |

Neither signal alone separates these; together they would — which is why the design was
attractive and why the zero-row result is the thing that settles it.

### Finding 3 — the existing learning guard is correct, and invisible

`shouldLearnFromCategoryEdit` (`src/lib/finances/payees/autoCategory.ts`) holds a first default
until the payee has no remaining uncategorised eligible charges. Against real data that guard
already produces the right answer in both directions:

- **Apple** — filing 12 of 292 by amount leaves 280 unfiled → **holds**. This is the incident
  that prompted the spec; the guard already prevents it.
- **Amazon** — filing all 372 `AMAZON MKTPL` rows leaves 0 → **learns**. Correct and desirable.

Nothing in the UI reports which happened. **That is the actual defect** — hence D3.

### Finding 4 — payee fragmentation is the real blocker

Nearly every envelope is fed by two to five strings that are one payee:

```
Spotify     ← SPOTIFYUSAI(26) · SPOTIFY(15) · P(6) · PAYPAL TO LEE RAULIN INST XFER(3)
Groceries   ← WM SUPERCENTER(70) · WAL-MART(57) · WALMART(5) · HARRIS TEETER(1) +37 unfiled
ChatGPT     ← OPENAI *CHATGPT(15) · CHATGPT(13)
Comcast     ← COMCAST / XFINITY(15) · COMCAST800-COMCASTMD(4) · COMCAST / XFINITY800-…(1)
Geico       ← GEICO *AUTO DC(3) · GEICO *AUTO(2) · GEICO *AUTOWWW.GEICO.COMDC(1)
Pizza       ← PIZZA HUT(100) · DOMINO'S(52) · DOMINO'S 6066CALIFORNIAMD(6) · …
```

These are filed correctly only because they were filed by hand. Learning keys on the payee, so
each fragment learns separately.

### Finding 5 — the backlog is ~6 decisions, not 5,528 rows

Merchants with a known destination and rows still waiting:

| merchant         | filed | waiting | destination      |
| ---------------- | ----: | ------: | ---------------- |
| AMAZON           |     1 |     526 | General Spending |
| AMAZON MKTPL     |    11 |     372 | General Spending |
| APPLE/BILL       |     3 |     286 | General Spending |
| CVS/PHARMACY     |     4 |     165 | General Spending |
| AMAZON PRIME     |     1 |     131 | General Spending |
| SHEETZ           |     3 |      67 | General Spending |
| GA8248 TRUSTEDQA |     2 |      55 | Payroll          |
| HARRIS TEETER    |     1 |      37 | Groceries        |
| WM SUPERCENTER   |    70 |       1 | Groceries        |

≈1,500 rows behind roughly six decisions. **`WM SUPERCENTER` is the only merchant with deep
evidence, and it has nothing left to gain** — every high-volume merchant is thinly filed, which
is what made the "wait until nothing is unfiled" guard read as over-cautious. It is not.

A first pass mistook this table for a hazard, reasoning that 1,684 rows would sweep into
General Spending on 1–4 filed rows of evidence. **That reading was wrong**, and the correction
is D1: General Spending is discretionary spending — a deliberate, correct destination for
Amazon, CVS and Sheetz — not a catch-all standing in for "unsure".

### Finding 6 — where the remaining work actually is

Of 5,528 uncategorised rows, **3,707 are on 671 merchants never categorised at all**, and
**416 of those merchants have exactly one row**. The top 10 unseen merchants cover 47%; the top
25 cover 59%.

**The Amazon family is 2,328 rows (42% of the whole backlog) across 64 merchant strings.** No
payee, amount, or date matcher can resolve these — the discriminator is the order contents.
That is `scripts/amazon-orders-slim.ts` territory and its own spec. It is recorded here as the
largest single remaining slice.

### Finding 7 — normalizer damage, and why a blind sweep is unsafe

Merchants of ≤3 characters, i.e. strings the normalizer destroyed:

```
"P"    ← PP*P36C17FF0B, PP*P35D2FE7E5, PP*P34E4FB030, PP*P3407FC0FA
"UBR"  ← UBR*
"NQR"  ← PAYPAL *NQR35314369001
"BP"   ← BP#9310152EP 5 290598250
```

`PP*` is stripped as a processor prefix, then `TRAILING_ORDER_REF` / `TRAILING_NUMBER` eat the
rest, leaving a one-letter alias that becomes a payee.

Separately, **~140 merchants carry a city/state glued on** by fixed-width bank fields:
`SAFEWAY 1731PRINCE FREDERMD`, `WAWA 592CALIFORNIAMD`, `KIMS NAILS IIICALIFORNIAMD`,
`LOWES #00719*CALIFORNIAMD`, `STEAM GAMESSAN JOSEWA`.

**A prefix-matching sweep was tested against the full export and is provably unsafe.** It merged
96 merchants and re-pointed 976 rows, including:

| proposed merge                     | why it is wrong                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AMAZON PRIME → AMAZON`            | collapses a subscription into discretionary — destroys the exact distinction the budget exists to make |
| `GRAY MIRROR → GRAY`               | merges the correct name into the damaged fragment                                                      |
| `PLAYSTATION DIRECT → PLAYSTATION` | "DIRECT" is not a city or a state                                                                      |
| `EVERGREEN DISPOSAL`               | a naive trailing-state strip truncates it to `EVERGREEN DISPOS` on the "AL"                            |

Hence D6: fix the provable residue outright, and surface city/state candidates as **proposals**
behind the D7 audit. These three are pinned as regression tests.

## Governing specs

### `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Extends its **D7**; **supersedes its D8**.
- **Carries forward unchanged:** `finance_payees.claimed_budget_category_id` /
  `default_budget_category_id` / `auto_category_mode`; claim beats learned/fixed default; learn
  immediately from the first manual assignment, then 2-of-latest-3; uncategorised rows occupy a
  window position but never vote; previously categorised rows are never rewritten.
- **What changes:** D8 said "Payees is the only auto-category surface." Findings 3 and 4 are
  the counter-argument — the consequence of a default is visible at the _envelope_, so that is
  where the evidence has to appear.
- **Its D6 (Retire Rules) stands**, now supported by Findings 1 and 2 rather than only by the
  observation that the Rules page was unusable.

### `agent-os/specs/2026-08-23-1536-finance-rules/`

- **Relationship:** Not revived. Recorded here so the next agent does not re-propose it.
- Its `{field, op, value}` conditions, first-match-wins ordering, seeding, and **Run rules** are
  all still retired. Finding 1 says a rule language would have one row to express in this
  ledger, and Finding 7 says that one row is an identity problem instead.

### `agent-os/specs/2026-08-23-0748-finance-payees/` and `…-1041-payee-matcher-cutover/`

- **Relationship:** Extends both.
- **Carries forward:** payee identity is a row; **aliases are the join key and the canonical name
  is display only** (`payees/resolve.ts` — matching is exact on the normalized merchant, nothing
  matches patterns); merge keeps the target's claim and configuration; conflicting claims block.
- **Key pattern borrowed:** the guarded two-stage migration — pure deterministic planner,
  dry-run by default, idempotent, reporting counts rather than ids. D7 of this spec reuses it.
- **Relevant to D6:** `isOpaquePaypalDescription` already treats a `< 3` character result as
  opaque and prefers a resolved counterparty; the `P` residue is that path failing to have one.

### `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/` (active)

- **Relationship:** Extends. Filter → select all → **Set category…** is the teaching gesture the
  user described, and it already exists.
- **Carries forward:** one bulk mutation `setTransactionBudgetCategories(userId, ids, categoryId)`,
  ineligible rows skipped rather than refusing the run, and payee learning called **once per
  distinct payee** in the written set. This spec adds no new learning trigger — it reports the
  outcome of this one.

### `agent-os/specs/2026-08-25-1633-budget-inspector/`

- **Relationship:** Extends. `BudgetInspector.tsx` is the pane gaining the section; it already
  hosts Available balance, Target, Bill, and Notes sections and an **Edit payees…** button
  (`onEditPayees`), which is the closest existing affordance.

## Reference implementation — Actual Budget (MIT, © James Long)

Cloned beside this repo at `../actual`. See `docs/actual-budget/README.md`.

Read during shaping and **deliberately not adopted**, recorded so the evaluation is not repeated:

- `packages/loot-core/src/server/schedules/find-schedules.ts:63-73` — schedule discovery matches
  on payee identity + amount within `getApproxNumberThreshold` (7.5%) + a date rank over ±2 days.
- `packages/loot-core/src/server/rules/condition.ts:281-296` — `isapprox` on a date against a
  recurrence is `schedule.occursBetween(date - 2, date + 2)`.
- `packages/loot-core/src/shared/rules.ts:234` — `getApproxNumberThreshold`, already mirrored in
  `src/lib/finances/amountMatch.ts`.

This is the correct model for "same payee, roughly this amount, roughly this day," and it is what
an amount/date matcher here would have implemented. Finding 2 is why it is not being built:
the semantics are right and the ledger has no rows for them to claim.

## Code references

| Path                                                 | Relevance                                                                                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/finances/payees/autoCategory.ts`            | `shouldLearnFromCategoryEdit`, `nextLearnedDefault`, `majorityOfLatestThree`, `inferredDefault`. D2 keeps all of it; D3 renders the guard's answer rather than restating it. |
| `src/lib/finances/payees/learn.ts`                   | `learnFromCategoryEdit` / `relearnPayeeDefault` — the write path after a category edit.                                                                                      |
| `src/lib/finances/budget/mutations.ts:942`           | `setTransactionBudgetCategories` — bulk write, then learning once per distinct payee (`:1034-1042`). D5 extends this.                                                        |
| `src/lib/finances/payees/resolve.ts`                 | `aliasFor`, `payeeIndex`, `isOpaquePaypalDescription`. Alias matching is exact — the seed planner and this module must always agree on the key.                              |
| `src/lib/finances/classify/merchant.ts`              | `normalizeMerchant` and its strip order. The D6 repair site.                                                                                                                 |
| `src/lib/finances/payees/merge.ts`                   | Existing merge semantics reused by D4.                                                                                                                                       |
| `src/components/finances/budget/BudgetInspector.tsx` | Section pattern, `labelClass` / `fieldClass`, `onEditPayees`.                                                                                                                |
| `scripts/flow-audit.ts`                              | The read-only audit shape D7 copies: no `--apply`, and a header saying why.                                                                                                  |
| `src/lib/finances/amountMatch.ts`                    | Actual's 7.5% band. Stays — `Track as bill` uses it; this spec adds no caller.                                                                                               |
