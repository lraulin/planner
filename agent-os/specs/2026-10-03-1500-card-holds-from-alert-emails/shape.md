# Card holds from alert emails — Shaping Notes

**Status: active** (2026-10-03)

## Scope

Get current card activity into Planner with no manual step and no LLM tokens. Lee's Grok bot
read his email on a schedule and created pending rows by hand; a deterministic parser does the
same job for free. Alert emails supply **holds**; SimpleFIN supplies **posted history** for both
cards; the bank-page paste is retired for them.

### Out of scope

See `plan.md`.

## Context

- Lee, 2026-10-03: believed credit cards already took updates only from SimpleFIN. They did not
  — both are `bank_page` (Capital One since 2026-09-22, Chase since 2026-09-24).
- Lee also named the unsolved problem: reliably reconciling SimpleFIN rows with the initial
  pending ones. The answer here is not new matching but the existing handover: a hold from a
  non-feed source retires onto its feed twin, and an unpairable hold is kept and flagged, never
  deleted. The parent spec's rule stands — each account has **one** source of posted history.

## Decisions (Lee, 2026-10-03)

1. **SimpleFIN for both cards** (over Chase-only, or keeping pastes).
2. **Apps Script push** (over a Vercel cron — Hobby cron is at most daily — or an inbound-mail
   service).

## Risks to watch

- Capital One via SimpleFIN dates by posting day and masks some descriptors
  (`ca5b063f` handled one). Alert-hold pairing relies on `DATE_TOLERANCE_DAYS` and the 7-day
  lost-hold window.
- Alert emails carry no transaction id, so duplicate-looking same-day same-amount charges rely on
  the Gmail message id for identity.
- Chase's SimpleFIN feed has not delivered Amazon holds; alert holds are what close that gap, and
  only once Lee turns the Chase alert on.

## Standards Applied

See `standards.md`.
