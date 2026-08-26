#!/usr/bin/env bash
# Run a gate quietly. Success prints nothing an agent has to read; failure prints enough
# to fix it. Written for bash 3.2, like .claude/hooks/lint-changed.sh.
set -uo pipefail
label="$1"; shift
out="$("$@" 2>&1)"; status=$?

# One success-path signal survives the silence: AGENTS.md tells agents that a green suite
# does not mean the database tests ran, and warnDatabaseSkipped() is the only place that
# says so (src/lib/testing/database.ts).
printf '%s\n' "$out" | grep -F '⚠  Skipping' || true

[ $status -eq 0 ] && exit 0
printf '%s\n' "$out" | tail -60 >&2
echo "$label failed — full output: $*" >&2
exit $status
