#!/bin/zsh
# Capture one task into the planner Inbox via POST /api/agent/capture.
#
# Usage:
#   PLANNER_BASE_URL=… PLANNER_AGENT_API_KEY=… ./capture.sh "Task name"
#   ./capture.sh "Task name" "optional note"
#   ./capture.sh "Task name ## note from Achieve-style separator"
#
# Prints a short status line on stdout. Exit 0 on success, non-zero on failure.

set -euo pipefail

if [[ -z "${PLANNER_BASE_URL:-}" ]]; then
  echo "error: PLANNER_BASE_URL is not set" >&2
  exit 1
fi
if [[ -z "${PLANNER_AGENT_API_KEY:-}" ]]; then
  echo "error: PLANNER_AGENT_API_KEY is not set" >&2
  exit 1
fi

raw="${1:-}"
if [[ -z "${raw// /}" ]]; then
  echo "error: name is required" >&2
  exit 1
fi

note="${2:-}"
name="$raw"

# Achieve-style "name ## note" when a second argv is not provided.
if [[ -z "$note" && "$raw" == *"##"* ]]; then
  name="${raw%%##*}"
  note="${raw#*##}"
  # trim
  name="${name#"${name%%[![:space:]]*}"}"
  name="${name%"${name##*[![:space:]]}"}"
  note="${note#"${note%%[![:space:]]*}"}"
  note="${note%"${note##*[![:space:]]}"}"
fi

base="${PLANNER_BASE_URL%/}"
url="${base}/api/agent/capture"

# Build JSON without requiring jq for the request body.
json_escape() {
  # Escape backslash, double-quote, and control characters enough for a single line name.
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"
}

name_json=$(json_escape "$name")
if [[ -n "$note" ]]; then
  note_json=$(json_escape "$note")
  body="{\"name\":${name_json},\"note\":${note_json}}"
else
  body="{\"name\":${name_json}}"
fi

response=$(curl -sS -w "\n%{http_code}" -X POST "$url" \
  -H "Authorization: Bearer ${PLANNER_AGENT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$body") || {
  echo "error: request failed (network)" >&2
  exit 1
}

http_code=$(echo "$response" | tail -n1)
payload=$(echo "$response" | sed '$d')

if [[ "$http_code" != "200" ]]; then
  msg=$(python3 -c 'import json,sys
try:
  d=json.loads(sys.argv[1])
  err=d.get("error") or {}
  print(err.get("message") or sys.argv[1][:200])
except Exception:
  print(sys.argv[1][:200])
' "$payload" 2>/dev/null || echo "HTTP $http_code")
  echo "error: $msg" >&2
  exit 1
fi

ok=$(python3 -c 'import json,sys
d=json.loads(sys.argv[1])
print("true" if d.get("ok") else "false")
' "$payload")

if [[ "$ok" != "true" ]]; then
  msg=$(python3 -c 'import json,sys
d=json.loads(sys.argv[1])
err=d.get("error") or {}
print(err.get("message") or "capture failed")
' "$payload")
  echo "error: $msg" >&2
  exit 1
fi

display_name=$(python3 -c 'import json,sys
d=json.loads(sys.argv[1])
print((d.get("data") or {}).get("node", {}).get("name") or "captured")
' "$payload")

echo "Captured: ${display_name}"
