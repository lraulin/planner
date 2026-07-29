#!/usr/bin/env bash
# PostToolUse hook: lint the file an agent just edited and report violations back to it.
#
# Runs async with rewake, so it never blocks the edit. A clean file exits 0 and the agent
# never hears about it — zero context cost. A dirty file exits 2, and Claude Code feeds
# stderr back as a system-reminder for the agent to act on.
#
# Deliberately per-file rather than whole-project: 2s vs 5s, and an agent mid-refactor
# should hear about the file it just touched, not every file it hasn't fixed yet.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
file="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')"

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0            # deleted or renamed out from under us
case "$file" in
  "$root"/*) ;;                     # only lint files inside this project
  *) exit 0 ;;
esac
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

# --no-warn-ignored: linting an ignored file emits a warning that --max-warnings=0
# would otherwise turn into a spurious failure.
output="$(cd "$root" && npx eslint --max-warnings=0 --no-warn-ignored "$file" 2>&1)"
status=$?

[ $status -eq 0 ] && exit 0

{
  echo "ESLint found problems in the file you just edited. Fix them before moving on:"
  echo
  echo "$output"
} >&2
exit 2
