# Finance pages read what they use, not the ledger — Shaping Notes

**Status: active**

## Scope

Four finance pages load the whole ledger on every request. For each, name what is read, why
that is the minimum, and how the result is proven equal to today's.

- **Accounts** — stops reading ledger rows at all; `loadDashboard` is retired.
- **Bills** — the forecast reads rows filed to bill envelopes; review candidates load when
  their drawer opens.
- **Insights** — unchanged, and the spec says why.
- **Register** — cheaper split-child totals, no redundant second load, a date-window read
  when the Date filter is bounded, facets on demand.

### Out of scope

- Any budget number. No formula in `envelope.ts`, `base.ts` or `budgetContributionSql` is
  touched or restated.
- Moving the Register's filter, search, sort or grouping into SQL.
- Windowing Insights.
- The Uncategorized, Activity and Report views' reads, and unbounded Register queries.
- Track-as-bill draft, Scenarios, export, the agent's analysis and search tools.
- Round trips per query — that is `2026-10-12-2001-node-postgres-driver`.

## Decisions made in shaping (Lee, 2026-10-13)

1. **Review candidates load on open.** The count in "Discover recurring charges · N" is what
   forced 5,906 spend rows onto every Bills load. Lee chose to lose the count over streaming
   it in or keeping it behind a narrower read.
2. **The Register gets a superset date window**, not only the query fixes, and not a cached
   ledger.
3. **Insights is left alone and the reason is recorded.**
4. **The local ledger is refreshed from production before anything is proven.** It ends
   2026-09-05 and holds one row filed to a bill envelope, so a byte-for-byte dump of the
   forecast on it compares almost nothing.

## What shaping measured

Local Postgres, user with 7,100 rows (7,098 bank rows, 7,099 money rows, one split parent),
2020-02-01 to 2026-09-05. Read-only queries, psql timing, output discarded.

| Read                                             | Rows  | Time    |
| ------------------------------------------------ | ----- | ------- |
| `listTransactions` as written                    | 7,098 | ~45 ms  |
| Same without the two correlated split subqueries | 7,098 | ~15 ms  |
| Same shape, one month                            | 9     | ~1.5 ms |
| `readInsightsRows` as written                    | 7,099 | ~14 ms  |
| Rows filed to a `kind = 'bill'` envelope         | 1     | ~1.7 ms |
| Spend charges, the eight columns detection reads | 5,906 | ~9 ms   |

Other counts: 108 income rows, 668 transfer legs, 1 pending row, 7 calendar years, 1,276 rows
in the trailing twelve months. These are database times; the 70 ms and 40 ms in the brief
include decoding and mapping in Node.

Stored grid state for the Register locally is the default (`{"v":3,"view":"all",…}`), so a
mismatch between the server's first query and the client's cannot come from saved columns or
sorts on that data. That is what points at the date key (D7), and why D7 asks for the cause
to be confirmed rather than assumed.

## Rejected alternatives

- **A cached ledger per user behind a version.** Every finance writer — transactions, payees,
  envelopes, accounts — would have to bump the version, and the rows join names from all
  four. A missed bump shows stale money. This is a rule the schema cannot express, enforced
  in application code, which `clean-code.md` names as the signal of a wrong model.
- **Filter, sort and group in SQL.** The pipeline is pure and unit-tested; a second
  implementation in SQL is two answers to one question. D1 keeps SQL to a superset bound.
- **A date window with facets, total and assignability computed from the window.** Wrong, not
  merely different: a transfer whose partner is outside the window would be offered a
  Category. `register-prepared-rows` change #1 fixed exactly this.
- **Streaming the review count.** Keeps the label but still runs detection on every load.
- **A compact (columnar) Insights payload.** Would roughly halve ~5 MB. Not chosen; it stays
  available as a follow-up that does not need a windowing design.
- **Dumping against production, or relying on fixtures alone**, for the equality proof.

## Context

- **Visuals:** None. Read-path work; the one visible change is the review button's label.
- **References:** see `references.md`.
- **Product alignment:** Daily-use performance (`roadmap.md`, the
  `2026-08-10-1940-daily-use-performance` line). Not a named roadmap item; note it under
  Financial planning at freeze. Desktop is the priority; nothing here is mobile-specific.

## Standards Applied

See `standards.md`. The two that shape the design are `database/read-latency` (reads go out
together; at most about ten in a wave) and `development/testing` (a second user must get
nothing from every read).
