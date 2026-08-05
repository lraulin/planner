---
description: "Use when extracting recurring codebase patterns into concise standards files under agent-os/standards. Equivalent to /discover-standards in Claude/Grok."
argument-hint: "Focus area (optional), e.g. api or database"
agent: "agent"
---

Follow the canonical workflow in [discover-standards](../../.claude/commands/agent-os/discover-standards.md).

Treat any extra text the user included with this prompt as the requested focus area.

Goal:

- Identify repeatable patterns.
- Ask concise clarifying questions for rationale and exceptions.
- Create or update standards files and then update agent-os/standards/index.yml.
