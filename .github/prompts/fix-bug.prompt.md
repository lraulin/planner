---
description: "Use when a bug, error, or wrong behavior is reported and you are about to fix it. Investigates the root cause, checks whether the same pattern repeats, and sizes the fix deliberately. Equivalent to /fix-bug in Claude/Grok."
agent: "agent"
---

Follow the canonical workflow in [fix-bug](../../.agents/skills/fix-bug/SKILL.md).

Treat the text supplied with this prompt as the bug report.

Goal:

- Establish what the correct behavior is before calling it a bug.
- Reproduce or fully trace the failure path.
- Name the true root cause, not the line that threw.
- Search for the same pattern elsewhere, and report what you found either way.
- Take the minimal fix when the cause is local; a tight refactor when it repeats; ask
  before anything larger.
- Never paper over — no swallowed catch, no `as any`, no defensive fallback for a value
  that should not be missing.
- Add a regression test that fails on the plausible mistake, per
  `agent-os/standards/development/testing.md`.
- Verify, including `npm run smoke` if anything under `src/app/**` changed.
