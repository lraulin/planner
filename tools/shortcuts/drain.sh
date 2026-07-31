#!/bin/zsh
# Post a batch to POST /api/agent/capture, the way the Reminders Shortcut does.
#
# Exists so the endpoint can be exercised from a terminal before building anything in the
# Shortcuts editor — when a drain misbehaves, this is how you tell whether the problem is
# the server or the Shortcut.
#
# Usage:
#   PLANNER_BASE_URL=… PLANNER_AGENT_API_KEY=… ./drain.sh "First task" "Second task"
#   ./drain.sh                                  # posts two fixed sample items, twice
#
# With no arguments it posts a sample batch and then posts it again, which is the whole
# point of the feature: the second run should report 0 created, 2 skipped.

set -euo pipefail

if [[ -z "${PLANNER_BASE_URL:-}" ]]; then
  echo "error: PLANNER_BASE_URL is not set" >&2
  exit 1
fi
if [[ -z "${PLANNER_AGENT_API_KEY:-}" ]]; then
  echo "error: PLANNER_AGENT_API_KEY is not set" >&2
  exit 1
fi

base="${PLANNER_BASE_URL%/}"
url="${base}/api/agent/capture"

# A stable id per name, so re-running this script is a dedupe test rather than a way to
# fill the Inbox with junk. The real Shortcut uses "<creation date>|<name>".
build_body() {
  python3 -c '
import json, sys
names = sys.argv[1:]
items = [{"name": n, "externalId": "drain.sh|" + n} for n in names]
print(json.dumps({"externalSource": "apple_reminders", "items": items}))
' "$@"
}

post() {
  local body="$1"
  local curl_args=(
    -sS -w "\n%{http_code}"
    -X POST "$url"
    -H "Authorization: Bearer ${PLANNER_AGENT_API_KEY}"
    -H "Content-Type: application/json"
  )
  # Same Deployment Protection story as the Alfred workflow: without this, production
  # answers 401 "Protected deployment" before our Bearer auth ever runs.
  if [[ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
    curl_args+=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}")
  fi

  local response
  response=$(curl "${curl_args[@]}" -d "$body") || {
    echo "error: request failed (network)" >&2
    exit 1
  }

  local http_code payload
  http_code=$(echo "$response" | tail -n1)
  payload=$(echo "$response" | sed '$d')

  if [[ "$http_code" != "200" ]]; then
    python3 -c '
import json, sys
try:
    err = (json.loads(sys.argv[1]).get("error") or {})
    print("error: " + (err.get("message") or sys.argv[1][:200]), file=sys.stderr)
except Exception:
    print("error: HTTP " + sys.argv[2] + " " + sys.argv[1][:200], file=sys.stderr)
' "$payload" "$http_code"
    exit 1
  fi

  python3 -c '
import json, sys
d = json.loads(sys.argv[1])
if not d.get("ok"):
    print("error: " + ((d.get("error") or {}).get("message") or "capture failed"), file=sys.stderr)
    raise SystemExit(1)
data = d.get("data") or {}
print("created %s, skipped %s" % (data.get("created"), data.get("skipped")))
' "$payload"
}

if [[ $# -gt 0 ]]; then
  post "$(build_body "$@")"
  exit 0
fi

body=$(build_body "Sample: call the dentist" "Sample: buy milk")
echo "first run:  $(post "$body")"
echo "second run: $(post "$body")"
echo
echo "The second run should say 'created 0, skipped 2'. If it says 'created 2', dedupe is broken."
