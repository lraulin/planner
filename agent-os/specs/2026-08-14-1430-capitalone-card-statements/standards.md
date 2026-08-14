# Standards for Capital One card statement PDF import

The following standards apply. Full text lives in `agent-os/standards/`; this file
records why each one is in play.

## development/testing

Pure parser beside the module. Integration tests must prove: rows land on the existing
3448 account, CSV↔statement overlap skips both directions, re-import is a no-op, a
user-edited category survives, and a second user still cannot see the first user's
statements. No React tests. No real PDFs in fixtures.

## development/dates

Ledger dates are calendar days. Build `YYYY-MM-DD` from the period year + `Mon D`.
Never `new Date("YYYY-MM-DD")` and never process-local midnight. Dec–Jan wrap uses
the period's start/end year, not `Date` arithmetic.

## development/clean-code

Logic in `src/lib/finances/`. Persist stays in `import.ts`. Do not fork a second
import path. The card parser is its own module because the layout is not Chase and
not 360 — shared helpers only where the rule is the same (supported-formats string,
amount parse, skip).

## development/security

Statements contain name, address, and a full account number. Fixtures are invented.
Do not log extracted text. Import still scopes every write by `userId`.

## api/response-format

Existing `{ ok, created, skipped, statementsCreated, statementsSkipped, warnings }`
envelope. A bad PDF is a per-file warning, not a 500.

## development/commits

One logical change per commit. Effect-naming subject. Spec trailer pointing at this
folder.
