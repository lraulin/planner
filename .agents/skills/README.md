# Agent OS workflows

Every workflow lives, in full, in `.agents/skills/<name>/SKILL.md`. No harness owns the
canonical copy; each location below is a pointer into it, so a change made in one place is a
change everywhere. When to use them, and the rules that apply in every session, are in
[`AGENTS.md`](../../AGENTS.md) ("Agent OS workflows"); this file is for whoever maintains the
wiring.

## How each harness finds them

- **Codex** reads `.agents/skills/` natively — invoke as `$shape-spec`, `$fix-bug`,
  `$inject-standards`, `$discover-standards`, `$index-standards`, `$plan-product`, or
  `$overnight`. Its user-local aliases, when installed, are `/prompts:<workflow>`.
- **Claude Code** reads the same folder through the directory symlink `.claude/skills` →
  `../.agents/skills`, which is what makes these auto-apply when relevant. The flat one-line
  shims in `.claude/commands/*.md` provide the explicit `/<name>` slash commands.
- **Grok** discovers the `.claude/commands/*.md` shims; it does not descend into
  subdirectories.
- **Copilot** reads `.github/prompts/*.prompt.md`, each a thin pointer to the same `SKILL.md`.
- **Cursor** reads `AGENTS.md` natively. Whether it discovers `.agents/skills/` has not been
  checked; until it has, point it at the `SKILL.md` by path.

`/overnight` must never be inferred: `allow_implicit_invocation: false` in its
`agents/openai.yaml` keeps Codex from doing so, and its skill description forbids it for the
rest.

## Adding a workflow

1. Write `.agents/skills/<name>/SKILL.md`, with `name` and a trigger-shaped `description` in
   its frontmatter.
2. Add the two pointers: `.claude/commands/<name>.md` and `.github/prompts/<name>.prompt.md`.
3. Add `agents/openai.yaml` if Codex needs display metadata.

Edit at the real `.agents/skills/...` path, never through `.claude/skills/...`: git refuses to
process a path "beyond a symbolic link", and the failure surfaces inside lint-staged's backup
step as an unexplained "git error" rather than as a bad path.
