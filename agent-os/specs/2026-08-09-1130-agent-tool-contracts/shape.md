# Agent tool contracts — Shaping Notes

**Status: frozen / complete** (2026-08-09)

## Problem

The current API is useful but shaped like a conventional hand-written endpoint surface.
The same contract is restated in a name array, dispatch switch, parser code, Planner docs,
and consumer docs. Those copies cannot prove completeness or strictness, and they have
already drifted. An agent therefore receives too much low-signal material while still
lacking reliable selection, truncation, and retry cues.

## Desired outcome

An agent starts with a focused set of outcome-oriented tools, discovers a domain only when
needed, gets the same schemas the server enforces, receives compact data sufficient for its
next decision, and can recover from malformed input or retry explicitly safe writes without
guessing.

## Architecture

The registry is an application-layer contract, not a transport implementation. The HTTP
route remains a thin authenticated envelope around registry dispatch. Existing domain
query and mutation modules continue to own database behavior. JSON Schema, docs, future MCP
definitions, and test inventories are projections of this one registry.

Strict schemas sit at the general boundary. Existing domain parsers may retain cross-field
and business validation that JSON Schema cannot express cleanly. Output validation runs at
dispatch so registry drift fails loudly before reaching a consumer.

## Tool exposure

- `core`: the small default set needed to orient, find, inspect, capture, and update work.
- `domain`: schedule, weekly planning, notes, and metrics tools loaded on demand.
- `legacy`: stable compatibility names that remain callable but are hidden by default and
  point to their preferred replacement.

The core set is `list_tools`, `describe_tool`, `get_context`, `search_nodes`, `get_node`,
`create_node`, `capture_inbox`, `update_node`, `search_notes`, and `get_note`.

## Safety and retry boundaries

Read, write, destructive, confirmation, and retry properties are explicit metadata. A
natural-key retry is safe only when a per-user uniqueness constraint and conflict-safe
domain write enforce it. Appointment writes remain unsafe to retry because Google Calendar
can be changed before a local write finishes.

The weekly-plan batch is atomic because a partial review stage is worse than a rejected
stage. The tool validates ownership of the plan and every node before committing any row.

## Compatibility boundaries

Existing URLs, auth, envelopes, names, and success fields remain. New pagination and
`created` fields are additive. Strict rejection of unknown fields is the deliberate behavior
change: it converts plausible silent failure into a correctable error.

## Visuals

No visual artifact is needed. This work changes an API contract, domain writes, generated
documentation, and agent instructions without changing Planner UI layout.
