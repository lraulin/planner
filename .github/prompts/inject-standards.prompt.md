---
description: "Use when standards should be pulled into context for coding, skill authoring, or spec shaping. Equivalent to /inject-standards in Claude/Grok."
argument-hint: "Optional standards path(s), e.g. api or api/response-format"
agent: "agent"
---

Follow the canonical workflow in [inject-standards](../../.agents/skills/inject-standards/SKILL.md).

Treat any extra text the user included with this prompt as explicit mode arguments.

Goal:

- Detect scenario (conversation, skill, or plan).
- Suggest or inject the right standards from agent-os/standards.
- Format output appropriately for the detected scenario.
