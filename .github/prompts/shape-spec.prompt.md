---
description: "Use when shaping a new feature spec in plan mode; creates an active spec folder under agent-os/specs and structures implementation tasks. Equivalent to /shape-spec in Claude/Grok."
argument-hint: "Feature scope (optional)"
agent: "plan"
---

Follow the canonical workflow in [shape-spec](../../.agents/skills/shape-spec/SKILL.md).

Treat any extra text the user included with this prompt as initial scope context.

Goal:

- Gather scope, visuals, references, product context, and standards.
- Produce a spec plan where Task 1 saves documentation and the final task freezes the spec.
- Keep spec lifecycle rules aligned with AGENTS.md.
- Stop once the spec folder is saved — hand off; implementation runs in a fresh session.
