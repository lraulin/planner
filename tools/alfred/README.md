# Alfred → Planner Inbox

Capture one task into the planner **Inbox** from Alfred on macOS, without opening the
browser. Uses `POST /api/agent/capture` (Bearer API key).

Spec: `agent-os/specs/2026-07-30-1323-alfred-inbox-capture/`.

## Prerequisites

1. Planner deployed or running locally (`npm run dev` → default `http://localhost:3047`).
2. `PLANNER_AGENT_API_KEY` set on the server (`.env.local` and/or Vercel).
3. [Alfred](https://www.alfredapp.com/) with the **Powerpack** (Script Filter / Run Script).

## Quick path (no workflow import)

If you only need a global hotkey later, you can already capture with a shell snippet:

```sh
export PLANNER_BASE_URL="https://your-app.vercel.app"   # or http://localhost:3047
export PLANNER_AGENT_API_KEY="…"

./tools/alfred/capture.sh "Call the dentist"
```

Or:

```sh
curl -sS -X POST "$PLANNER_BASE_URL/api/agent/capture" \
  -H "Authorization: Bearer $PLANNER_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Call the dentist"}'
```

Success: `{"ok":true,"data":{"node":{…},"parentId":"…","createdIds":["…"]}}`.

## Alfred workflow (recommended)

### 1. Create the workflow

1. Alfred Preferences → **Workflows** → `+` → **Blank Workflow**.
2. Name: **Planner Capture**. Bundle id e.g. `com.leeraulin.planner.capture`.

### 2. Workflow variables (secrets stay here)

In the workflow’s **\[x\]** configuration (or right-click workflow → **Configure…**):

| Variable                | Example                       | Notes                                  |
| ----------------------- | ----------------------------- | -------------------------------------- |
| `PLANNER_BASE_URL`      | `https://your-app.vercel.app` | No trailing slash                      |
| `PLANNER_AGENT_API_KEY` | long secret                   | Same value as server env; never commit |

### 3. Keyword → Run Script

1. Add object **Inputs → Keyword**.
   - Keyword: `pin` (change if you prefer)
   - Argument: **required**
   - Title: `Capture to Planner Inbox`
   - Subtitle: `{query}`
2. Connect to **Actions → Run Script**.
   - Language: `/bin/zsh`
   - With input as **argv**
   - Script: paste the contents of [`run-script.sh`](./run-script.sh) (or point at that
     file if you keep the repo path stable).

### 4. Notification (optional but useful)

Connect the Run Script’s output to **Outputs → Post Notification**:

- Title: `{var:notif_title}` or hardcode `Planner`
- Text: `{query}` if your script echoes a short message — or use the script’s stdout as
  the notification body depending on Alfred version.

The script in this folder prints a one-line success or error message on stdout for that
purpose, and exits non-zero on failure so Alfred can show failure if configured.

### 5. Try it

1. Alfred → `pin Call the dentist` → Enter.
2. Open the planner Outline: **Inbox** should have **Call the dentist**.

## Script Filter alternative

For live feedback while typing, use a **Script Filter** keyword instead of Keyword + Run
Script, and action the single item on Enter. The POST body is the same; see
`capture.sh` for the HTTP call.

## Behaviour notes

- **One name at a time.** Multi-line lists, indentation, and optional fields stay in the
  in-app capture box (`c` key).
- **Inbox, not root.** This hits `/api/agent/capture`, not `create_node`. Root-level
  `create_node` creates an unparented task on purpose and is not GTD capture.
- **Optional note:** `capture.sh` accepts a second argument as the note, or
  `NAME ## note` if you prefer Achieve-style inline notes (script supports `##` split).

## Security

- Do **not** put the API key in a committed workflow export that you share publicly.
- Prefer workflow variables over hardcoding in the script.
- The key maps to the single owner user (see `docs/agent-api.md`); treat it like a
  password.

## Troubleshooting

| Symptom                               | Check                                               |
| ------------------------------------- | --------------------------------------------------- |
| `unauthorized`                        | Key mismatch between Alfred variable and server env |
| `internal` / empty tools              | `PLANNER_AGENT_API_KEY` unset on the server         |
| Connection refused                    | Base URL, VPN, or local dev server not running      |
| Task at outline root, not under Inbox | You called `create_node` instead of `capture`       |
