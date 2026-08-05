---
name: shape-spec
description: Shape a significant Planner feature into an active Agent OS spec before implementation. Use when the user invokes $shape-spec or explicitly asks to plan and save a feature spec.
---

# Shape Spec

1. Confirm Codex is in plan mode. If it is not, stop and ask the user to enter plan mode.
2. Read and follow the canonical workflow in `.claude/commands/agent-os/shape-spec.md`.
3. Treat text supplied alongside `$shape-spec` as the initial feature description.
4. Keep the generated spec active through implementation, then freeze it as the canonical workflow requires.
