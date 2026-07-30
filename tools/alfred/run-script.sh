#!/bin/zsh
# Paste into Alfred "Run Script" (Language: /bin/zsh, input as argv).
# Expects workflow variables PLANNER_BASE_URL and PLANNER_AGENT_API_KEY.
# Optional: VERCEL_AUTOMATION_BYPASS_SECRET if the Vercel project has Deployment Protection.
# Alfred passes the keyword argument as $1.

set -euo pipefail

query="${1:-}"
if [[ -z "${query// /}" ]]; then
  echo "error: empty capture"
  exit 1
fi

if [[ -z "${PLANNER_BASE_URL:-}" || -z "${PLANNER_AGENT_API_KEY:-}" ]]; then
  echo "error: set PLANNER_BASE_URL and PLANNER_AGENT_API_KEY in workflow config"
  exit 1
fi

base="${PLANNER_BASE_URL%/}"
url="${base}/api/agent/capture"

name="$query"
note=""
if [[ "$query" == *"##"* ]]; then
  name="${query%%##*}"
  note="${query#*##}"
  name="${name#"${name%%[![:space:]]*}"}"
  name="${name%"${name##*[![:space:]]}"}"
  note="${note#"${note%%[![:space:]]*}"}"
  note="${note%"${note##*[![:space:]]}"}"
fi

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"
}

name_json=$(json_escape "$name")
if [[ -n "$note" ]]; then
  note_json=$(json_escape "$note")
  body="{\"name\":${name_json},\"note\":${note_json}}"
else
  body="{\"name\":${name_json}}"
fi

curl_args=(
  -sS -w "\n%{http_code}"
  -X POST "$url"
  -H "Authorization: Bearer ${PLANNER_AGENT_API_KEY}"
  -H "Content-Type: application/json"
)
if [[ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
  curl_args+=(-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}")
fi

response=$(curl "${curl_args[@]}" -d "$body") || {
  echo "error: network failure"
  exit 1
}

http_code=$(echo "$response" | tail -n1)
payload=$(echo "$response" | sed '$d')

if [[ "$http_code" != "200" ]]; then
  msg=$(python3 -c 'import json,sys
try:
  d=json.loads(sys.argv[1])
  err=d.get("error") or {}
  print(err.get("message") or ("HTTP "+sys.argv[2]))
except Exception:
  print("HTTP "+sys.argv[2])
' "$payload" "$http_code" 2>/dev/null || echo "HTTP $http_code")
  echo "error: $msg"
  exit 1
fi

python3 -c 'import json,sys
d=json.loads(sys.argv[1])
if not d.get("ok"):
  err=d.get("error") or {}
  print("error:", err.get("message") or "capture failed")
  sys.exit(1)
name=(d.get("data") or {}).get("node", {}).get("name") or "captured"
print("Captured:", name)
' "$payload"
