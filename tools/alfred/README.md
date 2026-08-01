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

| Variable                          | Example                       | Notes                                                                    |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `PLANNER_BASE_URL`                | `https://your-app.vercel.app` | Production origin, no trailing slash                                     |
| `PLANNER_AGENT_API_KEY`           | long secret                   | **Same value as Vercel** `PLANNER_AGENT_API_KEY` (not only `.env.local`) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | from Vercel project settings  | Only if Deployment Protection / Vercel Auth is on; mark Don’t Export     |

`.env.local` is for `npm run dev` only. Alfred talking to production needs secrets that
exist **on the Vercel project** (and the bypass secret if protection is enabled).

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

## Production (real app) setup

1. **Vercel env** (Project → Settings → Environment Variables → Production):
   - `PLANNER_AGENT_API_KEY` = the same long secret you put in Alfred
   - Redeploy after adding it if the running deployment was created without it.

2. **Deployment Protection** currently returns `401 Protected deployment` for bare
   curl/Alfred hits when **Vercel Authentication** is on. Pick one:

   - **A (simplest for a personal app):** Project → Settings → Deployment Protection →
     set **Vercel Authentication** to **Disabled** for Production (Preview can stay
     protected). Humans still sign in via the app’s Better Auth `/login`.
   - **B (keep protection):** Project → Settings → Deployment Protection →
     **Protection Bypass for Automation** → enable and copy the secret. Put it in
     Alfred as `VERCEL_AUTOMATION_BYPASS_SECRET` (Don’t Export). The scripts send
     `x-vercel-protection-bypass`.

3. **Alfred variables** for production:

   ```text
   PLANNER_BASE_URL=https://planner-lee-5344.vercel.app
   PLANNER_AGENT_API_KEY=<same as Vercel>
   VERCEL_AUTOMATION_BYPASS_SECRET=<only if option B>
   ```

4. Re-paste `run-script.sh` into Alfred if you built the workflow before the bypass
   header was added.

### CLI check against production

```sh
export PLANNER_BASE_URL="https://planner-lee-5344.vercel.app"
export PLANNER_AGENT_API_KEY="…"          # must match Vercel Production
# only if protection stays on:
export VERCEL_AUTOMATION_BYPASS_SECRET="…"

./tools/alfred/capture.sh "prod CLI test"
```

Success prints `Captured: prod CLI test`. Open the **production** site (not localhost)
and look under **Inbox**.

## Security

- Do **not** put the API key or bypass secret in a committed workflow export.
- Prefer workflow variables over hardcoding; check **Don’t Export** on both secrets.
- The agent key maps to one account — whichever `PLANNER_AGENT_USER_EMAIL` names on the
  deployment being called (see `docs/agent-api.md`). The bypass
  secret is equally sensitive — anyone with it can hit the protected deployment.

## Troubleshooting

| Symptom                                                 | Check                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `Protected deployment` / Vercel 401                     | Protection on and bypass missing/wrong — see Production setup  |
| `unauthorized` (our API)                                | Key mismatch: Alfred vs **Vercel** `PLANNER_AGENT_API_KEY`     |
| `PLANNER_AGENT_API_KEY is not configured on the server` | Key only in `.env.local`; add to Vercel and redeploy           |
| Connection refused                                      | Local URL with no `npm run dev`                                |
| Captured but not in the UI                              | Looking at localhost while Alfred hits production (or reverse) |
| Task at outline root, not under Inbox                   | You called `create_node` instead of `capture`                  |
