#!/usr/bin/env bash
# Stop hook: lint whatever an agent left dirty, once per turn, and report back to it.
#
# Fires when the agent finishes a turn — a natural "I meant to leave it this way"
# boundary, so it never trips over half-finished intermediate state the way a per-edit
# hook does. One eslint process for all changed files, rather than one per edit: linting
# is ~2s of fixed overhead (process spawn + TypeScript program construction) and only
# milliseconds of actual work, so batching is close to free.
#
# Exit 0 and the agent never hears about it. Exit 2 and Claude Code feeds stderr back
# for it to fix.
#
# Written for bash 3.2 — the version macOS ships. No mapfile, no associative arrays.
set -uo pipefail

input="$(cat)"
root="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
[ -n "$root" ] || root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Codex sends its session cwd in the hook payload; Claude Code exposes the project
# directory as an environment variable. Normalize either to the repository root so the
# changed-file paths passed to ESLint are stable even when the agent started in a subdir.
git_root="$(git -C "$root" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$git_root" ] && root="$git_root"

# Claude Code sets this when the agent is already running *because* this hook fired.
# Without the guard, a violation the agent can't fix would wake it forever.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "$root" || exit 0

# Everything uncommitted: tracked edits plus new files. Broader than "this turn", which
# is the point — anything left dirty is fair game, and the pre-commit hook would fail on
# it anyway. Cheaper to hear about it now.
files=()
while IFS= read -r f; do
  # Skip anything deleted or renamed away since the diff produced it.
  [ -n "$f" ] && [ -f "$f" ] && files+=("$f")
done < <(
  {
    git diff --name-only HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
    git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
  } 2>/dev/null | sort -u
)

[ ${#files[@]} -eq 0 ] && exit 0

output="$(npx eslint --max-warnings=0 --no-warn-ignored "${files[@]}" 2>&1)"
status=$?

[ $status -eq 0 ] && exit 0

{
  echo "ESLint found problems in files changed this session. Fix them before finishing:"
  echo
  echo "$output"
} >&2
exit 2
