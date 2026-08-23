# Shape — Payee matcher cutover

**Status: frozen / complete** (2026-08-23)

## Problem

The catalog has a correct long-term identity model but the business behavior still joins on
merchant display strings. That makes a rename unsafe, keeps exclusivity in application code,
and leaves schedules and commitments talking about the same payee through incompatible
representations. A partial switch already proved dangerous: changing one side moved Available
to Spend while the app still compiled and rendered.

The change therefore has to move the complete semantic boundary, not merely replace a field
in one form.

## Appetite and scope

This is a deliberate cross-cutting model correction. It includes the migration bridge,
commitment and schedule readers, editors, agent contracts, Rename/Merge UI, legacy-column
retirement and end-to-end parity checks. It preserves every budget formula and the established
two-tier commitment workflow.

Rules, auto-learning, per-transaction payee overrides and report enhancements stay out.

## Shaping decisions

- Stable ids are the only authoritative join; names remain presentation.
- The cutover is two-stage because live rows must be proven resolvable before columns can be
  removed. Compatibility is a deployment mechanism, not a permanent dual model.
- The bridge resolves alias first, exact payee name second, and otherwise creates a
  placeholder. This preserves the semantic promise of unmatched legacy tokens such as
  `DOMINOS` without inventing historical charges.
- The bridge stops the whole user before writing when any condition is malformed, any payee
  would have conflicting commitment claims, or any parity check fails.
- Schedule conditions retain Actual's JSON condition vocabulary; only their payee values
  become UUIDs.
- Commitments may have no claimed payee. Absence is honest and does not need a fake matcher.
- Rename is routine editing; Merge is a consequential consolidation with a preview and
  confirmation. Both reuse the existing Payees grid, drawer/sheet and modal patterns.
- New agent contracts are id-first. Hidden adapters preserve old wire callers during the
  transition without teaching new callers the obsolete shape.

## Rabbit holes deliberately avoided

- Building the generic Rules engine during the identity cutover.
- Keeping both names and ids authoritative indefinitely.
- Replacing the prepared payee model with Actual's sync-oriented `payee_mapping` table.
- Adding per-row payee correction, which would undermine alias-level correction.
- Recomputing or changing envelope-budget formulas while changing the join key.

## Risks and circuit breakers

| Risk                                                | Circuit breaker                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A legacy matcher silently resolves to nothing       | Planner reports it or creates an explicit placeholder before any write              |
| One payee is claimed twice                          | Planner conflict plus the payee-row CHECK/claim transaction                         |
| Schedule JSONB holds a dangling id                  | Stage A validation, merge rewrite, delete refusal and Stage B guard                 |
| A display rename changes money                      | Every business match uses ids; numeric parity plus rename verification              |
| A partial deployment matches neither representation | Stage A dual support, then one Stage B switch guarded by audited state              |
| Cross-user mutation leaks finance data              | Every executor/mutation takes `userId`; integration tests attack read/change/delete |

## No visuals

The existing Payees DataGrid, Payee drawer/sheet, shared picker, command registry and
`ModalShell` patterns are sufficient. The work changes identity and operations, not the
application's visual language.
