---
name: fix-bug
description: Investigate a reported bug to its root cause before fixing it, and size the fix deliberately. Use when the user invokes $fix-bug, or reports an error, a crash, or behavior that is wrong.
---

# Fix Bug

1. Read and follow the canonical workflow in `.claude/commands/agent-os/fix-bug.md`.
2. Treat text supplied alongside `$fix-bug` as the bug report.
3. Do not edit before you can state the root cause in a sentence, and do not stop at the
   first site if the same pattern appears elsewhere.
4. Minimal fix when the cause is local; a tight, single-cause refactor when it repeats;
   ask before anything larger.
