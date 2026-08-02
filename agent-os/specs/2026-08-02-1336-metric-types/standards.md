# Standards for Metric types

**Status: frozen / complete** (2026-08-02)

## development/testing

Pure logic in `src/lib/**` with adjacent unit tests. Aggregation (latest vs sum vs running
sum) is the tripwire surface — wrong answers look plausible. No React component tests.
Integration tests already cover metric mutations/cross-user; only add more if mutation
validation of `metricType` needs a DB case.

## components/drawer-pattern

Metric form Type is a draft field: Cancel / Save / Save & Close; unsaved-changes on leave.
Do not auto-save type independently of the rest of the form.

## components/ux-principles

Progressive disclosure: three-option select plus a one-line helper when useful. No modal
wizard for type choice. List Last Value already communicates type effect without a new
column in this slice.
